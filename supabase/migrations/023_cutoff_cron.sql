-- ============================================================================
-- 023_cutoff_cron.sql
-- Automated daily 08:45 Africa/Freetown cutoff report (pg_cron)
--
-- Africa/Freetown is UTC+0 all year, so 08:45 local == 08:45 UTC.
-- Supabase databases use TimeZone = UTC, which pg_cron uses to parse schedules.
--
-- IMPORTANT: this file must be run as postgres in the Supabase SQL Editor.
-- After running, VERIFY (see queries at the bottom) before assuming the job
-- is active — do not trust scheduling you have not confirmed.
-- ============================================================================

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when others then
      raise notice 'Could not enable pg_cron: %', SQLERRM;
      raise notice 'Enable pg_cron in Dashboard -> Database -> Extensions, then re-run this file.';
      return;
  end;

  if current_setting('TimeZone') <> 'UTC' then
    raise notice 'WARNING: database TimeZone is %, but cron parses schedules in it. Africa/Freetown is UTC+0.',
      current_setting('TimeZone');
  end if;

  -- Idempotent: remove any previous versions of these jobs, then (re)schedule.
  begin
    perform cron.unschedule('orange-sl-daily-cutoff');
  exception when others then null;
  end;
  begin
    perform cron.unschedule('orange-sl-eod-reconcile');
  exception when others then null;
  end;

  -- 1) The HR cutoff snapshot, every day at 08:45 local time
  perform cron.schedule(
    'orange-sl-daily-cutoff',
    '45 8 * * *',
    $sql$select public.process_daily_cutoff(current_date, false);$sql$
  );

  -- 2) End-of-day reconciliation at 23:30 — finalises no-shows as absent for
  --    the whole day while PRESERVING the 08:45 cutoff_status snapshot.
  --    process_daily_cutoff() is idempotent, so repeated runs are safe.
  perform cron.schedule(
    'orange-sl-eod-reconcile',
    '30 23 * * *',
    $sql$select public.process_daily_cutoff(current_date, true);$sql$
  );

  raise notice 'Scheduled orange-sl-daily-cutoff (08:45) and orange-sl-eod-reconcile (23:30).';
end;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run these yourself after applying):
--
--   select jobid, jobname, schedule, database, username from cron.job
--    where jobname like 'orange-sl-%';
--
--   -- after 08:45 on any day:
--   select report_date, generated_at, generated_by, counts->>'absent_at_cutoff'
--     from daily_attendance_reports order by report_date desc limit 5;
--
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Manual / backfill runs (also what the HR "Refresh report" button calls):
--
--   select public.process_daily_cutoff(current_date, true);
--   select public.process_daily_cutoff(date '2026-10-19', true);
--
-- To remove the schedule later:
--
--   select cron.unschedule('orange-sl-daily-cutoff');
--   select cron.unschedule('orange-sl-eod-reconcile');
-- ---------------------------------------------------------------------------
