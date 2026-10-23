-- ============================================================================
-- 030_daily_digest.sql
-- Daily 08:45 attendance digest emailed to HR directors after the cutoff.
--
-- Builds an HTML summary from public.daily_attendance_reports.counts (produced
-- by process_daily_cutoff) and queues one row per HR director in the existing
-- public.email_outbox table, deduped by (category, reference, to_email).
-- The cron route drains the outbox like any other email.
--
-- Idempotent: safe to run more than once and safe to re-run for a date.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A configured destination for the digest (falls back to HR directors).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_digest_recipients()
returns table (email text, full_name text)
language sql stable security definer
set search_path = public
as $$
  select p.email, coalesce(p.full_name, p.email)
  from public.profiles p
  where p.role in ('super_admin','hr_admin')
    and p.is_active
    and p.email is not null
    and p.email <> '';
$$;

-- ---------------------------------------------------------------------------
-- Queue the daily digest for a work date (defaults to today).
-- ---------------------------------------------------------------------------
create or replace function public.queue_daily_digest(p_date date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_settings record;
  v_date date;
  v_report record;
  v_counts jsonb;
  v_branch_rows text := '';
  v_branch jsonb;
  v_recipients integer := 0;
  v_subject text;
  v_html text;
  v_text text;
  v_rate integer;
begin
  select * into v_settings from public.org_settings s where s.id = 1;
  v_date := coalesce(p_date, (now() at time zone v_settings.timezone)::date);

  select * into v_report
  from public.daily_attendance_reports r
  where r.report_date = v_date;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'no_report', 'work_date', v_date);
  end if;

  v_counts := coalesce(v_report.counts, '{}'::jsonb);
  v_rate := case
    when coalesce((v_counts->>'scheduled')::int, 0) > 0
    then round(100.0 * coalesce((v_counts->>'present')::int, 0) / (v_counts->>'scheduled')::int)
    else 0
  end;

  -- Per-branch table rows.
  for v_branch in
    select elem from jsonb_array_elements(coalesce(v_counts->'by_branch', '[]'::jsonb)) as t(elem)
  loop
    v_branch_rows := v_branch_rows ||
      '<tr>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">' ||
          coalesce(v_branch->>'name', '—') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">' ||
          coalesce(v_branch->>'scheduled', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;">' ||
          coalesce(v_branch->>'present', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#f59e0b;">' ||
          coalesce(v_branch->>'late', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;">' ||
          coalesce(v_branch->>'absent_at_cutoff', '0') || '</td>' ||
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#2563eb;">' ||
          coalesce(v_branch->>'on_leave', '0') || '</td>' ||
      '</tr>';
  end loop;

  v_subject := 'Attendance digest — ' || to_char(v_date, 'Dy, DD Mon YYYY') ||
               ' (' || v_rate || '% on time)';

  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1d29;max-width:640px;">' ||
    '<h2 style="color:#ff7900;margin:0 0 4px;">Orange SL — Daily Attendance</h2>' ||
    '<p style="margin:0 0 16px;color:#6b7280;">' || to_char(v_date, 'Dy, DD Mon YYYY') ||
      ' · cutoff ' || to_char(v_report.cutoff_time, 'HH24:MI') || '</p>' ||
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">' ||
      '<tr>' ||
        '<td style="padding:8px 10px;background:#fff7ed;border-radius:8px 0 0 8px;"><b>' ||
          coalesce(v_counts->>'scheduled','0') || '</b><br/>Scheduled</td>' ||
        '<td style="padding:8px 10px;background:#f0fdf4;color:#16a34a;"><b>' ||
          coalesce(v_counts->>'present','0') || '</b><br/>On time</td>' ||
        '<td style="padding:8px 10px;background:#fffbeb;color:#f59e0b;"><b>' ||
          coalesce(v_counts->>'late','0') || '</b><br/>Late</td>' ||
        '<td style="padding:8px 10px;background:#fef2f2;color:#dc2626;"><b>' ||
          coalesce(v_counts->>'absent_at_cutoff','0') || '</b><br/>Absent</td>' ||
        '<td style="padding:8px 10px;background:#eff6ff;color:#2563eb;border-radius:0 8px 8px 0;"><b>' ||
          coalesce(v_counts->>'on_leave','0') || '</b><br/>On leave</td>' ||
      '</tr>' ||
    '</table>' ||
    '<h3 style="margin:0 0 8px;font-size:14px;">By branch</h3>' ||
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' ||
      '<thead><tr>' ||
        '<th style="text-align:left;padding:6px 10px;background:#1a1d29;color:#fff;">Branch</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Scheduled</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Present</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Late</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Absent</th>' ||
        '<th style="padding:6px 10px;background:#1a1d29;color:#fff;">Leave</th>' ||
      '</tr></thead><tbody>' ||
      coalesce(nullif(v_branch_rows, ''), '<tr><td colspan="6" style="padding:10px;">No branch data.</td></tr>') ||
    '</tbody></table>' ||
    '<p style="margin:16px 0 0;color:#6b7280;font-size:12px;">' ||
      'Reported as at ' || to_char(v_report.generated_at, 'YYYY-MM-DD HH24:MI') || ' UTC.</p>' ||
    '</div>';

  v_text := 'Orange SL attendance — ' || to_char(v_date, 'Dy, DD Mon YYYY') || E'\n' ||
            'Scheduled: ' || coalesce(v_counts->>'scheduled','0') ||
            ' · On time: ' || coalesce(v_counts->>'present','0') ||
            ' · Late: ' || coalesce(v_counts->>'late','0') ||
            ' · Absent: ' || coalesce(v_counts->>'absent_at_cutoff','0') ||
            ' · On leave: ' || coalesce(v_counts->>'on_leave','0');

  insert into public.email_outbox (to_email, subject, body_html, body_text, category, reference)
  select r.email, v_subject, v_html, v_text, 'attendance.daily_digest', v_date::text
  from public.resolve_digest_recipients() r
  on conflict (category, reference, to_email) do nothing;

  get diagnostics v_recipients = row_count;

  perform public.log_audit('attendance.queue_daily_digest', 'daily_attendance_reports', null,
    jsonb_build_object('work_date', v_date, 'recipients', v_recipients, 'on_time_rate', v_rate));

  return jsonb_build_object(
    'success', true,
    'work_date', v_date,
    'recipients', v_recipients,
    'on_time_rate', v_rate,
    'counts', v_counts - 'by_branch'
  );
end;
$$;

-- Internal helper — not callable by API roles.
revoke execute on function public.resolve_digest_recipients() from public, anon, authenticated;
revoke execute on function public.queue_daily_digest(date) from public, anon, authenticated;
grant execute on function public.queue_daily_digest(date) to service_role;
