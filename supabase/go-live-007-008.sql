-- ============================================================
-- ODC Attendance — GO-LIVE SQL (migrations 007 + 008 combined)
-- Run this WHOLE block once in: Supabase Dashboard → SQL Editor
-- It is idempotent (safe to run again if it fails partway).
-- ============================================================

-- ############################################################
-- # PART 1 — Attendance security & integrity (007)
-- ############################################################

-- 1. RLS: students may only self-mark attendance into a session of a
--    class they are actively enrolled in, and only while the session
--    is active and within the attendance window (90 minutes).
drop policy if exists "Insert attendance" on public.attendance_records;

create policy "Insert attendance"
  on public.attendance_records for insert
  with check (
    (
      student_id = auth.uid()
      and exists (
        select 1
        from public.sessions s
        join public.enrollments e
          on e.class_id = s.class_id
         and e.user_id = auth.uid()
         and e.is_active = true
        where s.id = session_id
          and s.is_active = true
          and s.start_time > now() - interval '90 minutes'
      )
    )
    or
    exists (
      select 1
      from public.sessions s
      join public.profiles p on p.id = auth.uid()
      where s.id = session_id
        and (s.tutor_id = auth.uid() or p.role = 'admin')
    )
  );

-- 2. RLS: only the session's own tutor (or an admin) may update
--    attendance records.
drop policy if exists "Update attendance" on public.attendance_records;

create policy "Update attendance"
  on public.attendance_records for update
  using (
    exists (
      select 1
      from public.sessions s
      join public.profiles p on p.id = auth.uid()
      where s.id = session_id
        and (s.tutor_id = auth.uid() or p.role = 'admin')
    )
  );

-- 3. Integrity: a class may only have one active session at a time.
create unique index if not exists sessions_one_active_per_class
  on public.sessions (class_id)
  where is_active = true;

-- 4. Data cleanup: close stale active sessions.
update public.sessions
set is_active = false,
    end_time   = coalesce(end_time, start_time)
where is_active = true
  and start_time < now() - interval '90 minutes';

-- 5. Student IDs must be unique: reassign duplicates (keeps the
--    earliest-created account) using the ID sequence.
do $$
declare
  dup record;
  new_id text;
begin
  for dup in
    select p.id, p.student_id
    from public.profiles p
    where p.role = 'student'
      and p.student_id is not null
      and p.id not in (
        select distinct on (student_id) id
        from public.profiles
        where role = 'student' and student_id is not null
        order by student_id, created_at asc
      )
  loop
    new_id := public.get_next_student_id();
    update public.profiles set student_id = new_id where id = dup.id;
  end loop;
end $$;

create unique index if not exists profiles_student_id_unique
  on public.profiles (student_id)
  where student_id is not null;

-- ############################################################
-- # PART 2 — Privacy & forced password change (008)
-- ############################################################

-- 1. PRIVACY: students may only view their own profile.
--    Tutors and admins may view everyone.
drop policy if exists "Authenticated users can view profiles" on public.profiles;

create policy "Profiles viewable by tutors/admins and self"
  on public.profiles for select
  using (
    id = auth.uid()
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('tutor','admin')
  );

-- 2. PRIVACY: students may only view their own enrollments.
drop policy if exists "Authenticated users can view enrollments" on public.enrollments;

create policy "Enrollments viewable by tutors/admins and self"
  on public.enrollments for select
  using (
    user_id = auth.uid()
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('tutor','admin')
  );

-- 3. FORCED PASSWORD CHANGE: flag defaulting to true.
alter table public.profiles
  add column if not exists must_change_password boolean not null default true;

-- Existing students and tutors must change their password on next login
update public.profiles
set must_change_password = true
where role in ('student','tutor');

-- Admin accounts are not forced
update public.profiles
set must_change_password = false
where role = 'admin';

-- New accounts: students/tutors forced, admins not
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, student_id, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    new.raw_user_meta_data ->> 'student_id',
    coalesce(new.raw_user_meta_data ->> 'role', 'student') <> 'admin'
  );
  return new;
end;
$$ language plpgsql security definer;
