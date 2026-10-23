-- ============================================================================
-- 031_apply_alerts_digest.sql
-- CONVENIENCE BUNDLE: applies 027 -> 028 -> 030 in the correct order in one
-- paste. Use this when the live project is missing the missed-clock-in alert
-- chain, the email outbox, or the daily digest (i.e. 027+ were never run).
-- Every statement is idempotent — safe to run more than once.
--
-- Includes the fix for resolve_alert_recipients(): the manager chain must
-- return employees.user_id (the auth user id), not employees.id, because
-- notifications.user_id references auth.users(id). Also fixes the
-- notification dedup guard to match on the link (date-embedded) rather than
-- created_at, so backfills/re-runs do not duplicate notifications.
--
-- NOTE: 026_workforce_hierarchy.sql on the live project predates a seniority
-- fix. If you want promotions/demotions to re-seed seniority correctly, re-run
-- supabase/migrations/026_workforce_hierarchy.sql as well (it is idempotent).
-- ============================================================================

-- ============================================================================
-- 027_workforce_alerts.sql
-- Orange SL Workforce Attendance — 08:45 missed-clock-in alerts
--
-- When someone fails to clock in by the HR cutoff (default 08:45), the
-- following recipients are notified:
--   * the HR director(s) — every active profile with role hr_admin / super_admin
--   * the individual's line manager, then that manager's manager, continuing
--     UP the chain until it reaches a Director or the CEO.
--
-- Delivery happens in two places:
--   * in-app notifications (existing `notifications` table) for everyone
--   * email rows queued in `email_outbox`, drained by the protected
--     Next.js cron route /api/cron/cutoff-report (Resend provider)
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Email outbox — one row per recipient per alert (dedup guarded by a unique key)
-- ---------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id            uuid primary key default gen_random_uuid(),
  to_email      text not null,
  subject       text not null,
  body_html     text not null,
  body_text     text,
  category      text not null default 'attendance.missed_cutoff',
  reference     text,                 -- e.g. employee_id:work_date (dedup key)
  status        text not null default 'queued'
                check (status in ('queued','sent','failed','skipped')),
  attempts      integer not null default 0,
  last_error    text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- Same alert to the same address on the same reference is only ever queued once.
create unique index if not exists email_outbox_dedup_idx
  on public.email_outbox(category, reference, to_email);
create index if not exists email_outbox_status_idx
  on public.email_outbox(status, created_at);

-- ---------------------------------------------------------------------------
-- Resolve the alert chain for one employee.
-- Returns rows (email, full_name, capacity) top-down: 'hr_director',
-- 'line_manager', 'senior_manager', 'director', 'ceo'.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_alert_recipients(p_employee_id uuid)
returns table (profile_id uuid, email text, full_name text, rank public.employee_rank, capacity text)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_emp record;
  v_manager_id uuid;
  v_guard integer := 0;
begin
  select e.id, e.manager_id, e.rank into v_emp
  from public.employees e where e.id = p_employee_id;
  if not found then
    return;
  end if;

  -- 1) HR directors — every active HR admin / super admin with an email.
  return query
    select p.id, p.email, coalesce(p.full_name, p.email),
           'director'::public.employee_rank, 'hr_director'::text
    from public.profiles p
    where p.role in ('super_admin','hr_admin')
      and p.is_active
      and p.email is not null;

  -- 2) Walk the line-manager chain upward.
  v_manager_id := v_emp.manager_id;
  while v_manager_id is not null and v_guard < 12 loop
    v_guard := v_guard + 1;

    -- Return the auth user id (notifications.user_id -> auth.users), not the
    -- employee row id. Managers without a linked login get profile_id NULL,
    -- which the notification insert filters out (they still get the email).
    return query
      select e.user_id, e.work_email, e.full_name, e.rank,
             case
               when e.rank = 'ceo' then 'ceo'
               when e.rank = 'director' then 'director'
               when e.rank = 'senior_manager' then 'senior_manager'
               else 'line_manager'
             end::text
      from public.employees e
      where e.id = v_manager_id
        and e.work_email is not null
        and e.employment_status = 'active';

    -- Stop once we have notified a Director or the CEO.
    select case when m.rank in ('director','ceo') then null else m.manager_id end
      into v_manager_id
    from public.employees m
    where m.id = v_manager_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Queue missed-clock-in alerts for a work date (defaults to today).
