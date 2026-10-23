-- ============================================================================
-- Orange SL Attendance — Storage & Security Polish
-- Ensures the 'avatars' bucket exists and provides correct Super Admin roles.
-- ============================================================================

-- 1. Ensure Storage Bucket
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Create the avatars bucket if it doesn't exist
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'avatars',
      'avatars',
      true,
      2097152, -- 2MB
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    -- Bucket-level RLS Policies
    -- Note: storage.objects RLS might already exist from previous migrations,
    -- but we ensure the 'avatars' specific ones are robust.

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
end $$;

-- 2. Security Polish: Ensure public.is_hr_admin() includes 'super_admin'
-- Many UI and RLS checks rely on is_hr_admin().
create or replace function public.is_hr_admin()
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('hr_admin', 'super_admin')
  );
end;
$$;

-- 3. Security Polish: Ensure public.is_hr() includes 'super_admin'
create or replace function public.is_hr()
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('hr_admin', 'hr_officer', 'super_admin')
  );
end;
$$;
