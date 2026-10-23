-- ============================================================================
-- 022_workforce_rls.sql
-- Orange SL Workforce Attendance — Row Level Security, grants, realtime
--
-- Enforcement model (server-side, not UI hiding):
--   super_admin / hr_admin / hr_officer : company-wide read, HR workflows
--   hr_admin / super_admin              : employee & org management writes
--   branch_manager                      : read-only scope = their own branch
--   employee                            : their own records only
--   attendance writes                   : never direct — only security-definer
--                                          functions from 021 (check-in/out,
--                                          HR recording, cutoff report)
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','org_settings','branches','departments','teams','work_schedules',
    'employees','attendance_records','leave_requests','holidays',
    'attendance_correction_requests','daily_attendance_reports','audit_logs',
    'notifications','profiles'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- NOTE: do NOT force RLS — the security-definer functions in 021 run as the
    -- table owner (postgres) and must be able to write attendance rows.
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.can_view_profile(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- organizations / org_settings
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (true);
drop policy if exists organizations_manage on public.organizations;
create policy organizations_manage on public.organizations
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings
  for select using (true);
drop policy if exists org_settings_manage on public.org_settings;
create policy org_settings_manage on public.org_settings
  for update using (public.is_hr_admin()) with check (public.is_hr_admin());
drop policy if exists org_settings_insert on public.org_settings;
create policy org_settings_insert on public.org_settings
  for insert with check (public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- branches / departments / teams / schedules / holidays
-- ---------------------------------------------------------------------------
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches
  for select using (
    public.is_hr()
    or public.is_branch_manager()
    or exists (
      select 1 from public.employees e
      where e.user_id = auth.uid() and e.branch_id = branches.id
    )
  );
drop policy if exists branches_manage on public.branches;
create policy branches_manage on public.branches
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select using (true);
drop policy if exists departments_manage on public.departments;
create policy departments_manage on public.departments
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select using (true);
drop policy if exists teams_manage on public.teams;
create policy teams_manage on public.teams
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists work_schedules_select on public.work_schedules;
create policy work_schedules_select on public.work_schedules
  for select using (true);
drop policy if exists work_schedules_manage on public.work_schedules;
create policy work_schedules_manage on public.work_schedules
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays
  for select using (true);
drop policy if exists holidays_manage on public.holidays;
create policy holidays_manage on public.holidays
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select using (
    user_id = auth.uid()
    or public.is_hr()
    or (
      public.is_branch_manager()
      and public.my_branch_scope() is not null
      and branch_id = any (public.my_branch_scope())
    )
  );

drop policy if exists employees_manage on public.employees;
create policy employees_manage on public.employees
  for all using (public.is_hr_admin()) with check (public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- attendance_records: read-scoped, writes ONLY via security-definer RPCs
-- ---------------------------------------------------------------------------
drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records
  for select using (
    employee_id = public.auth_employee_id()
    or public.is_hr()
    or (
      public.is_branch_manager()
      and public.my_branch_scope() is not null
      and branch_id = any (public.my_branch_scope())
    )
  );

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------
drop policy if exists leave_select on public.leave_requests;
create policy leave_select on public.leave_requests
  for select using (
    employee_id = public.auth_employee_id()
    or public.is_hr()
    or (
      public.is_branch_manager()
      and exists (
        select 1 from public.employees e
        where e.id = leave_requests.employee_id
          and public.my_branch_scope() is not null
          and e.branch_id = any (public.my_branch_scope())
      )
    )
  );

drop policy if exists leave_insert on public.leave_requests;
create policy leave_insert on public.leave_requests
  for insert with check (
    employee_id = public.auth_employee_id() and status = 'pending'
  );

drop policy if exists leave_review on public.leave_requests;
create policy leave_review on public.leave_requests
  for update using (public.is_hr() and status = 'pending')
  with check (public.is_hr());

-- ---------------------------------------------------------------------------
-- attendance_correction_requests
-- ---------------------------------------------------------------------------
drop policy if exists corrections_select on public.attendance_correction_requests;
create policy corrections_select on public.attendance_correction_requests
  for select using (
    employee_id = public.auth_employee_id()
    or public.is_hr()
    or (
      public.is_branch_manager()
      and exists (
        select 1 from public.employees e
        where e.id = attendance_correction_requests.employee_id
          and public.my_branch_scope() is not null
          and e.branch_id = any (public.my_branch_scope())
      )
    )
  );

drop policy if exists corrections_insert on public.attendance_correction_requests;
create policy corrections_insert on public.attendance_correction_requests
  for insert with check (
    employee_id = public.auth_employee_id() and status = 'pending'
  );

drop policy if exists corrections_review on public.attendance_correction_requests;
create policy corrections_review on public.attendance_correction_requests
  for update using (public.is_hr_admin() and status = 'pending')
  with check (public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- daily_attendance_reports / audit_logs: HR read, no client writes
-- ---------------------------------------------------------------------------
drop policy if exists reports_select on public.daily_attendance_reports;
create policy reports_select on public.daily_attendance_reports
  for select using (public.is_hr());

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs
  for select using (public.is_hr());

-- ---------------------------------------------------------------------------
-- notifications: own rows only
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
--   * anon gets nothing (every page requires a session)
--   * authenticated gets select everywhere + narrow writes enforced by RLS
--   * attendance/report/audit tables are read-only for clients by GRANT too
--   * service_role keeps full access (bypasses RLS) for API routes
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- No direct attendance / report / audit / notification writes from clients
revoke insert, update, delete on public.attendance_records from authenticated;
revoke insert, update, delete on public.daily_attendance_reports from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, delete on public.notifications from authenticated;

-- profiles: self-service limited to name + avatar (role/status via API only)
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Function EXECUTE grants
--   Clients may call the public RPC surface only; internal helpers stay locked.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (dashboards refresh on new attendance / reports / leave / alerts)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'attendance_records','daily_attendance_reports','leave_requests',
    'notifications','employees','attendance_correction_requests'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object or undefined_object then null;
    end;
  end loop;
end;
$$;
