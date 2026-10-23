-- ============================================================================
-- 028_workforce_alerts_rls.sql
-- RLS + grants for the email outbox.
--
-- NOTE: alert *queueing* is triggered by the protected Next.js cron route
-- (/api/cron/cutoff-report) which calls process_daily_cutoff() first, then
-- queue_missed_clockin_alerts(). Keeping it in the route means 021 stays the
-- single source of truth for the report computation and this migration is
-- purely additive.
--
-- Idempotent: safe to run more than once.
-- ============================================================================
-- ---------------------------------------------------------------------------
-- email_outbox: HR may read; only security-definer functions / service role
-- ever write.
-- ---------------------------------------------------------------------------
alter table public.email_outbox enable row level security;
drop policy if exists email_outbox_select on public.email_outbox;
create policy email_outbox_select on public.email_outbox for
select using (public.is_hr());
grant select,
  insert,
  update,
  delete on public.email_outbox to service_role;
grant select on public.email_outbox to authenticated;
-- Clients never get write grants on the outbox.
revoke
insert,
  update,
  delete on public.email_outbox
from authenticated;
-- ---------------------------------------------------------------------------
-- Realtime: surface queued/sent mail to the HR console.
-- ---------------------------------------------------------------------------
do $$ begin if exists (
  select 1
  from pg_publication
  where pubname = 'supabase_realtime'
) then if not exists (
  select 1
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'email_outbox'
) then alter publication supabase_realtime
add table public.email_outbox;
end if;
end if;
end $$;
-- ---------------------------------------------------------------------------
-- Internal helpers stay server-only; the outbox drain functions are for the
-- service role (cron route) only.
-- ---------------------------------------------------------------------------
revoke execute on function public.resolve_alert_recipients(uuid)
from public,
  anon,
  authenticated;
revoke execute on function public.queue_missed_clockin_alerts(date)
from public,
  anon,
  authenticated;
revoke execute on function public.sync_employee_rank_fields()
from public,
  anon,
  authenticated;
revoke execute on function public.claim_queued_emails(integer)
from public,
  anon,
  authenticated;
revoke execute on function public.mark_email_sent(uuid)
from public,
  anon,
  authenticated;
revoke execute on function public.mark_email_failed(uuid, text)
from public,
  anon,
  authenticated;
grant execute on function public.claim_queued_emails(integer) to service_role;
grant execute on function public.mark_email_sent(uuid) to service_role;
grant execute on function public.mark_email_failed(uuid, text) to service_role;