-- ============================================================================
-- 020_workforce_schema.sql
-- Orange SL Workforce Attendance — core schema
--
-- Hierarchy: Organization -> Branch -> Department -> Team -> Employee
--
-- This project is applied to a FRESH Supabase project (no pre-existing tables).
-- Run in the Supabase SQL Editor, in file order: 020 -> 021 -> 022 -> 023 -> 024.
-- All statements are idempotent so the file can be re-run safely.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organization
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text unique,
  timezone      text not null default 'Africa/Freetown',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Attendance configuration (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.org_settings (
  id                    integer primary key check (id = 1),
  organization_id       uuid references public.organizations(id) on delete set null,
  org_name              text not null default 'Orange Sierra Leone',
  timezone              text not null default 'Africa/Freetown',
  hr_cutoff_time        time not null default '08:45',   -- HR daily reporting cutoff
  standard_start_time   time not null default '08:00',   -- default schedule start
  standard_end_time     time not null default '17:00',
  default_grace_minutes integer not null default 10,     -- late threshold / grace period
  require_location      boolean not null default false,  -- branch geofence enforcement
  updated_by            uuid,
  updated_at            timestamptz not null default now()
);

insert into public.org_settings (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists org_settings_updated_at on public.org_settings;
create trigger org_settings_updated_at
  before update on public.org_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create table if not exists public.branches (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  code              text not null unique,
  region            text,
  address           text,
  phone             text,
  latitude          double precision,
  longitude         double precision,
  radius_meters     integer not null default 250,
  require_location  boolean not null default false,
  is_active         boolean not null default true,
  manager_id        uuid,  -- FK added after public.employees exists
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists branches_updated_at on public.branches;
create trigger branches_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Departments (belong to a branch)
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  name        text not null,
  code        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, name)
);

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Teams (belong to a department)
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments(id) on delete cascade,
  name           text not null,
  lead_id        uuid,  -- FK added after public.employees exists
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (department_id, name)
);

drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Work schedules / shifts
--   work_days: ISO weekdays, 1 = Monday .. 7 = Sunday
--   start_time / end_time may cross midnight (night shifts supported)
-- ---------------------------------------------------------------------------
create table if not exists public.work_schedules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  code           text unique,
  work_days      smallint[] not null default array[1,2,3,4,5]::smallint[],
  start_time     time not null default '08:00',
  end_time       time not null default '17:00',
  grace_minutes  integer not null default 10,
  is_default     boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (grace_minutes >= 0 and grace_minutes <= 240),
  check (cardinality(work_days) between 0 and 7)
);

drop trigger if exists work_schedules_updated_at on public.work_schedules;
create trigger work_schedules_updated_at
  before update on public.work_schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Employee number sequence
-- ---------------------------------------------------------------------------
create sequence if not exists public.employee_no_seq start 1;

create or replace function public.next_employee_no()
returns text
language sql
security definer
set search_path = public
as $$
  select 'OSL-' || lpad(nextval('public.employee_no_seq')::text, 5, '0');
$$;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id                 uuid primary key default gen_random_uuid(),
  employee_no        text not null unique default public.next_employee_no(),
  full_name          text not null,
  work_email         text unique,
  phone              text,
  branch_id          uuid not null references public.branches(id),
  department_id      uuid references public.departments(id),
  team_id            uuid references public.teams(id),
  job_title          text,
  employment_status  text not null default 'active'
                     check (employment_status in ('active','inactive','on_leave','terminated')),
  manager_id         uuid references public.employees(id) on delete set null,
  schedule_id        uuid not null references public.work_schedules(id),
  user_id            uuid unique references auth.users(id) on delete set null,
  hire_date          date,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists employees_branch_idx    on public.employees(branch_id);
create index if not exists employees_department_idx on public.employees(department_id);
create index if not exists employees_status_idx    on public.employees(employment_status);
create index if not exists employees_user_idx      on public.employees(user_id);

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

alter table public.branches
  drop constraint if exists branches_manager_id_fkey;
alter table public.branches
  add constraint branches_manager_id_fkey
  foreign key (manager_id) references public.employees(id) on delete set null;

alter table public.teams
  drop constraint if exists teams_lead_id_fkey;
