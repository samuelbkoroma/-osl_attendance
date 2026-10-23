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
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body_html text not null,
  body_text text,
  category text not null default 'attendance.missed_cutoff',
  reference text,
  -- e.g. employee_id:work_date (dedup key)
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
-- Same alert to the same address on the same reference is only ever queued once.
create unique index if not exists email_outbox_dedup_idx on public.email_outbox(category, reference, to_email);
create index if not exists email_outbox_status_idx on public.email_outbox(status, created_at);
-- ---------------------------------------------------------------------------
-- Resolve the alert chain for one employee.
-- Returns rows (email, full_name, capacity) top-down: 'hr_director',
-- 'line_manager', 'senior_manager', 'director', 'ceo'.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_alert_recipients(p_employee_id uuid) returns table (
    profile_id uuid,
    email text,
    full_name text,
    rank public.employee_rank,
    capacity text
  ) language plpgsql stable security definer
set search_path = public as $$
declare v_emp record;
v_manager_id uuid;
v_guard integer := 0;
begin
select e.id,
  e.manager_id,
  e.rank into v_emp
from public.employees e
where e.id = p_employee_id;
if not found then return;
end if;
-- 1) HR directors — every active HR admin / super admin with an email.
return query
select p.id,
  p.email,
  coalesce(p.full_name, p.email),
  'director'::public.employee_rank,
  'hr_director'::text
from public.profiles p
where p.role in ('super_admin', 'hr_admin')
  and p.is_active
  and p.email is not null;
-- 2) Walk the line-manager chain upward.
v_manager_id := v_emp.manager_id;
while v_manager_id is not null
and v_guard < 12 loop v_guard := v_guard + 1;
-- Return the auth user id (notifications.user_id -> auth.users), not the
-- employee row id. Managers without a linked login get profile_id NULL,
-- which the notification insert filters out (they still get the email).
return query
select e.user_id,
  e.work_email,
  e.full_name,
  e.rank,
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
select case
    when m.rank in ('director', 'ceo') then null
    else m.manager_id
  end into v_manager_id
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
create or replace function public.queue_missed_clockin_alerts(p_date date default null) returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_settings record;
v_date date;
v_emp record;
v_rec record;
v_total integer := 0;
v_queued integer := 0;
begin
select * into v_settings
from public.org_settings s
where s.id = 1;
v_date := coalesce(
  p_date,
  (now() at time zone v_settings.timezone)::date
);
for v_rec in
select a.employee_id
from public.attendance_records a
where a.work_date = v_date
  and a.cutoff_status = 'absent' loop v_total := v_total + 1;
select e.id,
  e.full_name,
  e.employee_no,
  e.job_title,
  e.rank,
  e.work_email,
  b.name as branch_name into v_emp
from public.employees e
  left join public.branches b on b.id = e.branch_id
where e.id = v_rec.employee_id;
-- In-app notification to each resolved recipient (skip if already sent).
insert into public.notifications (user_id, title, body, link)
select distinct r.profile_id,
  'Missed clock-in — ' || v_emp.full_name,
  v_emp.full_name || ' (' || v_emp.employee_no || ') did not clock in by ' || to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' on ' || to_char(v_date, 'Dy DD Mon YYYY') || '.',
  '/hr/attendance?date=' || v_date || '&cutoff=absent'
from public.resolve_alert_recipients(v_emp.id) r
where r.profile_id is not null
  and not exists (
    select 1
    from public.notifications n
    where n.user_id = r.profile_id
      and n.title = 'Missed clock-in — ' || v_emp.full_name -- Match on the link, which embeds the work date. created_at would
      -- break re-runs/backfills because the notification is created on the
      -- day the alert runs, not necessarily on the work date itself.
      and n.link = '/hr/attendance?date=' || v_date || '&cutoff=absent'
  );
-- Email queue (deduped by category + reference + address).
insert into public.email_outbox (
    to_email,
    subject,
    body_html,
    body_text,
    category,
    reference
  )
select distinct r.email,
  'Missed clock-in: ' || v_emp.full_name || ' — ' || to_char(v_date, 'DD Mon YYYY'),
  '<p>' || v_emp.full_name || ' (<strong>' || v_emp.employee_no || '</strong>, ' || coalesce(v_emp.job_title, v_emp.rank::text) || ') did not clock in by ' || to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' on ' || to_char(v_date, 'Dy, DD Mon YYYY') || '.</p>' || '<p>Branch: ' || coalesce(v_emp.branch_name, '—') || '<br/>' || 'You are receiving this as <strong>' || r.capacity || '</strong>.</p>',
  v_emp.full_name || ' (' || v_emp.employee_no || ') did not clock in by ' || to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' on ' || to_char(v_date, 'DD Mon YYYY') || '.',
  'attendance.missed_cutoff',
  v_emp.id::text || ':' || v_date
from public.resolve_alert_recipients(v_emp.id) r
where r.email is not null on conflict (category, reference, to_email) do nothing;
v_queued := v_queued + 1;
end loop;
perform public.log_audit(
  'attendance.queue_missed_alerts',
  'daily_attendance_reports',
  null,
  jsonb_build_object('work_date', v_date, 'absent_employees', v_total)
);
return jsonb_build_object(
  'success',
  true,
  'work_date',
  v_date,
  'absent_employees',
  v_total
);
end;
$$;
-- ---------------------------------------------------------------------------
-- Drain helpers used by the Next.js cron route (service role only).
-- ---------------------------------------------------------------------------
create or replace function public.claim_queued_emails(p_limit integer default 100) returns setof public.email_outbox language sql security definer
set search_path = public as $$
select *
from public.email_outbox
where status = 'queued'
order by created_at
limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
create or replace function public.mark_email_sent(p_id uuid) returns void language sql security definer
set search_path = public as $$
update public.email_outbox
set status = 'sent',
  sent_at = now(),
  attempts = attempts + 1,
  last_error = null
where id = p_id;
$$;
create or replace function public.mark_email_failed(p_id uuid, p_error text) returns void language sql security definer
set search_path = public as $$
update public.email_outbox
set status = case
    when attempts >= 4 then 'failed'
    else 'queued'
  end,
  attempts = attempts + 1,
  last_error = p_error
where id = p_id;
$$;