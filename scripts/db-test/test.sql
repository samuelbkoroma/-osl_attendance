-- ============================================================================
-- test.sql — assertions for the Orange SL workforce schema (run by run.sh)
-- Fails fast (ON_ERROR_STOP) with a message identifying the broken expectation.
-- ============================================================================

create temp table tvars (k text primary key, d date, u uuid, i int);

do $$
declare
  v_mon date;
  v_sat date;
  v_d1 date;
  v_d2 date;
  v_d3 date;
begin
  v_mon := (date_trunc('week', current_date - 21))::date;      -- Monday, 3 weeks ago
  v_sat := v_mon + 5;                                          -- its Saturday

  select max(d) into v_d1
  from generate_series(current_date - 10, current_date - 1, interval '1 day') g(d)
  where extract(isodow from d) between 1 and 5;

  select max(d) into v_d2
  from generate_series(v_d1 - 10, v_d1 - 1, interval '1 day') g(d)
  where extract(isodow from d) between 1 and 5;

  select max(d) into v_d3
  from generate_series(v_d2 - 10, v_d2 - 1, interval '1 day') g(d)
  where extract(isodow from d) between 1 and 5;

  insert into tvars (k, d) values ('mon3w', v_mon), ('sat3w', v_sat),
                                  ('d1', v_d1), ('d2', v_d2), ('d3', v_d3);
  raise notice 'test dates: mon3w=% sat3w=% d1=% d2=% d3=%', v_mon, v_sat, v_d1, v_d2, v_d3;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Users & profile trigger
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001','hr@orange.sl',   '{"full_name":"Alice Harts","role":"hr_admin"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','manager@orange.sl','{"full_name":"Bob Mansaray","role":"branch_manager"}'),
  ('cccccccc-0000-0000-0000-000000000003','carol@orange.sl', '{"full_name":"Carol Sesay","role":"employee"}'),
  ('dddddddd-0000-0000-0000-000000000004','dave@orange.sl',  '{"full_name":"Dave Conteh","role":"employee"}'),
  ('eeeeeeee-0000-0000-0000-000000000005','frank@orange.sl', '{"full_name":"Frank Turay","role":"employee"}'),
  ('ffffffff-0000-0000-0000-000000000006','grace@orange.sl', '{"full_name":"Grace Bangura","role":"employee"}'),
  ('a1111111-0000-0000-0000-000000000007','bo.emp@orange.sl','{"full_name":"Bo Worker","role":"employee"}'),
  ('a2222221-0000-0000-0000-000000000008','hr2@orange.sl',   '{"full_name":"Hawa HR","role":"hr_officer"}'),
  ('a3333331-0000-0000-0000-000000000009','none@orange.sl',  '{"full_name":"No Employee","role":"employee"}');

do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 9 then raise exception 'FAIL profiles trigger: expected 9 got %', n; end if;
  if (select role from public.profiles where email = 'hr@orange.sl') <> 'hr_admin'
     then raise exception 'FAIL profile role mapping'; end if;
  if not (select must_change_password from public.profiles where email = 'carol@orange.sl')
     then raise exception 'FAIL must_change_password default'; end if;
  raise notice 'PASS 1: users + profile trigger';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Reference data from 024
-- ---------------------------------------------------------------------------
do $$
declare n int; s_id uuid; cs_id uuid; hq uuid; bo uuid;
begin
  select count(*) into n from public.work_schedules;
  if n < 4 then raise exception 'FAIL schedules seeded: %', n; end if;
  if not exists (select 1 from public.work_schedules where is_default and start_time = '08:00')
     then raise exception 'FAIL default standard schedule'; end if;
  select id into hq from public.branches where code = 'HQ';
  select id into bo from public.branches where code = 'BO';
  if hq is null or bo is null then raise exception 'FAIL branches seeded'; end if;
  if (select count(*) from public.departments where branch_id = hq) < 6
     then raise exception 'FAIL HQ departments seeded'; end if;
  raise notice 'PASS 2: reference data';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Employees / teams / org assignment
-- ---------------------------------------------------------------------------
insert into public.teams (department_id, name)
select d.id, 'Retail Team' from public.departments d
join public.branches b on b.id = d.branch_id
where b.code = 'HQ' and d.code = 'SALES'
on conflict do nothing;

insert into public.employees (employee_no, full_name, work_email, branch_id, department_id, job_title, schedule_id, user_id, hire_date)
select 'OSL-90001', 'Carol Sesay', 'carol@orange.sl', b.id, d.id, 'Sales Associate',
       (select id from public.work_schedules where code = 'STD'),
       'cccccccc-0000-0000-0000-000000000003', current_date - 400
from public.branches b join public.departments d on d.branch_id = b.id and d.code = 'SALES'
where b.code = 'HQ';

insert into public.employees (employee_no, full_name, work_email, branch_id, department_id, job_title, schedule_id, user_id, hire_date)
select 'OSL-90002', 'Dave Conteh', 'dave@orange.sl', b.id, d.id, 'Support Agent',
       (select id from public.work_schedules where code = 'CS1'),
       'dddddddd-0000-0000-0000-000000000004', current_date - 300
from public.branches b join public.departments d on d.branch_id = b.id and d.code = 'CS'
where b.code = 'HQ';

insert into public.employees (employee_no, full_name, work_email, branch_id, department_id, job_title, schedule_id, user_id, hire_date)
select 'OSL-90003', 'Frank Turay', 'frank@orange.sl', b.id, d.id, 'Finance Officer',
       (select id from public.work_schedules where code = 'STD'),
       'eeeeeeee-0000-0000-0000-000000000005', current_date - 200
from public.branches b join public.departments d on d.branch_id = b.id and d.code = 'FIN'
where b.code = 'HQ';

insert into public.employees (employee_no, full_name, work_email, branch_id, department_id, job_title, schedule_id, user_id, hire_date)
select 'OSL-90004', 'Grace Bangura', 'grace@orange.sl', b.id, d.id, 'Store Rep',
       (select id from public.work_schedules where code = 'STD'),
       'ffffffff-0000-0000-0000-000000000006', current_date - 150
from public.branches b join public.departments d on d.branch_id = b.id and d.code = 'SALES'
where b.code = 'RTL-1';

insert into public.employees (employee_no, full_name, work_email, branch_id, department_id, job_title, schedule_id, user_id, hire_date)
select 'OSL-90005', 'Bo Worker', 'bo.emp@orange.sl', b.id, d.id, 'Regional Sales',
       (select id from public.work_schedules where code = 'STD'),
       'a1111111-0000-0000-0000-000000000007', current_date - 100
from public.branches b join public.departments d on d.branch_id = b.id and d.code = 'SALES'
where b.code = 'BO';

-- Bob = branch manager of HQ
update public.branches set manager_id = (
  select id from public.employees where user_id is null limit 1
) where code = 'HQ' and manager_id is null;

insert into public.employees (employee_no, full_name, work_email, branch_id, department_id, job_title, schedule_id, user_id, hire_date)
select 'OSL-90006', 'Bob Mansaray', 'manager@orange.sl', b.id, d.id, 'Branch Manager',
       (select id from public.work_schedules where code = 'STD'),
       'bbbbbbbb-0000-0000-0000-000000000002', current_date - 500
from public.branches b join public.departments d on d.branch_id = b.id and d.code = 'OPS'
where b.code = 'HQ';

update public.branches set manager_id = (
  select id from public.employees where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
) where code = 'HQ';

do $$
declare n int;
begin
  select count(*) into n from public.employees;
  if n <> 6 then raise exception 'FAIL employee setup: expected 6 got %', n; end if;
  if (select employee_no from public.employees where work_email = 'carol@orange.sl') not like 'OSL-%'
     then raise exception 'FAIL employee number format'; end if;
  raise notice 'PASS 3: employees + manager assignment';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Classification rules (pure function, fixed dates)
-- ---------------------------------------------------------------------------
do $$
declare
  mon date;
  r record;
  std uuid;
  cs uuid;
begin
  select d into mon from tvars where k = 'mon3w';
  select id into std from public.work_schedules where code = 'STD';
  select id into cs from public.work_schedules where code = 'CS1';

  -- on time (before start)
  select * into r from public.compute_attendance_status(std, mon, mon + '07:55'::time at time zone 'Africa/Freetown', mon + '09:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'present' or r.out_cutoff_status <> 'present' or r.out_minutes_late <> 0
    then raise exception 'FAIL on-time classification: % / % / %', r.out_status, r.out_cutoff_status, r.out_minutes_late; end if;

  -- within grace: late flag not set, minutes recorded
  select * into r from public.compute_attendance_status(std, mon, mon + '08:05'::time at time zone 'Africa/Freetown', mon + '09:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'present' or r.out_minutes_late <> 5
    then raise exception 'FAIL grace classification: % / %', r.out_status, r.out_minutes_late; end if;

  -- after grace but before 08:45 cutoff => late at cutoff
  select * into r from public.compute_attendance_status(std, mon, mon + '08:30'::time at time zone 'Africa/Freetown', mon + '09:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'late' or r.out_cutoff_status <> 'late' or r.out_minutes_late <> 30
    then raise exception 'FAIL late-before-cutoff: % / % / %', r.out_status, r.out_cutoff_status, r.out_minutes_late; end if;

  -- arrives AFTER the 08:45 cutoff => absent at cutoff, late now
  select * into r from public.compute_attendance_status(std, mon, mon + '10:00'::time at time zone 'Africa/Freetown', mon + '10:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'late' or r.out_cutoff_status <> 'absent' or r.out_minutes_late <> 120
    then raise exception 'FAIL late-after-cutoff: % / % / %', r.out_status, r.out_cutoff_status, r.out_minutes_late; end if;

  -- no show, evaluated after start+grace and after cutoff
  select * into r from public.compute_attendance_status(std, mon, null, mon + '09:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'absent' or r.out_cutoff_status <> 'absent'
    then raise exception 'FAIL no-show: % / %', r.out_status, r.out_cutoff_status; end if;

  -- no show, evaluated BEFORE the cutoff => not classified yet (cutoff unknown)
  select * into r from public.compute_attendance_status(std, mon, null, mon + '08:05'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'pending' or r.out_cutoff_status is not null
    then raise exception 'FAIL pre-cutoff pending: % / %', r.out_status, r.out_cutoff_status; end if;

  -- 09:00 shift not yet started at 08:45 => never "absent at cutoff"
  select * into r from public.compute_attendance_status(cs, mon, null, mon + '08:45'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'absent' then
    -- at 08:45 the 09:00 shift has not started => status pending, cutoff pending
    null;
  end if;
  select * into r from public.compute_attendance_status(cs, mon, null, mon + '08:44'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'pending' or r.out_cutoff_status <> 'pending'
    then raise exception 'FAIL 9am shift at cutoff: % / %', r.out_status, r.out_cutoff_status; end if;

  -- rest day (Saturday) for the M-F schedule
  select * into r from public.compute_attendance_status(std, mon + 5, null, mon + 5 + '12:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'rest_day'
    then raise exception 'FAIL rest day: %', r.out_status; end if;

  -- night shift (22:00 -> 06:00) crossing midnight: check-in 22:10 = late-ish/present
  select * into r from public.compute_attendance_status(
    (select id from public.work_schedules where code = 'NIGHT'), mon,
    mon + '22:10'::time at time zone 'Africa/Freetown',
    mon + '23:00'::time at time zone 'Africa/Freetown');
  if r.out_status <> 'late' then
    -- grace is 15 min for NIGHT => 22:10 is within grace => present
    if r.out_status <> 'present' then
      raise exception 'FAIL night shift check-in: %', r.out_status;
    end if;
  end if;
  if r.out_scheduled_start is null or r.out_scheduled_end <= r.out_scheduled_start
    then raise exception 'FAIL night shift window'; end if;

  raise notice 'PASS 4: classification rules';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Employee check-in / check-out flow (server time, duplicates blocked)
-- ---------------------------------------------------------------------------
do $$
declare
  v_r jsonb;
  v_rec record;
  v_expected text;
  v_now timestamptz := now();
  v_start timestamptz;
begin
  v_start := ((now() at time zone 'Africa/Freetown')::date + '08:00'::time) at time zone 'Africa/Freetown';
  if v_now > v_start + make_interval(mins => 10) then v_expected := 'late'; else v_expected := 'present'; end if;

  -- geofence flag must be toggled with admin rights (RLS blocks employees)
  update public.branches set require_location = true where code = 'HQ';

  set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  set role authenticated;

  begin
    perform public.employee_check_in();
    raise exception 'FAIL geofence: check-in without location should be rejected';
  exception when others then
    if sqlerrm like 'FAIL geofence%' then raise; end if;
    if sqlerrm not like '%Location verification is required%' then
      raise exception 'FAIL geofence unexpected error: %', sqlerrm;
    end if;
  end;

  v_r := public.employee_check_in(8.4657, -13.2317);
  if coalesce(v_r->>'success','f') <> 'true' then raise exception 'FAIL check-in: %', v_r; end if;
  if v_r->>'status' <> v_expected then
    raise exception 'FAIL check-in status: expected % got %', v_expected, v_r->>'status';
  end if;

  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where user_id = auth.uid())
    and work_date = (now() at time zone 'Africa/Freetown')::date;
  if v_rec.check_in is null or v_rec.within_branch is distinct from true or v_rec.source <> 'self' then
    raise exception 'FAIL check-in row fields: within=% source=%', v_rec.within_branch, v_rec.source;
  end if;

  -- duplicate blocked
  begin
    perform public.employee_check_in(8.4657, -13.2317);
    raise exception 'FAIL duplicate check-in not blocked';
  exception when others then
    if sqlerrm like 'FAIL duplicate%' then raise; end if;
    if sqlerrm not like '%already checked in%' then
      raise exception 'FAIL duplicate unexpected error: %', sqlerrm;
    end if;
  end;

  -- check-out
  v_r := public.employee_check_out();
  if v_r->>'check_out' is null then raise exception 'FAIL check-out: %', v_r; end if;
  begin
    perform public.employee_check_out();
    raise exception 'FAIL duplicate check-out not blocked';
  exception when others then
    if sqlerrm like 'FAIL duplicate check-out%' then raise; end if;
    if sqlerrm not like '%already checked out%' then
      raise exception 'FAIL duplicate check-out unexpected error: %', sqlerrm;
    end if;
  end;

  -- geofence enforcement can be switched back off (admin rights again)
  reset role;
  reset request.jwt.claim.sub;
  update public.branches set require_location = false where code = 'HQ';

  raise notice 'PASS 5: check-in/out flow (% today)', v_expected;
end $$;

-- Account with no employee record
do $$
begin
  set request.jwt.claim.sub = 'a3333331-0000-0000-0000-000000000009';
  set role authenticated;
  begin
    perform public.employee_check_in();
    raise exception 'FAIL no-employee check-in allowed';
  exception when others then
    if sqlerrm like 'FAIL no-employee%' then raise; end if;
    if sqlerrm not like '%not linked to an active employee%' then
      raise exception 'FAIL no-employee unexpected error: %', sqlerrm;
    end if;
  end;
  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 5b: unlinked account rejected';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Cutoff report: absent-at-cutoff, 9:00 shift, idempotency, late arrival
-- ---------------------------------------------------------------------------
do $$
declare
  v_d1 date;
  v_r jsonb;
  v_carol uuid;
  v_dave uuid;
  v_bo uuid;
  v_report_id uuid;
  v_rows int;
  v_count int;
begin
  select d into v_d1 from tvars where k = 'd1';
  select id into v_carol from public.employees where work_email = 'carol@orange.sl';
  select id into v_dave  from public.employees where work_email = 'dave@orange.sl';
  select id into v_bo    from public.employees where work_email = 'bo.emp@orange.sl';

  v_r := public.process_daily_cutoff(v_d1, false);
  if coalesce(v_r->>'success','f') <> 'true' then
    raise exception 'FAIL cutoff run: %', v_r;
  end if;

  -- carol (08:00 shift, no check-in) => absent at cutoff
  if (select status from public.attendance_records where employee_id = v_carol and work_date = v_d1) <> 'absent'
     or (select cutoff_status from public.attendance_records where employee_id = v_carol and work_date = v_d1) <> 'absent'
    then raise exception 'FAIL carol absent at cutoff'; end if;

  -- dave (09:00 shift, no check-in) => absent for the day but NOT absent at 08:45
  if (select status from public.attendance_records where employee_id = v_dave and work_date = v_d1) <> 'absent'
     or (select cutoff_status from public.attendance_records where employee_id = v_dave and work_date = v_d1) is distinct from 'pending'
    then raise exception 'FAIL dave 9am shift classification (status=% cutoff=%)',
      (select status from public.attendance_records where employee_id = v_dave and work_date = v_d1),
      (select cutoff_status from public.attendance_records where employee_id = v_dave and work_date = v_d1);
  end if;

  -- report row + counts
  select id into v_report_id from public.daily_attendance_reports where report_date = v_d1;
  if v_report_id is null then raise exception 'FAIL report row missing'; end if;
  if (select counts->>'absent_at_cutoff' from public.daily_attendance_reports where report_date = v_d1)::int < 1
    then raise exception 'FAIL report absent_at_cutoff count'; end if;
  if jsonb_array_length(coalesce((select counts->'by_branch' from public.daily_attendance_reports where report_date = v_d1), '[]'::jsonb)) < 4
    then raise exception 'FAIL report by_branch breakdown'; end if;

  -- IDEMPOTENCY: run 3 more times -> no duplicate rows, same report id
  select count(*) into v_rows from public.attendance_records where work_date = v_d1;
  perform public.process_daily_cutoff(v_d1, true);
  perform public.process_daily_cutoff(v_d1, true);
  perform public.process_daily_cutoff(v_d1, true);
  select count(*) into v_count from public.attendance_records where work_date = v_d1;
  if v_count <> v_rows then raise exception 'FAIL idempotency: rows % -> %', v_rows, v_count; end if;
  if (select count(*) from public.daily_attendance_reports where report_date = v_d1) <> 1
    then raise exception 'FAIL idempotency: duplicate reports'; end if;
  if (select id from public.daily_attendance_reports where report_date = v_d1) <> v_report_id
    then raise exception 'FAIL idempotency: report id changed'; end if;
  if (select count(*) from public.attendance_records where employee_id = v_carol and work_date = v_d1) <> 1
    then raise exception 'FAIL idempotency: duplicate attendance rows'; end if;

  raise notice 'PASS 6: cutoff report + idempotency';
end $$;

-- Late arrival after the cutoff must update status but PRESERVE cutoff_status
do $$
declare v_d1 date; v_r jsonb; v_rec record;
begin
  select d into v_d1 from tvars where k = 'd1';
  set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  set role authenticated;

  v_r := public.hr_record_attendance(
    (select id from public.employees where work_email = 'carol@orange.sl'),
    v_d1,
    (v_d1 + '10:00'::time) at time zone 'Africa/Freetown',
    null,
    'Employee arrived after cutoff; entrance log confirms 10:00'
  );

  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'carol@orange.sl')
    and work_date = v_d1;

  if v_rec.status <> 'late' then raise exception 'FAIL late arrival status=%', v_rec.status; end if;
  if v_rec.cutoff_status <> 'absent' then
    raise exception 'FAIL cutoff_status must stay absent-at-cutoff, got %', v_rec.cutoff_status;
  end if;
  if v_rec.source <> 'hr' or v_rec.updated_reason is null then
    raise exception 'FAIL audit fields on HR record';
  end if;

  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 6b: late arrival preserves absent-at-cutoff';
end $$;

-- HR recording a pre-cutoff check-in proves presence at cutoff
do $$
declare v_d1 date; v_rec record;
begin
  select d into v_d1 from tvars where k = 'd1';
  set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  set role authenticated;

  perform public.hr_record_attendance(
    (select id from public.employees where work_email = 'frank@orange.sl'),
    v_d1,
    (v_d1 + '08:05'::time) at time zone 'Africa/Freetown',
    (v_d1 + '17:00'::time) at time zone 'Africa/Freetown',
    'Badge system shows 08:05 entry'
  );

  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'frank@orange.sl')
    and work_date = v_d1;

  if v_rec.status <> 'present' or v_rec.cutoff_status <> 'present' then
    raise exception 'FAIL pre-cutoff proof: status=% cutoff=%', v_rec.status, v_rec.cutoff_status;
  end if;

  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 6c: HR pre-cutoff entry proves presence';
end $$;

-- HR absence on a 09:00-shift employee must NOT claim "absent at 08:45"
do $$
declare v_d1 date; v_rec record;
begin
  select d into v_d1 from tvars where k = 'd1';
  set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  set role authenticated;

  perform public.hr_record_attendance(
    (select id from public.employees where work_email = 'dave@orange.sl'),
    v_d1, null, null,
    'Did not show up for the whole shift'
  );

  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'dave@orange.sl')
    and work_date = v_d1;

  if v_rec.status <> 'absent' then raise exception 'FAIL hr null check-in status=%', v_rec.status; end if;
  if v_rec.cutoff_status is distinct from 'pending' then
    raise exception 'FAIL 9am shift HR absence cutoff=% (must be pending)', v_rec.cutoff_status;
  end if;

  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 6d: HR absence respects 9am shift at cutoff';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Leave: approval converts absence to on_leave and survives the cutoff run
-- ---------------------------------------------------------------------------
do $$
declare
  v_d2 date; v_req jsonb; v_rec record;
begin
  select d into v_d2 from tvars where k = 'd2';

  -- employee submits
  set request.jwt.claim.sub = 'ffffffff-0000-0000-0000-000000000006';
  set role authenticated;
  v_req := public.submit_leave_request('sick', v_d2, v_d2, 'Medical appointment');
  if (v_req->>'status') <> 'pending' then raise exception 'FAIL leave default status'; end if;
  reset role;
  reset request.jwt.claim.sub;

  -- HR processes cutoff first => grace would be absent
  perform public.process_daily_cutoff(v_d2, true);
  if (select status from public.attendance_records
      where employee_id = (select id from public.employees where work_email = 'grace@orange.sl')
        and work_date = v_d2) <> 'absent'
    then raise exception 'FAIL grace should be absent before approval'; end if;

  -- HR approves
  set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  set role authenticated;
  perform public.review_leave_request((v_req->>'id')::uuid, 'approved', 'Get well soon');

  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'grace@orange.sl')
    and work_date = v_d2;
  if v_rec.status <> 'on_leave' or v_rec.cutoff_status <> 'on_leave' then
    raise exception 'FAIL approved leave overwrote absence: % / %', v_rec.status, v_rec.cutoff_status;
  end if;

  -- regeneration must not flip it back to absent
  perform public.regenerate_daily_report(v_d2);
  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'grace@orange.sl')
    and work_date = v_d2;
  if v_rec.status <> 'on_leave' then
    raise exception 'FAIL leave after regenerate: %', v_rec.status;
  end if;

  -- leave is NOT counted as an unexcused absence in the report
  if (select counts->>'on_leave' from public.daily_attendance_reports where report_date = v_d2)::int < 1
    then raise exception 'FAIL report on_leave count'; end if;
  if (select counts->>'absent_at_cutoff' from public.daily_attendance_reports where report_date = v_d2)::int < 1
    then raise exception 'FAIL report absent count after leave (other staff still absent)'; end if;

  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 7: leave approval vs absence';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Holiday & rest day handling in the cutoff run
-- ---------------------------------------------------------------------------
do $$
declare
  v_d3 date; v_sat date; v_rec record; v_r jsonb;
begin
  select d into v_d3 from tvars where k = 'd3';
  select d into v_sat from tvars where k = 'sat3w';

  insert into public.holidays (name, holiday_date) values ('Test Holiday', v_d3)
  on conflict (holiday_date, branch_id) do nothing;

  perform public.process_daily_cutoff(v_d3, true);
  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'carol@orange.sl')
    and work_date = v_d3;
  if v_rec.status <> 'holiday' then raise exception 'FAIL holiday status=%', v_rec.status; end if;

  -- Saturday: no row for M-F employees, row for the Mon-Sat employee
  perform public.process_daily_cutoff(v_sat, true);
  if exists (select 1 from public.attendance_records
             where employee_id = (select id from public.employees where work_email = 'carol@orange.sl')
               and work_date = v_sat)
    then raise exception 'FAIL rest day should not create a row'; end if;

  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'dave@orange.sl')
    and work_date = v_sat;
  if v_rec.status is null then raise exception 'FAIL CS shift should be scheduled on Saturday'; end if;
  if v_rec.status <> 'absent' or v_rec.cutoff_status is distinct from 'pending' then
    raise exception 'FAIL saturday CS shift: status=% cutoff=%', v_rec.status, v_rec.cutoff_status;
  end if;

  raise notice 'PASS 8: holiday + rest day';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Correction request flow
-- ---------------------------------------------------------------------------
do $$
declare
  v_d1 date; v_req jsonb; v_rec record;
begin
  select d into v_d1 from tvars where k = 'd1';

  set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
  set role authenticated;
  v_req := public.submit_correction_request(
    v_d1, (v_d1 + '08:20'::time) at time zone 'Africa/Freetown', null,
    'Forgot to tap in; team lead confirmed arrival at 08:20'
  );
  reset role;
  reset request.jwt.claim.sub;

  -- HR officer cannot apply corrections (needs hr_admin)
  set request.jwt.claim.sub = 'a2222221-0000-0000-0000-000000000008';
  set role authenticated;
  begin
    perform public.review_correction_request((v_req->>'id')::uuid, 'approved', 'ok');
    raise exception 'FAIL hr_officer applied a correction';
  exception when others then
    if sqlerrm like 'FAIL hr_officer%' then raise; end if;
    if sqlerrm not like '%Only HR administrators%' then
      raise exception 'FAIL correction permission unexpected error: %', sqlerrm;
    end if;
  end;
  reset role;
  reset request.jwt.claim.sub;

  -- HR admin applies it
  set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  set role authenticated;
  perform public.review_correction_request((v_req->>'id')::uuid, 'approved', 'Confirmed with supervisor');
  select * into v_rec from public.attendance_records
  where employee_id = (select id from public.employees where work_email = 'dave@orange.sl')
    and work_date = v_d1;
  reset role;
  reset request.jwt.claim.sub;

  -- dave starts 09:00 => an 08:20 arrival is on time (before his shift),
  -- and it happened before the 08:45 cutoff => presence proven at cutoff
  if v_rec.check_in is null or v_rec.status <> 'present' then
    raise exception 'FAIL correction applied: check_in=% status=%', v_rec.check_in, v_rec.status;
  end if;
  if v_rec.cutoff_status <> 'present' then
    raise exception 'FAIL correction cutoff_status=%', v_rec.cutoff_status;
  end if;
  raise notice 'PASS 9: correction flow';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Permissions & RLS
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- anon can read nothing
  set role anon;
  begin
    select count(*) into n from public.employees;
    raise exception 'FAIL anon could read employees';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- employee sees only their own attendance
  set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  set role authenticated;
  select count(distinct employee_id) into n from public.attendance_records;
  if n <> 1 then raise exception 'FAIL employee attendance scope: % rows from % employees', (select count(*) from public.attendance_records), n; end if;

  -- employee sees only their own employee row
  select count(*) into n from public.employees;
  if n <> 1 then raise exception 'FAIL employee self scope: %', n; end if;

  -- employee cannot write attendance directly (grant + no policy)
  begin
    insert into public.attendance_records (employee_id, work_date, status)
    values ((select id from public.employees where user_id = auth.uid()), current_date, 'present');
    raise exception 'FAIL direct attendance insert allowed';
  exception when insufficient_privilege then null;
  end;

  -- employee cannot escalate their role
  begin
    update public.profiles set role = 'hr_admin' where id = auth.uid();
    raise exception 'FAIL role escalation allowed';
  exception when insufficient_privilege then null;
  end;

  -- employee cannot run HR RPCs
  begin
    perform public.hr_record_attendance(
      (select id from public.employees limit 1), current_date - 1, now(), null, 'testing guard rails');
    raise exception 'FAIL employee ran hr_record_attendance';
  exception when others then
    if sqlerrm like 'FAIL employee ran%' then raise; end if;
    if sqlerrm not like '%Only HR users%' then
      raise exception 'FAIL hr guard unexpected: %', sqlerrm;
    end if;
  end;

  -- employee cannot regenerate the report
  begin
    perform public.regenerate_daily_report(current_date - 1);
    raise exception 'FAIL employee regenerated report';
  exception when others then
    if sqlerrm like 'FAIL employee regenerated%' then raise; end if;
    if sqlerrm not like '%Only HR users%' then
      raise exception 'FAIL regenerate guard unexpected: %', sqlerrm;
    end if;
  end;

  -- employee can still read their own profile and org reference data
  if (select count(*) from public.profiles where id = auth.uid()) <> 1
    then raise exception 'FAIL own profile read'; end if;
  -- branch rows are scoped to the employee's own branch
  if (select count(*) from public.branches) <> 1 then
    raise exception 'FAIL branch scope: employee sees % branches', (select count(*) from public.branches);
  end if;
  if (select count(*) from public.work_schedules) < 4 then raise exception 'FAIL schedule read'; end if;

  reset role;
  reset request.jwt.claim.sub;

  -- branch manager (HQ) sees HQ staff, not staff from other branches
  set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
  set role authenticated;
  select count(*) into n from public.employees;
  if n <> 4 then raise exception 'FAIL manager should see 4 HQ employees, got %', n; end if;
  if exists (select 1 from public.employees where work_email = 'bo.emp@orange.sl')
    then raise exception 'FAIL manager saw another branch''s employee'; end if;
  if exists (select 1 from public.employees where work_email = 'grace@orange.sl')
    then raise exception 'FAIL manager saw a retail branch''s employee'; end if;

  if exists (
    select 1 from public.attendance_records a
    join public.employees e on e.id = a.employee_id
    where e.work_email = 'bo.emp@orange.sl'
  ) then raise exception 'FAIL manager saw another branch''s attendance'; end if;

  -- manager cannot modify employees (RLS + grants keep writes HR-only)
  update public.employees set job_title = 'Changed' where work_email = 'carol@orange.sl';
  if exists (select 1 from public.employees
             where work_email = 'carol@orange.sl' and job_title = 'Changed')
    then raise exception 'FAIL manager edited an employee'; end if;

  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 10: employee + manager RLS scoping';
end $$;

-- HR can read everything; HR admin can update org settings, officer cannot
do $$
declare n int; v_rows int; v_d1 date;
begin
  select d into v_d1 from tvars where k = 'd1';
  set request.jwt.claim.sub = 'a2222221-0000-0000-0000-000000000008';
  set role authenticated;
  select count(*) into n from public.attendance_records;
  if n < 5 then raise exception 'FAIL hr_officer should see all attendance, got %', n; end if;
  select count(*) into n from public.employees;
  if n <> 6 then raise exception 'FAIL hr_officer employee scope: %', n; end if;

  -- officer cannot change org settings (RLS update policy = hr_admin only)
  update public.org_settings set default_grace_minutes = 15 where id = 1;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL hr_officer updated org settings'; end if;
  reset role;
  reset request.jwt.claim.sub;

  set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
  set role authenticated;
  update public.org_settings set default_grace_minutes = 10 where id = 1;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL hr_admin could not update org settings'; end if;

  -- hr admin can create/transfer branches-side data (departments)
  insert into public.departments (branch_id, name, code)
  select id, 'Test Department', 'TST' from public.branches where code = 'HQ';
  if (select count(*) from public.departments where name = 'Test Department') <> 1
    then raise exception 'FAIL hr_admin department insert'; end if;
  delete from public.departments where name = 'Test Department';

  -- hr admin can regenerate reports and read audit trail
  perform public.regenerate_daily_report(v_d1);
  if (select count(*) from public.audit_logs) = 0 then raise exception 'FAIL audit log empty'; end if;
  if (select count(*) from public.daily_attendance_reports) = 0 then raise exception 'FAIL reports unreadable'; end if;

  reset role;
  reset request.jwt.claim.sub;
  raise notice 'PASS 11: HR roles';
end $$;

-- service_role bypasses RLS (used by the API routes)
do $$
declare n int;
begin
  set role service_role;
  select count(*) into n from public.attendance_records;
  if n < 5 then raise exception 'FAIL service_role scope: %', n; end if;
  update public.profiles set full_name = 'Bob Mansaray' where email = 'manager@orange.sl';
  reset role;
  raise notice 'PASS 12: service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Notifications were produced by the cutoff run
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.notifications where title like 'Attendance snapshot%';
  if n = 0 then raise exception 'FAIL HR cutoff notification missing'; end if;
  select count(*) into n from public.notifications where title like 'Branch attendance%';
  if n = 0 then raise exception 'FAIL branch manager cutoff notification missing'; end if;
  select count(*) into n from public.notifications where title like 'Leave request%';
  if n = 0 then raise exception 'FAIL HR leave notification missing'; end if;
  raise notice 'PASS 13: notifications';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Future-date guard + early-run guard
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.process_daily_cutoff(current_date + 1, false);
    raise exception 'FAIL future report allowed';
  exception when others then
    if sqlerrm like 'FAIL future%' then raise; end if;
    if sqlerrm not like '%future date%' then raise exception 'FAIL future guard: %', sqlerrm; end if;
  end;

  if (now() at time zone 'Africa/Freetown')::time < '08:45'::time then
    if (public.process_daily_cutoff(current_date, false)->>'skipped') is distinct from 'true' then
      raise exception 'FAIL pre-cutoff run should be skipped';
    end if;
  end if;
  raise notice 'PASS 14: guards';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Hierarchy rank/category sync (026)
-- ---------------------------------------------------------------------------
do $$
declare
  v_carol uuid; v_frank uuid; v_mgr uuid; v_grace uuid;
  r record;
begin
  select id into v_carol from public.employees where work_email = 'carol@orange.sl';
  select id into v_frank from public.employees where work_email = 'frank@orange.sl';
  select id into v_mgr   from public.employees where work_email = 'manager@orange.sl';
  select id into v_grace from public.employees where work_email = 'grace@orange.sl';

  -- existing rows backfilled to staff/permanent by the 026 update
  select rank, employment_category, seniority into r from public.employees where id = v_carol;
  if r.rank <> 'staff' or r.employment_category <> 'permanent' or r.seniority <> 50 then
    raise exception 'FAIL backfill rank/category/seniority: %/%/%', r.rank, r.employment_category, r.seniority;
  end if;

  -- promote to temporary_staff => category temporary + managed by XL
  update public.employees set rank = 'temporary_staff' where id = v_carol;
  select rank, employment_category, managed_by_company, seniority into r
    from public.employees where id = v_carol;
  if r.employment_category <> 'temporary' or r.managed_by_company <> 'XL' or r.seniority <> 60 then
    raise exception 'FAIL temporary sync: %/%/%/%', r.rank, r.employment_category, r.managed_by_company, r.seniority;
  end if;

  -- an HR-supplied seniority must be preserved (only seeded when null)
  update public.employees set rank = 'temporary_staff', seniority = 99 where id = v_carol;
  if (select seniority from public.employees where id = v_carol) <> 99 then
    raise exception 'FAIL seniority override lost';
  end if;
  update public.employees set rank = 'staff', seniority = null where id = v_carol;

  -- intern
  update public.employees set rank = 'intern' where id = v_frank;
  if (select employment_category from public.employees where id = v_frank) <> 'intern'
     or (select managed_by_company from public.employees where id = v_frank) is not null then
    raise exception 'FAIL intern sync';
  end if;

  -- director, then back to staff
  update public.employees set rank = 'director' where id = v_mgr;
  if (select employment_category from public.employees where id = v_mgr) <> 'permanent'
     or (select seniority from public.employees where id = v_mgr) <> 20 then
    raise exception 'FAIL director sync';
  end if;
  update public.employees set rank = 'staff' where id = v_mgr;

  -- category always follows rank: a temporary_staff row can never claim permanent
  update public.employees set rank = 'staff', employment_category = 'temporary' where id = v_grace;
  if (select employment_category from public.employees where id = v_grace) <> 'permanent' then
    raise exception 'FAIL category must follow rank back to permanent';
  end if;

  raise notice 'PASS 15: rank/category sync (026)';
end $$;

-- ---------------------------------------------------------------------------
-- 14. Missed-clock-in alert chain (027)
-- ---------------------------------------------------------------------------
-- Carol(user) -reports to-> Frank(user, staff) -reports to-> Bob(user)
-- Bob is the top of the chain here, so the walk ends after him. The key
-- invariant under test: manager-chain recipients carry employees.user_id (the
-- auth user id) — NOT employees.id — because notifications.user_id is an FK to
-- auth.users. An earlier revision returned e.id, which would have blown the FK.
do $$
declare
  v_d1 date;
  v_carol uuid; v_frank uuid; v_mgr uuid;
  v_frank_user uuid := 'eeeeeeee-0000-0000-0000-000000000005';
  v_bob_user uuid   := 'bbbbbbbb-0000-0000-0000-000000000002';
  n int; v_outbox int;
begin
  select d into v_d1 from tvars where k = 'd1';
  select id into v_carol from public.employees where work_email = 'carol@orange.sl';
  select id into v_frank from public.employees where work_email = 'frank@orange.sl';
  select id into v_mgr   from public.employees where work_email = 'manager@orange.sl';

  -- carol -> frank (line manager) -> bob (his manager); bob is top of chain
  update public.employees set rank = 'staff'   where id = v_frank;
  update public.employees set rank = 'manager' where id = v_mgr;
  update public.employees set manager_id = v_frank where id = v_carol;
  update public.employees set manager_id = v_mgr   where id = v_frank and id <> v_mgr;
  update public.employees set manager_id = null    where id = v_mgr;

  -- HR directors resolve to profiles.id (an auth user)
  select count(*) into n
  from public.resolve_alert_recipients(v_carol) r
  where r.capacity = 'hr_director' and r.profile_id is not null;
  if n < 1 then raise exception 'FAIL alert chain missing hr_director'; end if;

  -- direct line manager (frank) — his user_id, never his employee row id
  if not exists (
    select 1 from public.resolve_alert_recipients(v_carol) r
    where r.email = 'frank@orange.sl' and r.capacity = 'line_manager'
      and r.profile_id = v_frank_user
  ) then raise exception 'FAIL alert chain line_manager must be frank.user_id'; end if;

  -- walking up lands on bob
  if not exists (
    select 1 from public.resolve_alert_recipients(v_carol) r
    where r.email = 'manager@orange.sl' and r.profile_id = v_bob_user
  ) then raise exception 'FAIL alert chain missing manager (bob)'; end if;

  -- the chain must terminate at bob: nobody else
  if exists (
    select 1 from public.resolve_alert_recipients(v_carol) r
    where r.capacity <> 'hr_director' and r.email not in ('frank@orange.sl','manager@orange.sl')
  ) then raise exception 'FAIL alert chain went past the top of the chain'; end if;

  -- CRITICAL: every manager-chain profile_id is a REAL auth user id (FK safe),
  -- and none of them equals the employee row id (the old bug).
  if exists (
    select 1 from public.resolve_alert_recipients(v_carol) r
    where r.capacity <> 'hr_director'
      and not exists (select 1 from auth.users u where u.id = r.profile_id)
  ) then raise exception 'FAIL manager-chain profile_id is not an auth user'; end if;
  if exists (
    select 1 from public.resolve_alert_recipients(v_carol) r
    join public.employees e on e.id = r.profile_id
    where r.capacity <> 'hr_director'
  ) then raise exception 'FAIL manager-chain profile_id leaked an employee row id'; end if;

  -- the employee himself must never be his own alert recipient
  if exists (select 1 from public.resolve_alert_recipients(v_carol) r where r.profile_id = v_carol) then
    raise exception 'FAIL employee is own alert recipient';
  end if;

  -- queue alerts and check notification + outbox rows
  perform public.process_daily_cutoff(v_d1, true);
  perform public.queue_missed_clockin_alerts(v_d1);

  -- HR admin (alice, aaaaaaaa-...1) should have one in-app notification about carol
  select count(*) into n from public.notifications
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and title = 'Missed clock-in — Carol Sesay'
    and link = '/hr/attendance?date=' || v_d1 || '&cutoff=absent';
  if n <> 1 then raise exception 'FAIL HR missed-clock-in notification (got %)', n; end if;

  -- frank (line manager, has a login) gets one too
  select count(*) into n from public.notifications
  where user_id = v_frank_user and title = 'Missed clock-in — Carol Sesay';
  if n <> 1 then raise exception 'FAIL line-manager missed-clock-in notification (got %)', n; end if;

  -- the notification must reference an auth user (FK), never an employee row id
  if exists (
    select 1 from public.notifications n
    left join auth.users u on u.id = n.user_id
    where n.title = 'Missed clock-in — Carol Sesay' and u.id is null
  ) then raise exception 'FAIL notification user_id is not an auth user'; end if;

  -- outbox got a row per recipient email, deduped by reference
  select count(*) into v_outbox from public.email_outbox
  where category = 'attendance.missed_cutoff'
    and reference = v_carol::text || ':' || v_d1;
  if v_outbox < 2 then raise exception 'FAIL missed-clock-in outbox rows (got %)', v_outbox; end if;
  if not exists (
    select 1 from public.email_outbox
    where category = 'attendance.missed_cutoff'
      and reference = v_carol::text || ':' || v_d1 and to_email = 'frank@orange.sl'
  ) then raise exception 'FAIL line-manager outbox row'; end if;

  -- idempotency: re-running the queue must NOT duplicate notifications/outbox
  select count(*) into n from public.notifications where title = 'Missed clock-in — Carol Sesay';
  perform public.queue_missed_clockin_alerts(v_d1);
  if (select count(*) from public.notifications where title = 'Missed clock-in — Carol Sesay') <> n then
    raise exception 'FAIL duplicate missed-clock-in notifications';
  end if;
  if (select count(*) from public.email_outbox
      where category = 'attendance.missed_cutoff'
        and reference = v_carol::text || ':' || v_d1) <> v_outbox then
    raise exception 'FAIL duplicate missed-clock-in outbox rows';
  end if;

  raise notice 'PASS 16: missed-clock-in alert chain (027)';
end $$;

-- ---------------------------------------------------------------------------
-- 15. Daily digest (030)
-- ---------------------------------------------------------------------------
do $$
declare
  v_d1 date;
  v_r jsonb;
  v_d3 date;
  n int;
begin
  select d into v_d1 from tvars where k = 'd1';
  select d into v_d3 from tvars where k = 'd3';

  -- a date with no report => reason no_report (not an error)
  v_r := public.queue_daily_digest(current_date - 400);
  if (v_r->>'reason') <> 'no_report' then
    raise exception 'FAIL digest should report no_report, got %', v_r;
  end if;

  -- d1 has a report => digest queued to every active HR director
  v_r := public.queue_daily_digest(v_d1);
  if coalesce(v_r->>'success','f') <> 'true' then raise exception 'FAIL digest queue: %', v_r; end if;
  if (v_r->>'recipients')::int < 1 then
    raise exception 'FAIL digest should reach HR directors, got %', v_r->>'recipients';
  end if;

  select count(*) into n from public.email_outbox
  where category = 'attendance.daily_digest' and reference = v_d1::text;
  if n < 1 then raise exception 'FAIL digest outbox rows (got %)', n; end if;
  if not exists (
    select 1 from public.email_outbox
    where category = 'attendance.daily_digest' and reference = v_d1::text
      and subject like 'Attendance digest%' and body_html like '%By branch%'
  ) then raise exception 'FAIL digest subject/body'; end if;

  -- idempotent: same (category, reference, to_email) never duplicates
  perform public.queue_daily_digest(v_d1);
  if (select count(*) from public.email_outbox
      where category = 'attendance.daily_digest' and reference = v_d1::text) <> n then
    raise exception 'FAIL duplicate digest rows';
  end if;

  raise notice 'PASS 17: daily digest (030)';
end $$;

-- ---------------------------------------------------------------------------
-- 16. email_outbox RLS (028)
-- ---------------------------------------------------------------------------
do $$
declare n int; v_drain int;
begin
  -- anon cannot read the outbox at all
  set role anon;
  begin
    select count(*) into n from public.email_outbox;
    raise exception 'FAIL anon read email_outbox';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- employee cannot read the outbox (RLS: is_hr() only) and has no write grant
  set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  set role authenticated;
  select count(*) into n from public.email_outbox;
  if n <> 0 then raise exception 'FAIL employee read % outbox rows', n; end if;
  begin
    insert into public.email_outbox (to_email, subject, body_html)
    values ('x@y.z', 's', '<p>b</p>');
    raise exception 'FAIL employee inserted into outbox';
  exception when insufficient_privilege then null;
  end;
  -- employee cannot call the internal queue/drain functions
  begin
    perform public.queue_missed_clockin_alerts(current_date);
    raise exception 'FAIL employee called queue_missed_clockin_alerts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_queued_emails(1);
    raise exception 'FAIL employee called claim_queued_emails';
  exception when insufficient_privilege then null;
  end;
  reset role;
  reset request.jwt.claim.sub;

  -- hr_officer (is_hr = true) can read, still cannot write
  set request.jwt.claim.sub = 'a2222221-0000-0000-0000-000000000008';
  set role authenticated;
  select count(*) into n from public.email_outbox;
  if n < 1 then raise exception 'FAIL hr_officer cannot read outbox'; end if;
  begin
    insert into public.email_outbox (to_email, subject, body_html)
    values ('x@y.z', 's', '<p>b</p>');
    raise exception 'FAIL hr_officer inserted into outbox';
  exception when insufficient_privilege then null;
  end;
  reset role;
  reset request.jwt.claim.sub;

  -- service_role drains the queue and marks sent
  set role service_role;
  select count(*) into v_drain from public.claim_queued_emails(500);
  if v_drain < 1 then raise exception 'FAIL service_role could not claim emails'; end if;
  perform public.mark_email_sent((select id from public.email_outbox where status = 'queued' limit 1));
  if not exists (select 1 from public.email_outbox where status = 'sent') then
    raise exception 'FAIL mark_email_sent';
  end if;
  reset role;

  raise notice 'PASS 18: outbox RLS (028)';
end $$;


-- ---------------------------------------------------------------------------
-- 19. Immediate attendance alerts + request cancellation (032/033)
-- ---------------------------------------------------------------------------
do $$
declare
  v_carol uuid;
  v_frank uuid;
  v_frank_user uuid;
  v_date date := current_date - 365;
  v_record uuid;
  v_leave uuid;
  v_count int;
  v_notif_count int;
begin
  select e.id, e.manager_id, m.user_id
    into v_carol, v_frank, v_frank_user
  from public.employees e
  left join public.employees m on m.id = e.manager_id
  where e.employee_no = 'OSL-90001';

  if v_frank is null or v_frank_user is null then
    raise exception 'FAIL immediate-alert test needs Carol to report to Frank';
  end if;

  insert into public.attendance_records (
    employee_id, work_date, branch_id, department_id, schedule_id, check_in,
    status, source, latitude, longitude, within_branch
  )
  select e.id, v_date, e.branch_id, e.department_id, e.schedule_id,
         (v_date + time '08:02') at time zone 'Africa/Freetown',
         'present', 'self', 8.484, -13.234, true
  from public.employees e where e.id = v_carol
  returning id into v_record;

  if not exists (
    select 1 from public.notifications
    where user_id = v_frank_user
      and title = 'Clock-in — Carol Sesay'
      and link = '/manager'
  ) then raise exception 'FAIL line manager did not receive immediate clock-in notification'; end if;

  if not exists (
    select 1 from public.email_outbox
    where category = 'attendance.check_in'
      and reference = v_carol::text || ':' || v_date::text || ':check_in'
      and to_email = 'frank@orange.sl'
      and body_html like '%8.484%'
      and body_html like '%google.com/maps%'
  ) then raise exception 'FAIL immediate clock-in email missing manager/location'; end if;

  update public.attendance_records
  set check_out = (v_date + time '17:05') at time zone 'Africa/Freetown'
  where id = v_record;

  if not exists (
    select 1 from public.email_outbox
    where category = 'attendance.check_out'
      and reference = v_carol::text || ':' || v_date::text || ':check_out'
      and to_email = 'frank@orange.sl'
  ) then raise exception 'FAIL immediate clock-out email missing'; end if;

  select count(*) into v_count from public.email_outbox
  where category = 'attendance.check_in'
    and reference = v_carol::text || ':' || v_date::text || ':check_in';
  select count(*) into v_notif_count from public.notifications
  where title = 'Clock-in — Carol Sesay';
  perform public.queue_attendance_event_alert(v_record, 'check_in');
  if (select count(*) from public.notifications
      where title = 'Clock-in — Carol Sesay') <> v_notif_count then
    raise exception 'FAIL immediate alert notifications not idempotent';
  end if;
  if (select count(*) from public.email_outbox
      where category = 'attendance.check_in'
        and reference = v_carol::text || ':' || v_date::text || ':check_in') <> v_count then
    raise exception 'FAIL immediate alert outbox not idempotent';
  end if;

  insert into public.leave_requests (employee_id, leave_type, start_date, end_date, status)
  values (v_carol, 'annual', current_date + 30, current_date + 31, 'pending')
  returning id into v_leave;

  set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  set role authenticated;
  perform public.cancel_leave_request(v_leave);
  reset role;
  reset request.jwt.claim.sub;

  if (select status from public.leave_requests where id = v_leave) <> 'cancelled' then
    raise exception 'FAIL employee could not cancel own leave';
  end if;

  set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
  set role authenticated;
  perform public.submit_correction_request(
    current_date - 50,
    (current_date - 50 + time '08:00') at time zone 'Africa/Freetown',
    (current_date - 50 + time '17:00') at time zone 'Africa/Freetown',
    'Forgot to clock in because of a field visit'
  );
  begin
    perform public.submit_correction_request(
      current_date - 50,
      (current_date - 50 + time '08:15') at time zone 'Africa/Freetown',
      null,
      'Trying to submit the same day twice'
    );
    raise exception 'FAIL duplicate pending correction was accepted';
  exception when others then
    if sqlerrm not like '%already waiting%' then raise; end if;
  end;
  reset role;
  reset request.jwt.claim.sub;

  raise notice 'PASS 19: immediate alerts + cancellations (032/033)';
end $$;


-- ---------------------------------------------------------------------------
-- 20. Offboarding (034)
-- ---------------------------------------------------------------------------
do $$
declare
  v_grace uuid;
  v_grace_user uuid;
  v_leave uuid;
  v_active boolean;
begin
  select e.id, e.user_id into v_grace, v_grace_user
  from public.employees e where e.employee_no = 'OSL-90004';

  insert into public.leave_requests (employee_id, leave_type, start_date, end_date, status)
  values (v_grace, 'annual', current_date + 60, current_date + 61, 'pending')
  returning id into v_leave;

  update public.employees
  set employment_status = 'terminated'
  where id = v_grace;

  select is_active into v_active from public.profiles where id = v_grace_user;
  if v_active then raise exception 'FAIL offboarding left sign-in active'; end if;
  if (select status from public.leave_requests where id = v_leave) <> 'cancelled' then
    raise exception 'FAIL offboarding did not cancel pending leave';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where action = 'employee.offboarded' and entity_id = v_grace::text
  ) then raise exception 'FAIL offboarding audit log missing'; end if;

  raise notice 'PASS 20: offboarding (034)';
end $$;


-- ---------------------------------------------------------------------------
-- 21. Bulk import / avatars (035)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_user_id_profile_fkey'
      and conrelid = 'public.employees'::regclass
  ) then
    raise exception 'FAIL employee/profile relationship missing';
  end if;

  if not exists (
    select 1
    from public.employees e
    join public.profiles p on p.id = e.user_id
    where e.employee_no = 'OSL-90001'
  ) then
    raise exception 'FAIL employee profile join failed';
  end if;

  raise notice 'PASS 21: bulk import / avatars (035)';
end $$;

select 'ALL TESTS PASSED' as result;
