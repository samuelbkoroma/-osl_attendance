-- ============================================================================
-- 021_workforce_functions.sql
-- Orange SL Workforce Attendance — server-side business logic
--
-- All authoritative attendance computation happens here (server time),
-- so the browser can never author its own timestamps or statuses.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers (used by RLS policies in 022 and by RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.is_hr()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select p.role in ('super_admin','hr_admin','hr_officer')
    from public.profiles p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.is_hr_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select p.role in ('super_admin','hr_admin')
    from public.profiles p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.is_branch_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select p.role = 'branch_manager'
    from public.profiles p where p.id = auth.uid()
  ), false);
$$;

create or replace function public.auth_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select e.id from public.employees e where e.user_id = auth.uid() limit 1;
$$;

-- Branch scope for the signed-in user. NULL = unrestricted (HR roles).
create or replace function public.my_branch_scope()
returns uuid[]
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_role text;
  v_ids uuid[];
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role in ('super_admin','hr_admin','hr_officer') then
    return null;
  end if;

  select coalesce(array_agg(distinct b.id), '{}')
    into v_ids
    from public.employees e
    join public.branches b on b.id = e.branch_id
    where e.user_id = auth.uid();

  select coalesce(array_agg(distinct b.id) || coalesce(v_ids, '{}'), '{}')
    into v_ids
    from public.branches b
    where b.manager_id in (select id from public.employees where user_id = auth.uid());

  return coalesce(v_ids, '{}');
end;
$$;

