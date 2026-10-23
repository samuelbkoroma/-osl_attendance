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
