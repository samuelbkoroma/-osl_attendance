-- ============================================================================
-- 026 — Realtime publication for workforce workflow tables
-- Mirrors the guard used by 019_certificate_overrides.sql so the migration
-- is idempotent and safe to run where tables are already published.
-- ============================================================================

do $$
begin
  -- Supabase provisions this publication; locally (plain PostgreSQL) it may not
  -- exist, in which case there is nothing to publish.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leave_requests'
  ) then
    alter publication supabase_realtime add table public.leave_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_correction_requests'
  ) then
    alter publication supabase_realtime add table public.attendance_correction_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_attendance_reports'
  ) then
    alter publication supabase_realtime add table public.daily_attendance_reports;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'employees'
  ) then
    alter publication supabase_realtime add table public.employees;
  end if;

  end if;
end $$;