create or replace function public.can_view_profile(p_id uuid)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_id = auth.uid() or public.is_hr() then
    return true;
  end if;
  return exists (
    select 1
    from public.employees e
    where e.user_id = p_id
      and (public.my_branch_scope() is null
           or e.branch_id = any (public.my_branch_scope()))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail (internal only — not callable by client roles)
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text,
  p_entity text default null,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, details)
  values (
    auth.uid(),
    (select role from public.profiles where id = auth.uid()),
    p_action, p_entity, p_entity_id, p_details
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Haversine distance (branch geofence)
-- ---------------------------------------------------------------------------
create or replace function public.distance_meters(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
)
returns double precision
language sql immutable
as $$
  select 6371000.0 * 2 * asin(
    sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Core classification (pure time logic, shared by check-in and cutoff jobs)
--   out_status        : current classification
--   out_cutoff_status : classification at the HR 08:45 cutoff
--   out_minutes_late  : minutes after scheduled start (0 when on time)
-- ---------------------------------------------------------------------------
create or replace function public.compute_attendance_status(
  p_schedule_id uuid,
  p_work_date date,
  p_check_in timestamptz,
  p_now timestamptz default now()
)
returns table (
  out_status text,
  out_cutoff_status text,
  out_minutes_late integer,
  out_scheduled_start timestamptz,
  out_scheduled_end timestamptz
)
language plpgsql stable
set search_path = public
as $$
declare
  v_sched record;
  v_tz text := 'Africa/Freetown';
  v_cutoff time;
  v_start timestamptz;
  v_end timestamptz;
  v_cutoff_ts timestamptz;
  v_grace interval;
  v_is_workday boolean;
  v_late boolean;
begin
  select * into v_sched from public.work_schedules where id = p_schedule_id and is_active;
  if not found then
    return query select 'pending'::text, null::text, 0, null::timestamptz, null::timestamptz;
    return;
  end if;

  select s.hr_cutoff_time into v_cutoff from public.org_settings s where s.id = 1;
  v_cutoff := coalesce(v_cutoff, '08:45'::time);

  v_start := (p_work_date + v_sched.start_time) at time zone v_tz;
  if v_sched.end_time > v_sched.start_time then
    v_end := (p_work_date + v_sched.end_time) at time zone v_tz;
  else
    v_end := (p_work_date + 1 + v_sched.end_time) at time zone v_tz;  -- night shift
  end if;
  v_cutoff_ts := (p_work_date + v_cutoff) at time zone v_tz;
  v_grace := make_interval(mins => v_sched.grace_minutes);
  v_is_workday := exists (
    select 1 from unnest(v_sched.work_days) d
    where d = extract(isodow from p_work_date)::smallint
  );

  if not v_is_workday then
    return query select 'rest_day'::text, 'rest_day'::text, 0, v_start, v_end;
    return;
  end if;

  if p_check_in is not null then
    v_late := p_check_in > v_start + v_grace;
    return query select
      case when v_late then 'late' else 'present' end,
      case
        when p_check_in <= v_cutoff_ts
          then (case when v_late then 'late' else 'present' end)
        when (v_start + v_grace) < v_cutoff_ts then 'absent'
        else 'pending'
      end,
      greatest(0, round(extract(epoch from (p_check_in - v_start)) / 60)::integer),
      v_start,
      v_end;
    return;
  end if;

  -- No check-in yet. The 08:45 snapshot is only meaningful once that moment has
  -- passed; before it we must not claim "absent at cutoff" (and a pre-cutoff
  -- check-in must be able to overwrite this value via coalesce()).
  return query select
    case when (v_start + v_grace) < p_now then 'absent' else 'pending' end,
    case
      when p_now < v_cutoff_ts then null::text
      when (v_start + v_grace) < v_cutoff_ts then 'absent'
      else 'pending'
    end,
    0,
    v_start,
    v_end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee check-in (server-side time, duplicate-proof, geofence aware)
-- ---------------------------------------------------------------------------
create or replace function public.employee_check_in(
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_emp record;
  v_branch record;
  v_settings record;
  v_date date;
  v_now timestamptz := now();
  v_computed record;
  v_existing record;
  v_prior_check_in timestamptz;
  v_prior_check_out timestamptz;
  v_leave record;
  v_holiday record;
  v_within boolean := null;
  v_distance double precision;
  v_require_location boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_emp
  from public.employees e
  where e.user_id = v_user and e.employment_status = 'active';
  if not found then
    raise exception 'This account is not linked to an active employee record';
  end if;

  select * into v_branch from public.branches b where b.id = v_emp.branch_id;
  select * into v_settings from public.org_settings s where s.id = 1;

  v_date := (v_now at time zone v_settings.timezone)::date;

  -- Already checked in / closed today?
  select a.check_in, a.check_out
    into v_prior_check_in, v_prior_check_out
  from public.attendance_records a
  where a.employee_id = v_emp.id and a.work_date = v_date;

  if v_prior_check_in is not null then
    raise exception 'You have already checked in today at %',
      to_char(v_prior_check_in at time zone v_settings.timezone, 'HH24:MI');
  end if;
  if v_prior_check_out is not null then
    raise exception 'Today''s attendance has already been closed';
  end if;

  -- Approved leave?
  select * into v_leave
  from public.leave_requests l
  where l.employee_id = v_emp.id
    and l.status = 'approved'
    and v_date between l.start_date and l.end_date
  limit 1;
  if found then
    raise exception 'You are on approved % leave today and cannot check in', v_leave.leave_type;
  end if;

  -- Public holiday?
  select * into v_holiday
  from public.holidays h
  where h.holiday_date = v_date
    and (h.branch_id is null or h.branch_id = v_emp.branch_id)
  limit 1;
  if found then
    raise exception 'Today is a public holiday (%) and attendance is not required', v_holiday.name;
  end if;

  -- Classification also validates the workday
  select * into v_computed
  from public.compute_attendance_status(v_emp.schedule_id, v_date, v_now, v_now);
  if v_computed.out_status = 'rest_day' then
    raise exception 'Today is not a scheduled work day for you';
  end if;

  -- Optional branch geofence
  v_require_location := coalesce(v_branch.require_location, false)
                        or coalesce(v_settings.require_location, false);
  if v_require_location then
    if p_latitude is null or p_longitude is null then
      raise exception 'Location verification is required to check in';
    end if;
    if v_branch.latitude is null or v_branch.longitude is null then
      raise exception 'Your branch has no location configured. Contact HR.';
    end if;
    v_distance := public.distance_meters(
      v_branch.latitude, v_branch.longitude, p_latitude, p_longitude
    );
    if v_distance > v_branch.radius_meters + 100 then
      raise exception 'You must be at % to check in (you are %.0f m away)',
        v_branch.name, v_distance;
    end if;
    v_within := v_distance <= v_branch.radius_meters;
  elsif p_latitude is not null and p_longitude is not null
        and v_branch.latitude is not null and v_branch.longitude is not null then
    v_distance := public.distance_meters(
      v_branch.latitude, v_branch.longitude, p_latitude, p_longitude
    );
    v_within := v_distance <= v_branch.radius_meters;
  end if;

  insert into public.attendance_records (
    employee_id, work_date, branch_id, department_id, schedule_id, scheduled_start,
    check_in, status, cutoff_status, cutoff_at, minutes_late, source, checked_in_by,
    latitude, longitude, within_branch, notes
  )
  values (
    v_emp.id, v_date, v_emp.branch_id, v_emp.department_id, v_emp.schedule_id,
    v_computed.out_scheduled_start, v_now,
    v_computed.out_status, v_computed.out_cutoff_status,
    case when v_computed.out_cutoff_status is not null
         then (v_date + v_settings.hr_cutoff_time) at time zone v_settings.timezone end,
    v_computed.out_minutes_late, 'self', v_user,
    p_latitude, p_longitude, v_within,
    case when v_computed.out_status = 'late'
         then 'Checked in after grace period' end
  )
  on conflict (employee_id, work_date) do update
    set check_in = excluded.check_in,
        status = excluded.status,
        cutoff_status = coalesce(public.attendance_records.cutoff_status, excluded.cutoff_status),
        cutoff_at = coalesce(public.attendance_records.cutoff_at, excluded.cutoff_at),
        minutes_late = excluded.minutes_late,
        scheduled_start = coalesce(public.attendance_records.scheduled_start, excluded.scheduled_start),
        branch_id = coalesce(public.attendance_records.branch_id, excluded.branch_id),
        department_id = coalesce(public.attendance_records.department_id, excluded.department_id),
        schedule_id = coalesce(public.attendance_records.schedule_id, excluded.schedule_id),
        source = excluded.source,
        checked_in_by = excluded.checked_in_by,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        within_branch = excluded.within_branch,
        notes = excluded.notes,
        updated_by = excluded.checked_in_by
  returning * into v_existing;

  perform public.log_audit('attendance.check_in', 'attendance_records', v_existing.id::text,
    jsonb_build_object('work_date', v_date, 'status', v_existing.status,
                       'check_in', v_existing.check_in, 'minutes_late', v_existing.minutes_late));

  return jsonb_build_object(
    'success', true,
    'work_date', v_date,
    'check_in', v_existing.check_in,
    'status', v_existing.status,
    'cutoff_status', v_existing.cutoff_status,
    'minutes_late', v_existing.minutes_late
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee check-out
-- ---------------------------------------------------------------------------
create or replace function public.employee_check_out()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_emp record;
  v_settings record;
  v_date date;
  v_now timestamptz := now();
  v_record record;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_emp
  from public.employees e
  where e.user_id = v_user and e.employment_status = 'active';
  if not found then
    raise exception 'This account is not linked to an active employee record';
  end if;

  select * into v_settings from public.org_settings s where s.id = 1;
  v_date := (v_now at time zone v_settings.timezone)::date;

  select * into v_record
  from public.attendance_records a
  where a.employee_id = v_emp.id and a.work_date = v_date;

  if not found or v_record.check_in is null then
    raise exception 'You have not checked in today';
  end if;
  if v_record.check_out is not null then
    raise exception 'You already checked out at %',
      to_char(v_record.check_out at time zone v_settings.timezone, 'HH24:MI');
  end if;

  update public.attendance_records
  set check_out = v_now,
      updated_by = v_user,
      notes = coalesce(notes, '') ||
        case when coalesce(notes, '') = '' then '' else ' | ' end ||
        'Checked out at ' || to_char(v_now at time zone v_settings.timezone, 'HH24:MI')
  where id = v_record.id
  returning * into v_record;

  perform public.log_audit('attendance.check_out', 'attendance_records', v_record.id::text,
    jsonb_build_object('work_date', v_date, 'check_out', v_record.check_out));

  return jsonb_build_object(
    'success', true,
    'work_date', v_date,
    'check_in', v_record.check_in,
    'check_out', v_record.check_out
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Leave request submission (employee)
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
-- Attendance correction request (employee)
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
-- HR: review leave request. Approved leave is written onto attendance so it
-- is never reported as an unexcused absence.
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
begin
  if not public.is_hr() then
    raise exception 'Only HR users can review leave requests';
  end if;
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
        'hr',
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

-- ---------------------------------------------------------------------------
-- HR: review attendance correction. Approval rewrites the authoritative
-- attendance row (with audit trail).
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
begin
  if not public.is_hr_admin() then
    raise exception 'Only HR administrators can apply attendance corrections';
  end if;
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
      'hr', auth.uid(), 'Approved correction #' || v_request.id,
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

-- ---------------------------------------------------------------------------
-- HR: record or amend attendance on an employee's behalf
-- ---------------------------------------------------------------------------
create or replace function public.hr_record_attendance(
  p_employee_id uuid,
  p_work_date date,
  p_check_in timestamptz default null,
  p_check_out timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp record;
  v_settings record;
  v_status text;
  v_cutoff_status text;
  v_late integer;
  v_start timestamptz;
  v_cutoff_ts timestamptz;
  v_record record;
begin
  if not public.is_hr() then
    raise exception 'Only HR users can record attendance';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'A reason is required';
  end if;
  if p_work_date > (now() at time zone 'Africa/Freetown')::date then
    raise exception 'Cannot record attendance for a future date';
  end if;
  if p_work_date < (now() at time zone 'Africa/Freetown')::date - 90 then
    raise exception 'Attendance older than 90 days cannot be edited';
  end if;

  select * into v_emp from public.employees e where e.id = p_employee_id and e.employment_status = 'active';
  if not found then
    raise exception 'Active employee not found';
  end if;
  select * into v_settings from public.org_settings s where s.id = 1;
  v_cutoff_ts := (p_work_date + v_settings.hr_cutoff_time) at time zone v_settings.timezone;

  if p_check_in is not null and p_check_out is not null and p_check_out < p_check_in then
    raise exception 'Check-out cannot be before check-in';
  end if;

  if p_check_in is null then
    -- HR asserts the employee did not show up. The *daily* status is absent,
    -- but the 08:45 snapshot must still respect the schedule: a shift that was
    -- not yet due at cutoff is 'pending', and before cutoff it stays NULL so
    -- the automated run can fill it later.
    v_status := 'absent';
    v_late := 0;
    select c.out_cutoff_status, c.out_scheduled_start
      into v_cutoff_status, v_start
    from public.compute_attendance_status(v_emp.schedule_id, p_work_date, null, now()) c;
  else
    select c.out_status, c.out_cutoff_status, c.out_minutes_late, c.out_scheduled_start
      into v_status, v_cutoff_status, v_late, v_start
    from public.compute_attendance_status(v_emp.schedule_id, p_work_date, p_check_in, now()) c;

    -- An HR-entered check-in at or before the cutoff proves presence at cutoff
    if p_check_in <= v_cutoff_ts then
      v_cutoff_status := v_status;
    end if;
  end if;

  insert into public.attendance_records (
    employee_id, work_date, branch_id, department_id, schedule_id, scheduled_start,
    check_in, check_out, status, cutoff_status, minutes_late, source, updated_by, updated_reason, notes
  )
  values (
    v_emp.id, p_work_date, v_emp.branch_id, v_emp.department_id, v_emp.schedule_id,
    v_start, p_check_in, p_check_out,
    v_status, v_cutoff_status, v_late,
    'hr', auth.uid(), trim(p_reason),
    'Recorded by HR: ' || trim(p_reason)
  )
  on conflict (employee_id, work_date) do update
    set check_in = excluded.check_in,
        check_out = excluded.check_out,
        status = excluded.status,
        cutoff_status = case
          when public.attendance_records.cutoff_status is null then excluded.cutoff_status
          when excluded.check_in is not null and excluded.check_in <= v_cutoff_ts
            then excluded.cutoff_status
          else public.attendance_records.cutoff_status
        end,
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

  -- stamp the snapshot time whenever a cutoff classification exists
  update public.attendance_records
  set cutoff_at = coalesce(cutoff_at, v_cutoff_ts)
  where id = v_record.id and cutoff_status is not null and cutoff_at is null;

  if v_emp.user_id is not null and v_emp.user_id <> auth.uid() then
    insert into public.notifications (user_id, title, body, link)
    values (
      v_emp.user_id,
      'Attendance updated by HR',
      'Your attendance for ' || to_char(p_work_date, 'DD Mon YYYY') ||
        ' was updated. Reason: ' || trim(p_reason),
      '/employee/attendance'
    );
  end if;

  perform public.log_audit('attendance.hr_record', 'attendance_records', v_record.id::text,
    jsonb_build_object('employee_id', p_employee_id, 'work_date', p_work_date,
                       'check_in', p_check_in, 'check_out', p_check_out, 'reason', p_reason));

  return to_jsonb(v_record);
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily 08:45 cutoff processing (idempotent)
--   * Ensures an attendance row exists for every employee scheduled that day
--   * Freezes cutoff_status (set once, never overwritten)
--   * Upserts daily_attendance_reports with aggregate + per-branch counts
--   * Notifies HR and branch managers on first generation
-- Safe to run repeatedly: unique (employee_id, work_date) + coalesce() guards.
-- ---------------------------------------------------------------------------
create or replace function public.process_daily_cutoff(
  p_date date default null,
  p_force boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_settings record;
  v_date date;
  v_now timestamptz := now();
  v_cutoff_ts timestamptz;
  v_emp record;
  v_sched record;
  v_leave record;
  v_holiday record;
  v_check_in timestamptz;
  v_computed record;
  v_status text;
  v_cutoff_status text;
  v_late int;
  v_start timestamptz;
  v_existing_id uuid;
  v_counts jsonb;
  v_branch_counts jsonb;
  v_branch jsonb;
  v_has_leave boolean := false;
  v_has_holiday boolean := false;
  v_report_id uuid;
  v_is_new boolean := false;
  v_hr uuid[];
  v_report_exists boolean;
begin
  select * into v_settings from public.org_settings s where s.id = 1;
  v_date := coalesce(p_date, (v_now at time zone v_settings.timezone)::date);
  v_cutoff_ts := (v_date + v_settings.hr_cutoff_time) at time zone v_settings.timezone;

  -- Callers with a session must be HR (cron / service role have no auth.uid())
  if auth.uid() is not null and not public.is_hr() then
    raise exception 'Only HR users can generate the attendance report';
  end if;

  if v_date > (v_now at time zone v_settings.timezone)::date then
    raise exception 'Cannot generate a report for a future date';
  end if;

  -- Before the cutoff, never classify anyone as absent.
  if v_now < v_cutoff_ts and not p_force then
    return jsonb_build_object(
      'skipped', true,
      'report_date', v_date,
      'reason', 'Cutoff not reached yet',
      'cutoff_at', v_cutoff_ts
    );
  end if;

  select exists(select 1 from public.daily_attendance_reports r where r.report_date = v_date)
    into v_report_exists;

  -- 1) Ensure every scheduled employee has an attendance row ---------------
  for v_emp in
    select e.*
    from public.employees e
    where e.employment_status = 'active'
    order by e.employee_no
  loop
    select * into v_sched from public.work_schedules w where w.id = v_emp.schedule_id;

    v_check_in := null;
    v_existing_id := null;
    select a.check_in, a.id into v_check_in, v_existing_id
    from public.attendance_records a
    where a.employee_id = v_emp.id and a.work_date = v_date;

    -- Approved leave wins over everything (unless they actually checked in)
    select * into v_leave
    from public.leave_requests l
    where l.employee_id = v_emp.id
      and l.status = 'approved'
      and v_date between l.start_date and l.end_date
    limit 1;
    v_has_leave := found;

    select * into v_holiday
    from public.holidays h
    where h.holiday_date = v_date
      and (h.branch_id is null or h.branch_id = v_emp.branch_id)
    limit 1;
    v_has_holiday := found;

    if v_check_in is null and v_has_leave then
      v_status := case when v_leave.leave_type = 'official_duty' then 'official_duty' else 'on_leave' end;
      v_cutoff_status := v_status;
      v_late := 0;
      v_start := ((v_date + v_sched.start_time) at time zone v_settings.timezone);
    elsif v_check_in is null and v_has_holiday then
      v_status := 'holiday';
      v_cutoff_status := 'holiday';
      v_late := 0;
      v_start := null;
    else
      select * into v_computed
      from public.compute_attendance_status(v_emp.schedule_id, v_date, v_check_in, v_now);
      v_status := v_computed.out_status;
      v_cutoff_status := v_computed.out_cutoff_status;
      v_late := v_computed.out_minutes_late;
      v_start := v_computed.out_scheduled_start;

      -- Skip rest days entirely (no row, no noise) unless a check-in exists
      if v_status = 'rest_day' and v_check_in is null then
        continue;
      end if;
    end if;

    if v_existing_id is null then
      insert into public.attendance_records (
        employee_id, work_date, branch_id, department_id, schedule_id, scheduled_start,
        check_in, status, cutoff_status, cutoff_at, minutes_late, source, notes
      )
      values (
        v_emp.id, v_date, v_emp.branch_id, v_emp.department_id, v_emp.schedule_id, v_start,
        v_check_in, v_status, v_cutoff_status,
        case when v_cutoff_status is not null then v_cutoff_ts end,
        v_late, 'system',
        case when v_status in ('on_leave','official_duty') then 'Approved leave'
             when v_status = 'holiday' then 'Public holiday'
             when v_status = 'absent' then 'No check-in recorded at cutoff'
        end
      )
      on conflict (employee_id, work_date) do nothing;
    else
      update public.attendance_records a
      set status = v_status,
          cutoff_status = coalesce(a.cutoff_status, v_cutoff_status),
          cutoff_at = coalesce(a.cutoff_at, case when v_cutoff_status is not null then v_cutoff_ts end),
          minutes_late = case when a.check_in is not null then a.minutes_late else v_late end,
          scheduled_start = coalesce(a.scheduled_start, v_start),
          branch_id = coalesce(a.branch_id, v_emp.branch_id),
          department_id = coalesce(a.department_id, v_emp.department_id),
          schedule_id = coalesce(a.schedule_id, v_emp.schedule_id),
          source = case when a.check_in is not null then a.source else 'system' end,
          notes = case
            when a.check_in is not null then a.notes
            when v_status = 'on_leave' or v_status = 'official_duty' then 'Approved leave'
            when v_status = 'holiday' then 'Public holiday'
            when v_status = 'absent' then 'No check-in recorded at cutoff'
            else a.notes
          end
      where a.id = v_existing_id
         and (a.check_in is null or a.status <> v_status or a.cutoff_status is null);
    end if;
  end loop;

  -- 2) Aggregate counts -----------------------------------------------------
  select coalesce(jsonb_build_object(
    'total_employees',      (select count(*) from public.employees where employment_status = 'active'),
    'rows',                 count(*),
    'scheduled',            count(*) filter (where status in ('present','late','absent','pending','on_leave','official_duty')),
    'present',              count(*) filter (where status = 'present'),
    'late',                 count(*) filter (where status = 'late'),
    'absent_at_cutoff',     count(*) filter (where cutoff_status = 'absent'),
    'absent_now',           count(*) filter (where status = 'absent'),
    'pending',              count(*) filter (where status = 'pending'),
    'on_leave',             count(*) filter (where status = 'on_leave'),
    'official_duty',        count(*) filter (where status = 'official_duty'),
    'holiday',              count(*) filter (where status = 'holiday'),
    'rest_day',             greatest(
                              (select count(*) from public.employees where employment_status = 'active')
                              - count(*), 0),
    'checked_in',           count(*) filter (where check_in is not null),
    'missing_checkout',     count(*) filter (where check_in is not null and check_out is null),
    'total_minutes_late',   coalesce(sum(minutes_late), 0),
    'cutoff_at',            v_cutoff_ts
  ), '{}'::jsonb)
  into v_counts
  from public.attendance_records
  where work_date = v_date;

  -- Per-branch breakdown (all active branches included, zeros included)
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
    into v_branch_counts
  from (
    select jsonb_build_object(
             'branch_id', br.id,
             'name', br.name,
             'code', br.code,
             'scheduled', coalesce(x.scheduled, 0),
             'present', coalesce(x.present, 0),
             'late', coalesce(x.late, 0),
             'absent_at_cutoff', coalesce(x.absent_at_cutoff, 0),
             'on_leave', coalesce(x.on_leave, 0),
             'pending', coalesce(x.pending, 0),
             'checked_in', coalesce(x.checked_in, 0),
             'total_minutes_late', coalesce(x.total_minutes_late, 0)
           ) as entry
    from public.branches br
    left join (
      select a.branch_id,
             count(*) filter (where a.status in ('present','late','absent','pending','on_leave','official_duty')) as scheduled,
             count(*) filter (where a.status = 'present') as present,
             count(*) filter (where a.status = 'late') as late,
             count(*) filter (where a.cutoff_status = 'absent') as absent_at_cutoff,
             count(*) filter (where a.status = 'on_leave') as on_leave,
             count(*) filter (where a.status = 'pending') as pending,
             count(*) filter (where a.check_in is not null) as checked_in,
             coalesce(sum(a.minutes_late), 0) as total_minutes_late
      from public.attendance_records a
      where a.work_date = v_date
      group by a.branch_id
    ) x on x.branch_id = br.id
    where br.is_active
    order by br.name
  ) branch_rows;

  v_counts := coalesce(v_counts, '{}'::jsonb) || jsonb_build_object('by_branch', v_branch_counts);

  -- 3) Upsert the daily report (unique report_date => idempotent) -----------
  insert into public.daily_attendance_reports (report_date, cutoff_time, generated_at, generated_by, counts)
  values (v_date, v_settings.hr_cutoff_time, v_now, auth.uid(), v_counts)
  on conflict (report_date) do update
    set counts = excluded.counts,
        generated_at = excluded.generated_at,
        cutoff_time = excluded.cutoff_time,
        generated_by = excluded.generated_by
  returning id into v_report_id;

  v_is_new := not v_report_exists;

  -- 4) Notify HR + branch managers (first generation only) ------------------
  if v_is_new then
    select coalesce(array_agg(p.id), '{}') into v_hr
    from public.profiles p
    where p.role in ('super_admin','hr_admin','hr_officer') and p.is_active;

    insert into public.notifications (user_id, title, body, link)
    select u,
           'Attendance snapshot — ' || to_char(v_date, 'Dy DD Mon YYYY'),
           (v_counts->>'present') || ' on time, ' ||
           (v_counts->>'late') || ' late, ' ||
           (v_counts->>'absent_at_cutoff') || ' absent at the ' ||
           to_char(v_settings.hr_cutoff_time, 'HH24:MI') || ' cutoff (' ||
           (v_counts->>'scheduled') || ' scheduled).',
           '/hr'
    from unnest(v_hr) u;

    -- Branch managers with late/absent staff in their branch
    for v_branch in
      select elem from jsonb_array_elements(coalesce(v_counts->'by_branch', '[]'::jsonb)) as t(elem)
    loop
      if coalesce(v_branch->>'absent_at_cutoff', '0')::int > 0
         or coalesce(v_branch->>'late', '0')::int > 0 then
        insert into public.notifications (user_id, title, body, link)
        select e.user_id,
               'Branch attendance — ' || (v_branch->>'name'),
               coalesce(v_branch->>'late', '0') || ' late, ' ||
               coalesce(v_branch->>'absent_at_cutoff', '0') || ' absent at cutoff, ' ||
               coalesce(v_branch->>'present', '0') || ' on time today.',
               '/manager'
        from public.employees e
        join public.branches b on b.id = e.branch_id
        join public.profiles p on p.id = e.user_id and p.role = 'branch_manager' and p.is_active
        where e.user_id is not null
          and b.id = (v_branch->>'branch_id')::uuid;
      end if;
    end loop;

    perform public.log_audit('attendance.cutoff_report', 'daily_attendance_reports', v_report_id::text,
      jsonb_build_object('report_date', v_date, 'generated_by', auth.uid(), 'counts', v_counts - 'by_branch'));
  end if;

  return jsonb_build_object(
    'success', true,
    'report_date', v_date,
    'generated_at', v_now,
    'is_new', v_is_new,
    'counts', v_counts
  );
end;
$$;

-- Explicit HR entry point (regenerates counts; never unsets cutoff_status)
create or replace function public.regenerate_daily_report(p_date date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_hr() then
    raise exception 'Only HR users can regenerate the report';
  end if;
  return public.process_daily_cutoff(p_date, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down internal helpers from direct client calls
-- ---------------------------------------------------------------------------
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;