-- Reads attendance_records.cutoff_status which is frozen by process_daily_cutoff.
-- Idempotent thanks to the email_outbox dedup index + notifications not re-sent
-- on repeat runs (report regeneration is guarded separately).
-- ---------------------------------------------------------------------------
create or replace function public.queue_missed_clockin_alerts(p_date date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_settings record;
  v_date date;
  v_emp record;
  v_rec record;
  v_total integer := 0;
  v_queued integer := 0;
begin
  select * into v_settings from public.org_settings s where s.id = 1;
  v_date := coalesce(p_date, (now() at time zone v_settings.timezone)::date);

  for v_rec in
    select a.employee_id
    from public.attendance_records a
    where a.work_date = v_date
      and a.cutoff_status = 'absent'
  loop
    v_total := v_total + 1;

    select e.id, e.full_name, e.employee_no, e.job_title, e.rank,
           e.work_email, b.name as branch_name
      into v_emp
    from public.employees e
    left join public.branches b on b.id = e.branch_id
    where e.id = v_rec.employee_id;

    -- In-app notification to each resolved recipient (skip if already sent).
    insert into public.notifications (user_id, title, body, link)
    select distinct r.profile_id,
           'Missed clock-in — ' || v_emp.full_name,
           v_emp.full_name || ' (' || v_emp.employee_no || ') did not clock in by ' ||
           to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' on ' ||
           to_char(v_date, 'Dy DD Mon YYYY') || '.',
           '/hr/attendance?date=' || v_date || '&cutoff=absent'
    from public.resolve_alert_recipients(v_emp.id) r
    where r.profile_id is not null
      and not exists (
        select 1 from public.notifications n
        where n.user_id = r.profile_id
          and n.title = 'Missed clock-in — ' || v_emp.full_name
          -- Match on the link, which embeds the work date. created_at would
          -- break re-runs/backfills because the notification is created on the
          -- day the alert runs, not necessarily on the work date itself.
          and n.link = '/hr/attendance?date=' || v_date || '&cutoff=absent'
      );

    -- Email queue (deduped by category + reference + address).
    insert into public.email_outbox (to_email, subject, body_html, body_text, category, reference)
    select distinct r.email,
           'Missed clock-in: ' || v_emp.full_name || ' — ' || to_char(v_date, 'DD Mon YYYY'),
           '<p>' || v_emp.full_name || ' (<strong>' || v_emp.employee_no || '</strong>, ' ||
             coalesce(v_emp.job_title, v_emp.rank::text) || ') did not clock in by ' ||
             to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' on ' ||
             to_char(v_date, 'Dy, DD Mon YYYY') || '.</p>' ||
             '<p>Branch: ' || coalesce(v_emp.branch_name, '—') || '<br/>' ||
             'You are receiving this as <strong>' || r.capacity || '</strong>.</p>',
           v_emp.full_name || ' (' || v_emp.employee_no || ') did not clock in by ' ||
             to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' on ' ||
             to_char(v_date, 'DD Mon YYYY') || '.',
           'attendance.missed_cutoff',
           v_emp.id::text || ':' || v_date
    from public.resolve_alert_recipients(v_emp.id) r
    where r.email is not null
    on conflict (category, reference, to_email) do nothing;

    v_queued := v_queued + 1;
  end loop;

  perform public.log_audit('attendance.queue_missed_alerts', 'daily_attendance_reports', null,
    jsonb_build_object('work_date', v_date, 'absent_employees', v_total));

  return jsonb_build_object(
    'success', true,
    'work_date', v_date,
    'absent_employees', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Drain helpers used by the Next.js cron route (service role only).
-- ---------------------------------------------------------------------------
create or replace function public.claim_queued_emails(p_limit integer default 100)
returns setof public.email_outbox
language sql security definer
set search_path = public
as $$
  select * from public.email_outbox
  where status = 'queued'
  order by created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.mark_email_sent(p_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.email_outbox
  set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null
  where id = p_id;
$$;

create or replace function public.mark_email_failed(p_id uuid, p_error text)
returns void
language sql security definer
set search_path = public
as $$
  update public.email_outbox
  set status = case when attempts >= 4 then 'failed' else 'queued' end,
      attempts = attempts + 1,
      last_error = p_error
  where id = p_id;
$$;

-- ============================================================================
-- 028_workforce_alerts_rls.sql
-- RLS + grants for the email outbox.
--
-- NOTE: alert *queueing* is triggered by the protected Next.js cron route
-- (/api/cron/cutoff-report) which calls process_daily_cutoff() first, then
-- queue_missed_clockin_alerts(). Keeping it in the route means 021 stays the
-- single source of truth for the report computation and this migration is
-- purely additive.
--
-- Idempotent: safe to run more than once.
-- ============================================================================
-- ---------------------------------------------------------------------------
-- email_outbox: HR may read; only security-definer functions / service role
-- ever write.
-- ---------------------------------------------------------------------------
alter table public.email_outbox enable row level security;
drop policy if exists email_outbox_select on public.email_outbox;
create policy email_outbox_select on public.email_outbox for
select using (public.is_hr());
grant select,
  insert,
  update,
  delete on public.email_outbox to service_role;
grant select on public.email_outbox to authenticated;
-- Clients never get write grants on the outbox.
revoke
insert,
  update,
  delete on public.email_outbox
from authenticated;
-- ---------------------------------------------------------------------------
-- Realtime: surface queued/sent mail to the HR console.
-- ---------------------------------------------------------------------------
do $$ begin if exists (
  select 1
  from pg_publication
  where pubname = 'supabase_realtime'
) then if not exists (
  select 1
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'email_outbox'
) then alter publication supabase_realtime
add table public.email_outbox;
end if;
end if;
end $$;
-- ---------------------------------------------------------------------------
-- Internal helpers stay server-only; the outbox drain functions are for the
-- service role (cron route) only.
-- ---------------------------------------------------------------------------
revoke execute on function public.resolve_alert_recipients(uuid)
from public,
  anon,
  authenticated;
revoke execute on function public.queue_missed_clockin_alerts(date)
from public,
  anon,
  authenticated;
revoke execute on function public.sync_employee_rank_fields()
from public,
  anon,
  authenticated;
revoke execute on function public.claim_queued_emails(integer)
from public,
  anon,
  authenticated;
revoke execute on function public.mark_email_sent(uuid)
from public,
  anon,
  authenticated;
revoke execute on function public.mark_email_failed(uuid, text)
from public,
  anon,
  authenticated;
grant execute on function public.claim_queued_emails(integer) to service_role;
grant execute on function public.mark_email_sent(uuid) to service_role;
grant execute on function public.mark_email_failed(uuid, text) to service_role;
-- ============================================================================
-- 030_daily_digest.sql
-- Daily 08:45 attendance digest emailed to HR directors after the cutoff.
--
-- Builds an HTML summary from public.daily_attendance_reports.counts (produced
-- by process_daily_cutoff) and queues one row per HR director in the existing
-- public.email_outbox table, deduped by (category, reference, to_email).
-- The cron route drains the outbox like any other email.
--
-- Idempotent: safe to run more than once and safe to re-run for a date.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A configured destination for the digest (falls back to HR directors).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_digest_recipients()
returns table (email text, full_name text)
language sql stable security definer
set search_path = public
as $$
  select p.email, coalesce(p.full_name, p.email)
  from public.profiles p
  where p.role in ('super_admin','hr_admin')
    and p.is_active
    and p.email is not null
    and p.email <> '';
$$;

-- ---------------------------------------------------------------------------
-- Queue the daily digest for a work date (defaults to today).
-- ---------------------------------------------------------------------------
create or replace function public.queue_daily_digest(p_date date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_settings record;
  v_date date;
  v_report record;
  v_counts jsonb;
  v_branch_rows text := '';
  v_branch jsonb;
  v_recipients integer := 0;
  v_subject text;
  v_html text;
  v_text text;
  v_rate integer;
begin
  select * into v_settings from public.org_settings s where s.id = 1;
  v_date := coalesce(p_date, (now() at time zone v_settings.timezone)::date);

  select * into v_report
  from public.daily_attendance_reports r
  where r.report_date = v_date;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_report', 'work_date', v_date);
  end if;

  v_counts := coalesce(v_report.counts, '{}'::jsonb);
  v_rate := case
    when coalesce((v_counts->>'scheduled')::int, 0) > 0
    then round(100.0 * coalesce((v_counts->>'present')::int, 0) / (v_counts->>'scheduled')::int)
    else 0
  end;

  -- Per-branch table rows.
  for v_branch in
    select elem from jsonb_array_elements(coalesce(v_counts->'by_branch', '[]'::jsonb)) as t(elem)
  loop
    v_branch_rows := v_branch_rows ||
      '<tr>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">' ||
          coalesce(v_branch->>'name', '—') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">' ||
          coalesce(v_branch->>'scheduled', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;">' ||
          coalesce(v_branch->>'present', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#f59e0b;">' ||
          coalesce(v_branch->>'late', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;">' ||
          coalesce(v_branch->>'absent_at_cutoff', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#2563eb;">' ||
          coalesce(v_branch->>'on_leave', '0') || '</td>' ||
      '</tr>';
  end loop;

  v_subject := 'Attendance digest — ' || to_char(v_date, 'Dy, DD Mon YYYY') ||
               ' (' || v_rate || '% on time)';

  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1d29;max-width:640px;">' ||
    '<h2 style="color:#ff7900;margin:0 0 4px;">Orange SL — Daily Attendance</h2>' ||
    '<p style="margin:0 0 16px;color:#6b7280;">' || to_char(v_date, 'Dy, DD Mon YYYY') ||
      ' · cutoff ' || to_char(v_report.cutoff_time, 'HH24:MI') || '</p>' ||
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">' ||
      '<tr>' ||
        '<td style="padding:8px 10px;background:#fff7ed;border-radius:8px 0 0 8px;"><b>' ||
          coalesce(v_counts->>'scheduled','0') || '</b><br/>Scheduled</td>' ||
        '<td style="padding:8px 10px;background:#f0fdf4;color:#16a34a;"><b>' ||
          coalesce(v_counts->>'present','0') || '</b><br/>On time</td>' ||
        '<td style="padding:8px 10px;background:#fffbeb;color:#f59e0b;"><b>' ||
          coalesce(v_counts->>'late','0') || '</b><br/>Late</td>' ||
        '<td style="padding:8px 10px;background:#fef2f2;color:#dc2626;"><b>' ||
          coalesce(v_counts->>'absent_at_cutoff','0') || '</b><br/>Absent</td>' ||
        '<td style="padding:8px 10px;background:#eff6ff;color:#2563eb;border-radius:0 8px 8px 0;"><b>' ||
          coalesce(v_counts->>'on_leave','0') || '</b><br/>On leave</td>' ||
      '</tr>' ||
    '</table>' ||
    '<h3 style="margin:0 0 8px;font-size:14px;">By branch</h3>' ||
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' ||
      '<thead><tr>' ||
        '<th style="text-align:left;padding:6px 10px;background:#1a1d29;color:#fff;">Branch</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Scheduled</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Present</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Late</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Absent</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Leave</th>' ||
      '</tr></thead><tbody>' ||
      coalesce(nullif(v_branch_rows, ''), '<tr><td colspan="6" style="padding:10px;">No branch data.</td></tr>') ||
    '</tbody></table>' ||
    '<p style="margin:16px 0 0;color:#6b7280;font-size:12px;">' ||
      'Reported as at ' || to_char(v_report.generated_at, 'YYYY-MM-DD HH24:MI') || ' UTC.</p>' ||
    '</div>';

  v_text := 'Orange SL attendance — ' || to_char(v_date, 'Dy, DD Mon YYYY') || E'\n' ||
            'Scheduled: ' || coalesce(v_counts->>'scheduled','0') ||
            ' · On time: ' || coalesce(v_counts->>'present','0') ||
            ' · Late: ' || coalesce(v_counts->>'late','0') ||
            ' · Absent: ' || coalesce(v_counts->>'absent_at_cutoff','0') ||
            ' · On leave: ' || coalesce(v_counts->>'on_leave','0');

  insert into public.email_outbox (to_email, subject, body_html, body_text, category, reference)
  select r.email, v_subject, v_html, v_text, 'attendance.daily_digest', v_date::text
  from public.resolve_digest_recipients() r
  on conflict (category, reference, to_email) do nothing;

  get diagnostics v_recipients = row_count;

  perform public.log_audit('attendance.queue_daily_digest', 'daily_attendance_reports', null,
    jsonb_build_object('work_date', v_date, 'recipients', v_recipients, 'on_time_rate', v_rate));

  return jsonb_build_object(
    'success', true,
    'work_date', v_date,
    'recipients', v_recipients,
    'on_time_rate', v_rate,
    'counts', v_counts - 'by_branch'
  );
end;
$$;

-- Internal helper — not callable by API roles.
revoke execute on function public.resolve_digest_recipients() from public, anon, authenticated;
revoke execute on function public.queue_daily_digest(date) from public, anon, authenticated;
grant execute on function public.queue_daily_digest(date) to service_role;