alter table public.teams
  add constraint teams_lead_id_fkey
  foreign key (lead_id) references public.employees(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Attendance records
--   One row per employee per work date (enforced by unique constraint, which is
--   also what makes the cutoff process idempotent).
--   branch_id / department_id / schedule_id are snapshots so historical records
--   survive employee transfers.
--   cutoff_status = classification at the 08:45 HR cutoff (never overwritten
--   once set). status = current classification (updates when a late arrival
--   checks in after the cutoff).
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  work_date        date not null,
  branch_id        uuid references public.branches(id),
  department_id    uuid references public.departments(id),
  schedule_id      uuid references public.work_schedules(id),
  scheduled_start  timestamptz,
  check_in         timestamptz,
  check_out        timestamptz,
  status           text not null default 'pending'
                   check (status in ('pending','present','late','absent','on_leave',
                                     'rest_day','holiday','official_duty')),
  cutoff_status    text check (cutoff_status in ('pending','present','late','absent','on_leave',
                                                 'rest_day','holiday','official_duty')),
  cutoff_at        timestamptz,
  minutes_late     integer not null default 0 check (minutes_late >= 0),
  source           text not null default 'self'
                   check (source in ('self','manager','kiosk','hr','system')),
  checked_in_by    uuid,
  latitude         double precision,
  longitude        double precision,
  within_branch    boolean,
  notes            text,
  updated_by       uuid,
  updated_reason   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, work_date),
  check (check_out is null or check_in is null or check_out >= check_in)
);

create index if not exists attendance_work_date_idx on public.attendance_records(work_date);
create index if not exists attendance_branch_idx    on public.attendance_records(branch_id, work_date);
create index if not exists attendance_status_idx    on public.attendance_records(status, work_date);
create index if not exists attendance_employee_idx  on public.attendance_records(employee_id, work_date desc);

drop trigger if exists attendance_records_updated_at on public.attendance_records;
create trigger attendance_records_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type    text not null
                check (leave_type in ('annual','sick','unpaid','compassionate',
                                      'maternity','paternity','study','official_duty','other')),
  start_date    date not null,
  end_date      date not null,
  reason        text,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  review_notes  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists leave_requests_employee_idx on public.leave_requests(employee_id, start_date desc);
create index if not exists leave_requests_status_idx   on public.leave_requests(status, start_date);

drop trigger if exists leave_requests_updated_at on public.leave_requests;
create trigger leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Holidays (branch_id null = company-wide)
-- ---------------------------------------------------------------------------
create table if not exists public.holidays (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  holiday_date  date not null,
  branch_id     uuid references public.branches(id) on delete cascade,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unique (holiday_date, branch_id)
);

-- ---------------------------------------------------------------------------
-- Attendance correction requests
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_correction_requests (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees(id) on delete cascade,
  work_date            date not null,
  proposed_check_in    timestamptz,
  proposed_check_out   timestamptz,
  reason               text not null,
  status               text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  review_notes         text,
  applied_record_id    uuid references public.attendance_records(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (proposed_check_out is null or proposed_check_in is null
         or proposed_check_out >= proposed_check_in)
);

create index if not exists corrections_status_idx on public.attendance_correction_requests(status, work_date desc);
create index if not exists corrections_employee_idx on public.attendance_correction_requests(employee_id, work_date desc);

drop trigger if exists corrections_updated_at on public.attendance_correction_requests;
create trigger corrections_updated_at
  before update on public.attendance_correction_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily attendance report (one row per date — unique makes cron idempotent)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_attendance_reports (
  id             uuid primary key default gen_random_uuid(),
  report_date    date not null unique,
  cutoff_time    time not null default '08:45',
  generated_at   timestamptz not null default now(),
  generated_by   uuid,             -- null = automated (cron)
  counts         jsonb not null default '{}'::jsonb,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists daily_reports_date_idx on public.daily_attendance_reports(report_date desc);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid,
  actor_role  text,
  action      text not null,
  entity      text,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx   on public.audit_logs(entity, entity_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Profiles (auth user -> app role)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  full_name             text,
  role                  text not null default 'employee'
                        check (role in ('super_admin','hr_admin','hr_officer','branch_manager','employee')),
  avatar_url            text,
  must_change_password  boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data ->> 'role', 'employee');
  if v_role not in ('super_admin','hr_admin','hr_officer','branch_manager','employee') then
    v_role := 'employee';
  end if;

  insert into public.profiles (id, email, full_name, role, must_change_password, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    v_role,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, true),
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
