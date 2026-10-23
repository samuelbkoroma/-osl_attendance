-- ===========================================================================
-- 036 — Branch kiosk terminal + branch-manager request reviews
--
-- 1. public.kiosk_record_attendance(...) — a shared terminal at a branch
--    records a check-in / check-out on behalf of an employee. It reuses
--    compute_attendance_status() so the resulting row is identical to a
--    self-service check-in apart from attendance_records.source = 'kiosk'.
--    Service-role only: the caller (an API route) authenticates the operator
--    and passes p_operator_id for the audit trail.
--
-- 2. Branch managers can approve leave and correction requests for the
--    employees in their own branch. Until now only HR could, which left the
--    manager review pages without a working approval path.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper: may the signed-in user review requests for this employee?
--
-- p_hr_admin_only picks the HR tier that is allowed:
--   false -> any HR role (leave requests)
--   true  -> HR administrators only (corrections rewrite the attendance row)
-- Branch managers are allowed either way, but only inside their own scope.
-- ---------------------------------------------------------------------------
create or replace function public.can_review_for_employee(
  p_employee_id uuid,
  p_hr_admin_only boolean default false
)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_scope uuid[];
  v_hr_ok boolean;
begin
  -- HR may review anybody.
  if p_hr_admin_only then
    v_hr_ok := public.is_hr_admin();
  else
    v_hr_ok := public.is_hr();
  end if;
  if v_hr_ok then
    return true;
  end if;
  if not public.is_branch_manager() then
    return false;
  end if;

  select e.branch_id into v_branch_id
  from public.employees e
  where e.id = p_employee_id;
  if v_branch_id is null then
    return false;
  end if;

  -- Branches the manager belongs to, plus the branches they manage.
  v_scope := public.my_branch_scope();
  return v_scope is not null and v_branch_id = any(v_scope);
end;
$$;

revoke execute on function public.can_review_for_employee(uuid, boolean)
  from public, anon;
