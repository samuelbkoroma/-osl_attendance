-- ============================================================================
-- 037 — Realtime polish for core attendance and notifications
-- Ensures the employee and manager dashboards react instantly to clock-ins
-- and new requests.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then

  -- attendance_records: crucial for live dashboard updates
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_records'
  ) then
    alter publication supabase_realtime add table public.attendance_records;
  end if;

  -- notifications: for real-time alert bells
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  end if;
end $$;
