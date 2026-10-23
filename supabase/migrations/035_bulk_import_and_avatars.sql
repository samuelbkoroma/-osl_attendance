-- ---------------------------------------------------------------------------
-- 035: profile photos and bulk-import support
-- ---------------------------------------------------------------------------

-- Expose the linked profile through PostgREST so employee/team queries can
-- return avatar_url without a second round-trip. NOT VALID keeps the migration
-- safe for legacy rows while enforcing the relationship for future writes.
alter table public.employees
  drop constraint if exists employees_user_id_profile_fkey;
alter table public.employees
  add constraint employees_user_id_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete set null not valid;

-- Public avatar bucket. Storage is not present in the lightweight SQL test
-- harness, so guard every storage statement.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'avatars',
      'avatars',
      true,
      2097152,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "Avatars are publicly readable" on storage.objects';
    execute 'create policy "Avatars are publicly readable" on storage.objects
      for select using (bucket_id = ''avatars'')';

    execute 'drop policy if exists "Users upload their own avatar" on storage.objects';
    execute 'create policy "Users upload their own avatar" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = ''avatars''
        and (storage.foldername(name))[1] = auth.uid()::text
      )';

    execute 'drop policy if exists "Users update their own avatar" on storage.objects';
    execute 'create policy "Users update their own avatar" on storage.objects
      for update to authenticated
      using (
        bucket_id = ''avatars''
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = ''avatars''
        and (storage.foldername(name))[1] = auth.uid()::text
      )';

    execute 'drop policy if exists "Users delete their own avatar" on storage.objects';
    execute 'create policy "Users delete their own avatar" on storage.objects
      for delete to authenticated
      using (
        bucket_id = ''avatars''
        and (storage.foldername(name))[1] = auth.uid()::text
      )';
  end if;
end;
$$;
