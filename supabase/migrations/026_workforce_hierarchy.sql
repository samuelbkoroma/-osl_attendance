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
declare
  v_default smallint;
  v_rank_default smallint;
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

  v_default := case new.rank
    when 'ceo' then 10
    when 'director' then 20
    when 'senior_manager' then 30
    when 'manager' then 40
    when 'staff' then 50
    when 'temporary_staff' then 60
    when 'intern' then 70
    else 50
  end;

  -- Seed seniority from rank. On UPDATE we keep the value only if it looks like
  -- a deliberate override for the *new* rank — i.e. it was not simply the
  -- previous rank's default that is now stale after a promotion/demotion.
  if tg_op = 'INSERT' then
    new.seniority := coalesce(new.seniority, v_default);
  elsif new.rank is distinct from old.rank then
    v_rank_default := case old.rank
      when 'ceo' then 10
      when 'director' then 20
      when 'senior_manager' then 30
      when 'manager' then 40
      when 'staff' then 50
      when 'temporary_staff' then 60
      when 'intern' then 70
      else 50
    end;
    if new.seniority is null or new.seniority = v_rank_default then
      new.seniority := v_default;
    end if;
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
-- 026 introduces seniority, so there can be no prior overrides to preserve;
-- every existing row is (re)placed on its rank's default rung.
update public.employees
set seniority = case rank
  when 'ceo' then 10
  when 'director' then 20
  when 'senior_manager' then 30
  when 'manager' then 40
  when 'staff' then 50
  when 'temporary_staff' then 60
  when 'intern' then 70
  else 50
end;
