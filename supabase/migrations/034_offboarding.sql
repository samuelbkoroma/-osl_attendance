-- ============================================================================
-- 034_offboarding.sql
-- Terminating an employee immediately closes their sign-in account and clears
-- any requests that are still waiting for a decision.
-- ============================================================================

create or replace function public.handle_employee_offboarding()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_leave integer := 0;
  v_corrections integer := 0;
  v_profiles integer := 0;
begin
  if new.employment_status <> 'terminated' then
    return new;
  end if;
  if old.employment_status = 'terminated' then
    return new;
  end if;

  if new.user_id is not null then
    update public.profiles
    set is_active = false
    where id = new.user_id and is_active
    returning 1 into v_profiles;
  end if;

  update public.leave_requests
  set status = 'cancelled',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = coalesce(review_notes, 'Cancelled automatically during offboarding')
  where employee_id = new.id and status = 'pending';
  get diagnostics v_leave = row_count;

  update public.attendance_correction_requests
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = coalesce(review_notes, 'Closed automatically during offboarding')
  where employee_id = new.id and status = 'pending';
  get diagnostics v_corrections = row_count;

  perform public.log_audit(
    'employee.offboarded',
    'employees',
    new.id::text,
    jsonb_build_object(
      'profile_disabled', coalesce(v_profiles, 0) > 0,
      'leave_cancelled', v_leave,
      'corrections_closed', v_corrections
    )
  );

  return new;
end;
$$;

drop trigger if exists employees_offboarding on public.employees;
create trigger employees_offboarding
  after update of employment_status on public.employees
  for each row execute function public.handle_employee_offboarding();

revoke execute on function public.handle_employee_offboarding() from public, anon, authenticated;
