-- ============================================================================
-- 033_workflow_completion.sql
-- Completes the employee request lifecycle:
--   * leave overlap protection
--   * employees can cancel their own pending leave requests
--   * employees can cancel their own pending correction requests
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Leave submission (replaces 021) — reject overlapping pending/approved leave.
-- ---------------------------------------------------------------------------
create or replace function public.submit_leave_request(
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_emp record;
  v_request record;
  v_hr uuid[];
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_emp from public.employees e where e.user_id = v_user;
  if not found then
    raise exception 'This account is not linked to an employee record';
  end if;
  if p_end_date < p_start_date then
    raise exception 'End date cannot be before the start date';
  end if;
  if p_start_date < (now() at time zone 'Africa/Freetown')::date - 7 then
    raise exception 'Leave requests cannot be backdated more than 7 days';
  end if;

  if exists (
    select 1
    from public.leave_requests l
    where l.employee_id = v_emp.id
      and l.status in ('pending', 'approved')
      and daterange(l.start_date, l.end_date, '[]') &&
          daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'You already have pending or approved leave that overlaps these dates';
  end if;

  insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason)
  values (v_emp.id, p_leave_type, p_start_date, p_end_date, nullif(p_reason, ''))
  returning * into v_request;

  select coalesce(array_agg(p.id), '{}') into v_hr
  from public.profiles p
  where p.role in ('super_admin','hr_admin','hr_officer') and p.is_active;

  insert into public.notifications (user_id, title, body, link)
  select u,
         'New leave request — ' || v_emp.full_name,
         p_leave_type || ' leave: ' || to_char(p_start_date, 'DD Mon YYYY') ||
           ' to ' || to_char(p_end_date, 'DD Mon YYYY') ||
           case when p_reason is not null and p_reason <> '' then '. Reason: ' || p_reason else '.' end,
         '/hr/leave'
  from unnest(v_hr) u;

  perform public.log_audit('leave.requested', 'leave_requests', v_request.id::text,
    jsonb_build_object('leave_type', p_leave_type, 'start_date', p_start_date, 'end_date', p_end_date));

  return to_jsonb(v_request);
end;
$$;

-- ---------------------------------------------------------------------------
-- Correction submission (replaces 021) — one pending request per day and
-- sane time ordering.
-- ---------------------------------------------------------------------------
create or replace function public.submit_correction_request(
  p_work_date date,
  p_proposed_check_in timestamptz default null,
  p_proposed_check_out timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_emp record;
  v_request record;
  v_hr uuid[];
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_emp from public.employees e where e.user_id = v_user;
  if not found then
    raise exception 'This account is not linked to an employee record';
  end if;
  if p_work_date > (now() at time zone 'Africa/Freetown')::date then
    raise exception 'Cannot request a correction for a future date';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'A reason is required for attendance corrections';
  end if;
  if p_proposed_check_in is null and p_proposed_check_out is null then
    raise exception 'Provide a proposed check-in or check-out time';
  end if;
  if p_proposed_check_in is not null
     and p_proposed_check_out is not null
     and p_proposed_check_out <= p_proposed_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if exists (
    select 1 from public.attendance_correction_requests c
    where c.employee_id = v_emp.id
      and c.work_date = p_work_date
      and c.status = 'pending'
  ) then
    raise exception 'A correction for this day is already waiting for review';
  end if;

  insert into public.attendance_correction_requests (
    employee_id, work_date, proposed_check_in, proposed_check_out, reason
  )
  values (v_emp.id, p_work_date, p_proposed_check_in, p_proposed_check_out, trim(p_reason))
  returning * into v_request;

  select coalesce(array_agg(p.id), '{}') into v_hr
  from public.profiles p
  where p.role in ('super_admin','hr_admin','hr_officer') and p.is_active;

  insert into public.notifications (user_id, title, body, link)
  select u,
         'Attendance correction requested — ' || v_emp.full_name,
         'For ' || to_char(p_work_date, 'DD Mon YYYY') || '. Reason: ' || trim(p_reason),
         '/hr/corrections'
  from unnest(v_hr) u;

  perform public.log_audit('correction.requested', 'attendance_correction_requests', v_request.id::text,
    jsonb_build_object('work_date', p_work_date, 'reason', p_reason));

  return to_jsonb(v_request);
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee cancels their own pending leave request.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_leave_request(p_request_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_emp record;
  v_request record;
  v_hr uuid[];
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_emp from public.employees e where e.user_id = v_user;
  if not found then
    raise exception 'This account is not linked to an employee record';
  end if;

  select * into v_request
  from public.leave_requests l
  where l.id = p_request_id and l.employee_id = v_emp.id;

  if not found then
    raise exception 'Leave request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Only pending leave requests can be cancelled';
  end if;

  update public.leave_requests
  set status = 'cancelled',
      reviewed_by = v_user,
      reviewed_at = now(),
      review_notes = coalesce(review_notes, 'Cancelled by employee')
  where id = p_request_id
  returning * into v_request;

  select coalesce(array_agg(p.id), '{}') into v_hr
  from public.profiles p
  where p.role in ('super_admin','hr_admin','hr_officer') and p.is_active;

  insert into public.notifications (user_id, title, body, link)
  select u,
         'Leave request cancelled — ' || v_emp.full_name,
         v_emp.full_name || ' cancelled their ' || v_request.leave_type || ' leave request for ' ||
           to_char(v_request.start_date, 'DD Mon YYYY') || ' to ' || to_char(v_request.end_date, 'DD Mon YYYY') || '.',
         '/hr/leave'
  from unnest(v_hr) u;

  perform public.log_audit('leave.cancelled', 'leave_requests', v_request.id::text,
    jsonb_build_object('employee_id', v_emp.id));

  return to_jsonb(v_request);
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee cancels their own pending correction request.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_correction_request(p_request_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_emp record;
  v_request record;
  v_hr uuid[];
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_emp from public.employees e where e.user_id = v_user;
  if not found then
    raise exception 'This account is not linked to an employee record';
  end if;

  select * into v_request
  from public.attendance_correction_requests c
  where c.id = p_request_id and c.employee_id = v_emp.id;

  if not found then
    raise exception 'Correction request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Only pending correction requests can be cancelled';
  end if;

  update public.attendance_correction_requests
  set status = 'rejected',
      reviewed_by = v_user,
      reviewed_at = now(),
      review_notes = coalesce(review_notes, 'Cancelled by employee')
  where id = p_request_id
  returning * into v_request;

  select coalesce(array_agg(p.id), '{}') into v_hr
  from public.profiles p
  where p.role in ('super_admin','hr_admin','hr_officer') and p.is_active;

  insert into public.notifications (user_id, title, body, link)
  select u,
         'Correction cancelled — ' || v_emp.full_name,
         v_emp.full_name || ' cancelled their attendance correction for ' ||
           to_char(v_request.work_date, 'DD Mon YYYY') || '.',
         '/hr/corrections'
  from unnest(v_hr) u;

  perform public.log_audit('correction.cancelled', 'attendance_correction_requests', v_request.id::text,
    jsonb_build_object('employee_id', v_emp.id));

  return to_jsonb(v_request);
end;
$$;

grant execute on function public.submit_leave_request(text, date, date, text) to authenticated;
grant execute on function public.submit_correction_request(date, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.cancel_leave_request(uuid) to authenticated;
grant execute on function public.cancel_correction_request(uuid) to authenticated;
