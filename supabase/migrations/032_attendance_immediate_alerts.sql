-- ============================================================================
-- 032_attendance_immediate_alerts.sql
-- Immediate clock-in / clock-out alerts for HR and the employee's line manager.
--
-- Every self-service attendance event now:
--   * creates in-app notifications for HR and the direct line manager
--   * queues an email in public.email_outbox (including the captured location)
--
-- The app drains the outbox immediately via POST /api/attendance/notify and the
-- protected /api/cron/drain-email route retries anything left behind.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Recipients for immediate events: all active HR + the direct line manager.
-- Falls back to the branch manager when the employee has no manager_id.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_immediate_alert_recipients(p_employee_id uuid)
returns table (
  profile_id uuid,
  email text,
  full_name text,
  capacity text
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_manager_id uuid;
  v_branch_manager_id uuid;
begin
  -- HR (directors, admins and officers) with a usable address.
  return query
  select p.id,
         p.email,
         coalesce(p.full_name, p.email),
         'hr'::text
  from public.profiles p
  where p.role in ('super_admin', 'hr_admin', 'hr_officer')
    and p.is_active
    and p.email is not null
    and p.email <> '';

  select e.manager_id, b.manager_id
    into v_manager_id, v_branch_manager_id
  from public.employees e
  left join public.branches b on b.id = e.branch_id
  where e.id = p_employee_id;

  v_manager_id := coalesce(v_manager_id, v_branch_manager_id);

  if v_manager_id is not null and v_manager_id <> p_employee_id then
    return query
    select m.user_id,
           coalesce(nullif(m.work_email, ''), p.email),
           m.full_name,
           'line_manager'::text
    from public.employees m
    left join public.profiles p on p.id = m.user_id
    where m.id = v_manager_id
      and m.employment_status = 'active'
      and coalesce(nullif(m.work_email, ''), p.email) is not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Queue the immediate alerts for one attendance event.
-- p_event is 'check_in' or 'check_out'. Returns the number of notifications
-- created. Safe to call repeatedly: email rows are deduped by the outbox index
-- and in-app notifications are matched on user + title + link.
-- ---------------------------------------------------------------------------
create or replace function public.queue_attendance_event_alert(
  p_record_id uuid,
  p_event text
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_settings record;
  v_record record;
  v_emp record;
  v_event_label text;
  v_event_time timestamptz;
  v_time_text text;
  v_subject text;
  v_title text;
  v_html text;
  v_text text;
  v_maps_url text;
  v_location_text text;
  v_link text;
  v_reference text;
  v_category text;
  v_queued integer := 0;
  v_notified integer := 0;
  v_inserted integer := 0;
  v_seen_profiles uuid[] := '{}';
  v_seen_emails text[] := '{}';
begin
  if p_event not in ('check_in', 'check_out') then
    raise exception 'Invalid attendance event: %', p_event;
  end if;

  select * into v_settings from public.org_settings s where s.id = 1;

  select a.*,
         b.name as branch_name,
         e.full_name,
         e.employee_no,
         e.job_title,
         e.rank
    into v_record
  from public.attendance_records a
  join public.employees e on e.id = a.employee_id
  left join public.branches b on b.id = a.branch_id
  where a.id = p_record_id;

  if not found then
    return 0;
  end if;

  v_event_label := case when p_event = 'check_in' then 'Clock-in' else 'Clock-out' end;
  v_event_time := case when p_event = 'check_in' then v_record.check_in else v_record.check_out end;
  if v_event_time is null then
    return 0;
  end if;

  v_time_text := to_char(v_event_time at time zone coalesce(v_settings.timezone, 'Africa/Freetown'), 'HH24:MI');
  v_reference := v_record.employee_id::text || ':' || v_record.work_date::text || ':' || p_event;
  v_category := 'attendance.' || p_event;

  v_subject := v_event_label || ': ' || v_record.full_name || ' — ' || v_time_text ||
               ' — ' || coalesce(v_record.branch_name, 'No branch');

  v_title := v_event_label || ' — ' || v_record.full_name;

  if v_record.latitude is not null and v_record.longitude is not null then
    v_maps_url := 'https://www.google.com/maps/search/?api=1&query=' ||
                  v_record.latitude::text || ',' || v_record.longitude::text;
    v_location_text := 'Latitude ' || v_record.latitude::text || ', longitude ' || v_record.longitude::text;
  else
    v_maps_url := null;
    v_location_text := 'Location not captured';
  end if;

  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1d29;max-width:620px;">' ||
    '<h2 style="color:#ff7900;margin:0 0 4px;">Orange SL — ' || v_event_label || '</h2>' ||
    '<p style="margin:0 0 16px;color:#6b7280;">' ||
      to_char(v_record.work_date, 'Dy, DD Mon YYYY') || ' · ' || v_time_text || ' Freetown time</p>' ||
    '<p><strong>' || v_record.full_name || '</strong> (' || v_record.employee_no ||
      coalesce(', ' || v_record.job_title, '') || ') ' ||
      case when p_event = 'check_in' then 'clocked in' else 'clocked out' end ||
      ' at <strong>' || v_time_text || '</strong>.</p>' ||
    '<p>Status: <strong>' || initcap(replace(v_record.status, '_', ' ')) || '</strong>' ||
      case when v_record.minutes_late > 0
           then ' · ' || v_record.minutes_late || ' minute(s) late' else '' end ||
      '<br/>Branch: ' || coalesce(v_record.branch_name, '—') || '</p>' ||
    '<p>Location: ' ||
      case when v_maps_url is not null
           then '<a href="' || v_maps_url || '">' || v_location_text || '</a>' ||
                case when v_record.within_branch is true then ' (inside branch radius)'
                     when v_record.within_branch is false then ' (outside branch radius)'
                     else '' end
           else v_location_text end ||
      '</p>' ||
    case when p_event = 'check_out'
         then '<p>Checked in at ' ||
              coalesce(to_char(v_record.check_in at time zone coalesce(v_settings.timezone, 'Africa/Freetown'), 'HH24:MI'), '—') ||
              ', checked out at ' || v_time_text || '.</p>'
         else '' end ||
    '<p style="margin:16px 0 0;color:#6b7280;font-size:12px;">' ||
      'You are receiving this as HR or the employee''s line manager.</p>' ||
    '</div>';

  v_text := v_event_label || ': ' || v_record.full_name || ' (' || v_record.employee_no || ')' ||
            E'\nDate: ' || to_char(v_record.work_date, 'Dy, DD Mon YYYY') ||
            E'\nTime: ' || v_time_text ||
            E'\nStatus: ' || initcap(replace(v_record.status, '_', ' ')) ||
            E'\nBranch: ' || coalesce(v_record.branch_name, '—') ||
            E'\nLocation: ' || v_location_text;

  for v_emp in select * from public.resolve_immediate_alert_recipients(v_record.employee_id) r
  loop
    continue when v_emp.email is null or v_emp.email = '';

    -- A person can be both HR and the line manager. Notify them once per event,
    -- preferring the first (HR) capacity returned by the resolver.
    if v_emp.profile_id is not null and v_emp.profile_id = any(v_seen_profiles) then
      continue;
    end if;
    if lower(v_emp.email) = any(v_seen_emails) then
      continue;
    end if;

    v_link := case when v_emp.capacity = 'hr'
                   then '/hr/attendance?date=' || v_record.work_date::text
                   else '/manager' end;

    if v_emp.profile_id is not null then
      insert into public.notifications (user_id, title, body, link)
      select v_emp.profile_id, v_title,
             v_record.full_name || ' (' || v_record.employee_no || ') ' ||
               case when p_event = 'check_in' then 'clocked in at ' else 'clocked out at ' end ||
               v_time_text || ' · ' || coalesce(v_record.branch_name, 'No branch') ||
               case when v_record.latitude is not null
                    then ' · ' || round(v_record.latitude::numeric, 5)::text || ', ' ||
                         round(v_record.longitude::numeric, 5)::text
                    else ' · location not captured' end,
             v_link
      where not exists (
        select 1 from public.notifications n
        where n.user_id = v_emp.profile_id
          and n.title = v_title
          and n.link = v_link
      );
      get diagnostics v_inserted = row_count;
      v_notified := v_notified + v_inserted;
      v_seen_profiles := array_append(v_seen_profiles, v_emp.profile_id);
    end if;

    insert into public.email_outbox (
      to_email, subject, body_html, body_text, category, reference
    )
    values (
      v_emp.email, v_subject, v_html, v_text, v_category, v_reference
    )
    on conflict (category, reference, to_email) do nothing;
    get diagnostics v_inserted = row_count;
    v_queued := v_queued + v_inserted;
    v_seen_emails := array_append(v_seen_emails, lower(v_emp.email));
  end loop;

  perform public.log_audit(
    'attendance.' || p_event || '_alert',
    'attendance_records',
    p_record_id::text,
    jsonb_build_object('recipients', v_notified, 'emails_queued', v_queued)
  );

  return v_notified;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: fire after a self-service check-in or check-out.
-- Failures are downgraded to warnings so they can never block attendance.
-- ---------------------------------------------------------------------------
create or replace function public.attendance_event_alert_trigger()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' then
      if new.check_in is not null and new.source = 'self' then
        perform public.queue_attendance_event_alert(new.id, 'check_in');
      end if;
    elsif tg_op = 'UPDATE' then
      if old.check_in is null and new.check_in is not null and new.source = 'self' then
        perform public.queue_attendance_event_alert(new.id, 'check_in');
      end if;
      if old.check_out is null and new.check_out is not null and new.source = 'self' then
        perform public.queue_attendance_event_alert(new.id, 'check_out');
      end if;
    end if;
  exception when others then
    raise warning 'attendance event alert failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists attendance_event_alert on public.attendance_records;
create trigger attendance_event_alert
  after insert or update of check_in, check_out on public.attendance_records
  for each row execute function public.attendance_event_alert_trigger();

-- Internal helpers — never directly callable by clients.
revoke execute on function public.resolve_immediate_alert_recipients(uuid)
  from public, anon, authenticated;
revoke execute on function public.queue_attendance_event_alert(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.attendance_event_alert_trigger()
  from public, anon, authenticated;
