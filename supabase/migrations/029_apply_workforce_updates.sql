-- ============================================================================
-- 029_apply_workforce_updates.sql
-- CONVENIENCE BUNDLE: applies 024 -> 026 -> 027 -> 028 in the correct order in
-- one paste. Use this if you hit "relation public.email_outbox does not exist"
-- (which happens when 027 is run before it exists, or 028 before 027).
-- Every statement is idempotent — safe to run more than once.
-- ============================================================================


-- ============================================================================
-- 024_seed_reference.sql
-- EXAMPLE / STARTER data — clearly marked. Edit or delete freely; nothing here
-- is production data. Employees and users are created separately by
-- `npm run seed:workforce` (scripts/seed-workforce.mjs), not from SQL.
-- Idempotent: safe to run more than once.
-- ============================================================================

insert into public.organizations (name, code)
values ('Orange Sierra Leone', 'OSL')
on conflict (code) do nothing;

update public.org_settings
set organization_id = coalesce(org_settings.organization_id,
                               (select o.id from public.organizations o where o.code = 'OSL'))
where id = 1
  and organization_id is null;

-- ---------------------------------------------------------------------------
-- Shifts / work schedules (start times are configurable per team later)
-- ---------------------------------------------------------------------------
insert into public.work_schedules (name, code, work_days, start_time, end_time, grace_minutes, is_default)
values
  ('Standard Day',  'STD', array[1,2,3,4,5]::smallint[], '08:00', '17:00', 10, true),
  ('Early Shift',   'EARLY', array[1,2,3,4,5]::smallint[], '07:00', '16:00', 10, false),
  ('Customer Service Shift', 'CS1', array[1,2,3,4,5,6]::smallint[], '09:00', '18:00', 15, false),
  ('Night Shift',   'NIGHT', array[1,2,3,4,5]::smallint[], '22:00', '06:00', 15, false)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Branches (EXAMPLE — replace with your real Orange SL network)
-- ---------------------------------------------------------------------------
insert into public.branches (name, code, region, address, phone, latitude, longitude, radius_meters)
select v.name, v.code, v.region, v.address, v.phone, v.lat, v.lng, 250
from (values
  ('Headquarters — Freetown', 'HQ',    'Western Area', 'Orange Sierra Leone HQ, Freetown',        '+232 22 000000', 8.4657,  -13.2317),
  ('Bo Regional Office',      'BO',    'Bo',           'Orange SL Regional Office, Bo',           '+232 32 000000', 7.9644,  -11.7383),
  ('Kenema Regional Office',  'KEN',   'Eastern',      'Orange SL Regional Office, Kenema',       '+232 34 000000', 7.8767,  -11.1874),
  ('Makeni Regional Office',  'MAK',   'Northern',     'Orange SL Regional Office, Makeni',       '+232 52 000000', 8.8833,  -12.0333),
  ('Retail Outlet — Lumley',  'RTL-1', 'Western Area', 'Orange SL Retail Outlet, Lumley, Freetown','+232 76 000000', 8.4748,  -13.2135),
  ('Technical Centre — Goderich', 'TECH', 'Western Area', 'Orange SL Technical Centre, Goderich',  '+232 78 000000', 8.4770,  -13.2560),
  ('ABM Area Office',         'ABM',   'Western Area', 'Orange SL ABM Area Office, Aberdeen, Freetown', '+232 79 000000', 8.4960, -13.2890)
) as v(name, code, region, address, phone, lat, lng)
where not exists (select 1 from public.branches b where b.code = v.code);

-- ---------------------------------------------------------------------------
-- Departments (EXAMPLE)
-- ---------------------------------------------------------------------------
insert into public.departments (branch_id, name, code)
select b.id, d.name, d.code
from public.branches b
cross join (values
  ('Human Resources','HR'), ('Finance','FIN'), ('Sales & Marketing','SALES'),
  ('Information Technology','IT'), ('Customer Service','CS'), ('Operations','OPS')
) as d(name, code)
where b.code = 'HQ'
  and not exists (
    select 1 from public.departments x where x.branch_id = b.id and x.name = d.name
  );