grant execute on function public.can_review_for_employee(uuid, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Kiosk: record a check-in / check-out for any active employee.
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_record_attendance(
  p_employee_id uuid,
  p_branch_id uuid default null,
  p_action text default 'check_in',
  p_operator_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp record;
  v_branch record;
  v_settings record;
  v_date date;
  v_now timestamptz := now();
  v_computed record;
  v_record record;
  v_leave record;
  v_holiday record;
  v_effective_branch uuid;
begin
  if p_action not in ('check_in','check_out') then
    raise exception 'Invalid kiosk action: %', p_action;
  end if;

  select * into v_emp
  from public.employees e
  where e.id = p_employee_id and e.employment_status = 'active';
  if not found then
    raise exception 'Employee not found or not active';
  end if;

  select * into v_settings from public.org_settings s where s.id = 1;
  v_date := (v_now at time zone v_settings.timezone)::date;

  -- The terminal sits at a branch; it may serve an employee who is visiting.
  -- Without a branch it falls back to the employee's own branch.
  if p_branch_id is not null then
    select * into v_branch
    from public.branches b
    where b.id = p_branch_id and b.is_active;
    if not found then
      raise exception 'Kiosk branch not found or inactive';
    end if;
  else
    select * into v_branch
    from public.branches b
    where b.id = v_emp.branch_id;
  end if;
  v_effective_branch := coalesce(v_branch.id, v_emp.branch_id);

  select * into v_record
  from public.attendance_records a
  where a.employee_id = v_emp.id and a.work_date = v_date;

  -- ------------------------------------------------------------------
  -- Check-out
  -- ------------------------------------------------------------------
  if p_action = 'check_out' then
    if v_record.id is null or v_record.check_in is null then
      raise exception '% has not checked in today', v_emp.full_name;
    end if;
    if v_record.check_out is not null then
      raise exception '% has already checked out today', v_emp.full_name;
    end if;

    update public.attendance_records
    set check_out = v_now,
        updated_by = p_operator_id,
        updated_reason = 'Checked out via Branch Kiosk Terminal'
    where id = v_record.id
    returning * into v_record;

    insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, details)
    values (
      p_operator_id,
      (select p.role from public.profiles p where p.id = p_operator_id),
      'attendance.kiosk_check_out', 'attendance_records', v_record.id::text,
      jsonb_build_object(
        'employee_id', v_emp.id,
        'work_date', v_date,
        'branch_id', v_effective_branch,
        'operator_id', p_operator_id,
        'check_out', v_record.check_out
      )
    );

    return jsonb_build_object(
      'success', true,
      'action', 'check_out',
      'employee_id', v_emp.id,
      'employee_no', v_emp.employee_no,
      'full_name', v_emp.full_name,
      'record', to_jsonb(v_record)
    );
  end if;

  -- ------------------------------------------------------------------
  -- Check-in
  -- ------------------------------------------------------------------
  if v_record.id is not null and v_record.check_in is not null then
    raise exception '% has already checked in today at %',
      v_emp.full_name,
      to_char(v_record.check_in at time zone v_settings.timezone, 'HH24:MI');
  end if;

  -- Same guards as the self-service check-in: a kiosk is a self-service
  -- terminal, so the same rules apply. HR overrides live in the HR console.
  select * into v_leave
  from public.leave_requests l
  where l.employee_id = v_emp.id
    and l.status = 'approved'
    and v_date between l.start_date and l.end_date
  limit 1;
  if found then
    raise exception '% is on approved % leave today and cannot check in',
      v_emp.full_name, v_leave.leave_type;
  end if;

  select * into v_holiday
  from public.holidays h
  where h.holiday_date = v_date
    and (h.branch_id is null or h.branch_id = v_effective_branch)
  limit 1;
  if found then
    raise exception 'Today is a public holiday (%) and attendance is not required',
      v_holiday.name;
  end if;

  select * into v_computed
  from public.compute_attendance_status(v_emp.schedule_id, v_date, v_now, v_now);
  if v_computed.out_status = 'rest_day' then
    raise exception 'Today is not a scheduled work day for %', v_emp.full_name;
  end if;

  insert into public.attendance_records (
    employee_id, work_date, branch_id, department_id, schedule_id, scheduled_start,
    check_in, status, cutoff_status, cutoff_at, minutes_late, source, checked_in_by,
    latitude, longitude, within_branch, notes
  )
  values (
    v_emp.id, v_date, v_effective_branch, v_emp.department_id, v_emp.schedule_id,
    v_computed.out_scheduled_start, v_now,
    v_computed.out_status, v_computed.out_cutoff_status,
    case when v_computed.out_cutoff_status is not null
         then (v_date + v_settings.hr_cutoff_time) at time zone v_settings.timezone end,
    v_computed.out_minutes_late, 'kiosk', p_operator_id,
    v_branch.latitude, v_branch.longitude, true,
    case when v_computed.out_status = 'late'
         then 'Checked in late via Branch Kiosk Terminal'
         else 'Checked in via Branch Kiosk Terminal' end
  )
  on conflict (employee_id, work_date) do update
    set check_in = excluded.check_in,
        status = excluded.status,
        cutoff_status = coalesce(public.attendance_records.cutoff_status, excluded.cutoff_status),
        cutoff_at = coalesce(public.attendance_records.cutoff_at, excluded.cutoff_at),
        minutes_late = excluded.minutes_late,
        scheduled_start = coalesce(public.attendance_records.scheduled_start, excluded.scheduled_start),
        branch_id = excluded.branch_id,
        department_id = coalesce(public.attendance_records.department_id, excluded.department_id),
        schedule_id = coalesce(public.attendance_records.schedule_id, excluded.schedule_id),
        source = excluded.source,
        checked_in_by = excluded.checked_in_by,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        within_branch = excluded.within_branch,
        notes = excluded.notes,
        updated_by = excluded.checked_in_by
  returning * into v_record;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, details)
  values (
    p_operator_id,
    (select p.role from public.profiles p where p.id = p_operator_id),
    'attendance.kiosk_check_in', 'attendance_records', v_record.id::text,
    jsonb_build_object(
      'employee_id', v_emp.id,
      'work_date', v_date,
      'branch_id', v_effective_branch,
      'operator_id', p_operator_id,
      'status', v_record.status,
      'check_in', v_record.check_in,
      'minutes_late', v_record.minutes_late
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', 'check_in',
    'employee_id', v_emp.id,
    'employee_no', v_emp.employee_no,
    'full_name', v_emp.full_name,
    'record', to_jsonb(v_record)
  );
end;
$$;

revoke execute on function public.kiosk_record_attendance(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.kiosk_record_attendance(uuid, uuid, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Kiosk check-ins are self-service events too: fire the same immediate
-- alert (HR + line manager, with location) that a phone check-in fires.
-- ---------------------------------------------------------------------------
create or replace function public.attendance_event_alert_trigger()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' then
      if new.check_in is not null and new.source in ('self','kiosk') then
        perform public.queue_attendance_event_alert(new.id, 'check_in');
      end if;
    elsif tg_op = 'UPDATE' then
      if old.check_in is null and new.check_in is not null and new.source in ('self','kiosk') then
        perform public.queue_attendance_event_alert(new.id, 'check_in');
      end if;
      if old.check_out is null and new.check_out is not null and new.source in ('self','kiosk') then
        perform public.queue_attendance_event_alert(new.id, 'check_out');
      end if;
    end if;
  exception when others then
    raise warning 'attendance event alert failed: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.attendance_event_alert_trigger()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leave review — HR, or a branch manager for their own branch.
-- ---------------------------------------------------------------------------
create or replace function public.review_leave_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_request record;
  v_emp record;
  v_sched record;
  v_date date;
  v_settings record;
  v_start_ts timestamptz;
  v_source text;
begin
  if p_decision not in ('approved','rejected','cancelled') then
    raise exception 'Invalid decision';
  end if;

  select * into v_request from public.leave_requests l where l.id = p_request_id;
  if not found then
    raise exception 'Leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if not public.can_review_for_employee(v_request.employee_id) then
    raise exception 'You are not allowed to review leave requests for this employee';
  end if;

  v_source := case when public.is_hr() then 'hr' else 'manager' end;

  update public.leave_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = p_notes
  where id = p_request_id
  returning * into v_request;

  select * into v_emp from public.employees e where e.id = v_request.employee_id;
  select * into v_settings from public.org_settings s where s.id = 1;
  select * into v_sched from public.work_schedules w where w.id = v_emp.schedule_id;

  if p_decision = 'approved' then
    for v_date in
      select generate_series(v_request.start_date, v_request.end_date, '1 day')::date
    loop
      continue when not exists (
        select 1 from unnest(v_sched.work_days) d
        where d = extract(isodow from v_date)::smallint
      );

      v_start_ts := (v_date + v_sched.start_time) at time zone v_settings.timezone;

      insert into public.attendance_records (
        employee_id, work_date, branch_id, department_id, schedule_id, scheduled_start,
        status, cutoff_status, source, notes
      )
      values (
        v_emp.id, v_date, v_emp.branch_id, v_emp.department_id, v_emp.schedule_id, v_start_ts,
        case when v_request.leave_type = 'official_duty' then 'official_duty' else 'on_leave' end,
        case when v_request.leave_type = 'official_duty' then 'official_duty' else 'on_leave' end,
        v_source,
        'Approved ' || v_request.leave_type || ' leave'
      )
      on conflict (employee_id, work_date) do update
        set status = case
              when public.attendance_records.check_in is not null then public.attendance_records.status
              else excluded.status
            end,
            cutoff_status = case
              when public.attendance_records.check_in is not null then public.attendance_records.cutoff_status
              else excluded.cutoff_status
            end,
            source = case
              when public.attendance_records.check_in is not null then public.attendance_records.source
              else excluded.source
            end,
            notes = case
              when public.attendance_records.check_in is not null then public.attendance_records.notes
              else excluded.notes
            end,
            updated_by = auth.uid(),
            updated_reason = 'Approved leave';
    end loop;
  end if;

  if v_emp.user_id is not null then
    insert into public.notifications (user_id, title, body, link)
    values (
      v_emp.user_id,
      'Leave request ' || p_decision,
      'Your ' || v_request.leave_type || ' leave for ' ||
        to_char(v_request.start_date, 'DD Mon YYYY') || ' to ' ||
        to_char(v_request.end_date, 'DD Mon YYYY') || ' was ' || p_decision || '.' ||
        case when p_notes is not null then ' Note: ' || p_notes else '' end,
      '/employee/leave'
    );
  end if;

  perform public.log_audit('leave.' || p_decision, 'leave_requests', v_request.id::text,
    jsonb_build_object('employee_id', v_request.employee_id, 'notes', p_notes));

  return to_jsonb(v_request);
end;
$$;

grant execute on function public.review_leave_request(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Correction review — HR admins, or a branch manager for their own branch.
-- ---------------------------------------------------------------------------
create or replace function public.review_correction_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_request record;
  v_emp record;
  v_settings record;
  v_record record;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_status text;
  v_cutoff_status text;
  v_late integer;
  v_start timestamptz;
  v_source text;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into v_request
  from public.attendance_correction_requests c where c.id = p_request_id;
  if not found then
    raise exception 'Correction request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if not public.can_review_for_employee(v_request.employee_id, true) then
    raise exception 'You are not allowed to review corrections for this employee';
  end if;

  v_source := case when public.is_hr_admin() then 'hr' else 'manager' end;

  select * into v_emp from public.employees e where e.id = v_request.employee_id;
  select * into v_settings from public.org_settings s where s.id = 1;

  if p_decision = 'approved' then
    select a.check_in, a.check_out
      into v_check_in, v_check_out
    from public.attendance_records a
    where a.employee_id = v_request.employee_id and a.work_date = v_request.work_date;

    v_check_in  := coalesce(v_request.proposed_check_in, v_check_in);
    v_check_out := coalesce(v_request.proposed_check_out, v_check_out);

    select c.out_status, c.out_cutoff_status, c.out_minutes_late, c.out_scheduled_start
      into v_status, v_cutoff_status, v_late, v_start
    from public.compute_attendance_status(v_emp.schedule_id, v_request.work_date, v_check_in, now()) c;

    insert into public.attendance_records (
      employee_id, work_date, branch_id, department_id, schedule_id, scheduled_start,
      check_in, check_out, status, cutoff_status, minutes_late, source, updated_by, updated_reason, notes
    )
    values (
      v_emp.id, v_request.work_date, v_emp.branch_id, v_emp.department_id, v_emp.schedule_id,
      v_start, v_check_in, v_check_out,
      v_status, v_cutoff_status, v_late,
      v_source, auth.uid(), 'Approved correction #' || v_request.id,
      'Correction approved: ' || v_request.reason
    )
    on conflict (employee_id, work_date) do update
      set check_in = excluded.check_in,
          check_out = excluded.check_out,
          status = excluded.status,
          cutoff_status = coalesce(excluded.cutoff_status, public.attendance_records.cutoff_status),
          minutes_late = excluded.minutes_late,
          scheduled_start = coalesce(public.attendance_records.scheduled_start, excluded.scheduled_start),
          branch_id = coalesce(public.attendance_records.branch_id, excluded.branch_id),
          department_id = coalesce(public.attendance_records.department_id, excluded.department_id),
          schedule_id = coalesce(public.attendance_records.schedule_id, excluded.schedule_id),
          source = excluded.source,
          updated_by = excluded.updated_by,
          updated_reason = excluded.updated_reason,
          notes = excluded.notes
    returning * into v_record;

    update public.attendance_correction_requests
    set applied_record_id = v_record.id
    where id = v_request.id;

    -- stamp the snapshot time whenever a cutoff classification exists
    update public.attendance_records
    set cutoff_at = coalesce(cutoff_at,
      (v_request.work_date + v_settings.hr_cutoff_time) at time zone v_settings.timezone)
    where id = v_record.id and cutoff_status is not null and cutoff_at is null;
  end if;

  update public.attendance_correction_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = p_notes
  where id = p_request_id
  returning * into v_request;

  if v_emp.user_id is not null then
    insert into public.notifications (user_id, title, body, link)
    values (
      v_emp.user_id,
      'Attendance correction ' || p_decision,
      'Your correction request for ' || to_char(v_request.work_date, 'DD Mon YYYY') ||
        ' was ' || p_decision || '.' ||
        case when p_notes is not null then ' Note: ' || p_notes else '' end,
      '/employee/attendance'
    );
  end if;

  perform public.log_audit('correction.' || p_decision, 'attendance_correction_requests', v_request.id::text,
    jsonb_build_object('work_date', v_request.work_date, 'notes', p_notes));

  return to_jsonb(v_request);
end;
$$;

grant execute on function public.review_correction_request(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: branch managers may review requests for their own branch.
-- The review RPCs are SECURITY DEFINER and enforce the same rule, so these
-- policies are the defence-in-depth layer for direct table updates.
-- The `status = 'pending'` guard lives in USING only: the reviewed row is no
-- longer pending, so WITH CHECK must not repeat it.
-- ---------------------------------------------------------------------------
drop policy if exists leave_review on public.leave_requests;
create policy leave_review on public.leave_requests
  for update using (
    status = 'pending'
    and (
      public.is_hr()
      or (
        public.is_branch_manager()
        and exists (
          select 1 from public.employees e
          where e.id = leave_requests.employee_id
            and public.my_branch_scope() is not null
            and e.branch_id = any (public.my_branch_scope())
        )
      )
    )
  )
  with check (
    public.is_hr()
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

drop policy if exists corrections_review on public.attendance_correction_requests;
create policy corrections_review on public.attendance_correction_requests
  for update using (
    status = 'pending'
    and (
      public.is_hr_admin()
      or (
        public.is_branch_manager()
        and exists (
          select 1 from public.employees e
          where e.id = attendance_correction_requests.employee_id
            and public.my_branch_scope() is not null
            and e.branch_id = any (public.my_branch_scope())
        )
      )
    )
  )
  with check (
    public.is_hr_admin()
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