insert into public.departments (branch_id, name, code)
select b.id, d.name, d.code
from public.branches b
cross join (values
  ('Sales & Marketing','SALES'), ('Customer Service','CS'), ('Operations','OPS')
) as d(name, code)
where b.code in ('BO','KEN','MAK','RTL-1','TECH','ABM')
  and not exists (
    select 1 from public.departments x where x.branch_id = b.id and x.name = d.name
  );

-- ---------------------------------------------------------------------------
-- Public holidays (EXAMPLE — replace with the official Orange SL / SL calendar)
-- ---------------------------------------------------------------------------
insert into public.holidays (name, holiday_date)
select v.name, v.d::date
from (values
  ('Independence Day', '2026-04-27'),
  ('Christmas Day',    '2026-12-25'),
  ('Boxing Day',       '2026-12-26'),
  ('New Year''s Day',  '2027-01-01')
) as v(name, d)
where not exists (
  select 1 from public.holidays h where h.holiday_date = v.d::date and h.branch_id is null
);
-- ============================================================================
-- 026_workforce_hierarchy.sql
-- Orange SL Workforce Attendance — corporate hierarchy + employment category
--
-- Hierarchy (top -> bottom):
--   CEO > Directors > Senior Managers > Managers > Staff > Temporary Staff
-- Employees are also classed by employment category:
--   permanent | temporary | intern
--   * temporary staff are managed by the external company XL
--   * interns are the only non-permanent, non-XL group
--
-- The line-manager chain is the existing employees.manager_id self-reference;
-- this migration adds the structured *rank* that lets alerts climb it.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums (create only if missing — CREATE TYPE has no IF NOT EXISTS)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'employee_rank') then
    create type public.employee_rank as enum (
      'ceo',
      'director',
      'senior_manager',
      'manager',
      'staff',
      'temporary_staff',
      'intern'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'employment_category') then
    create type public.employment_category as enum (
      'permanent',
      'temporary',
      'intern'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Employees: rank + category + external managing company
-- ---------------------------------------------------------------------------
alter table public.employees
  add column if not exists rank public.employee_rank not null default 'staff';

-- Category is kept in lock-step with rank by the trigger below, so the two can
-- never disagree (e.g. a temporary_staff row can never claim 'permanent').
alter table public.employees
  add column if not exists employment_category public.employment_category not null default 'permanent';

-- Who pays/manages this person. NULL for direct Orange SL employees;
-- 'XL' for temporary staff supplied by the external company.
alter table public.employees
  add column if not exists managed_by_company text;

-- Rank can override the alert order. Lower number = more senior.
-- Defaults are seeded per rank by the trigger; HR may still hand-tune.
alter table public.employees
  add column if not exists seniority smallint;

create index if not exists employees_rank_idx      on public.employees(rank);
create index if not exists employees_category_idx  on public.employees(employment_category);

-- ---------------------------------------------------------------------------
-- Keep rank, category and managed_by_company consistent
-- ---------------------------------------------------------------------------
create or replace function public.sync_employee_rank_fields()
returns trigger
language plpgsql
as $$
begin
  -- Category follows rank unless an intern/temporary was set explicitly.
  if new.rank = 'temporary_staff' then
    new.employment_category := 'temporary';
    new.managed_by_company := coalesce(new.managed_by_company, 'XL');
  elsif new.rank = 'intern' then
    new.employment_category := 'intern';
    new.managed_by_company := null;
  else
    new.employment_category := 'permanent';
    new.managed_by_company := null;
  end if;

  -- Seed seniority from rank when the caller did not pass one.
  if new.seniority is null then
    new.seniority := case new.rank
      when 'ceo' then 10
      when 'director' then 20
      when 'senior_manager' then 30
      when 'manager' then 40
      when 'staff' then 50
      when 'temporary_staff' then 60
      when 'intern' then 70
      else 50
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_sync_rank on public.employees;
create trigger employees_sync_rank
  before insert or update of rank, employment_category, managed_by_company
  on public.employees
  for each row execute function public.sync_employee_rank_fields();

-- Backfill existing rows so the trigger's rules apply to the current data.
update public.employees set rank = rank where seniority is null;
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