-- ============================================================================
-- shim.sql — minimal Supabase environment shim for LOCAL testing only
-- (scripts/db-test). Creates the auth schema/roles Supabase provides so the
-- real migrations can be executed and verified on a local PostgreSQL.
-- NEVER run this against Supabase.
-- ============================================================================
create extension if not exists pgcrypto;
do $$ begin if not exists (
  select 1
  from pg_roles
  where rolname = 'anon'
) then create role anon nologin;
end if;
if not exists (
  select 1
  from pg_roles
  where rolname = 'authenticated'
) then create role authenticated nologin;
end if;
if not exists (
  select 1
  from pg_roles
  where rolname = 'service_role'
) then create role service_role nologin bypassrls;
end if;
end;
$$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
select nullif(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;
create or replace function auth.role() returns text language sql stable as $$
select coalesce(
    nullif(
      current_setting('request.jwt.claim.role', true),
      ''
    ),
    'anon'
  );
$$;
-- Supabase grants these by default; client roles must reach auth.uid()
-- from RLS policies and direct queries.
grant usage on schema auth to anon,
  authenticated,
  service_role;
grant execute on function auth.uid() to anon,
  authenticated,
  service_role;
grant execute on function auth.jwt() to anon,
  authenticated,
  service_role;
grant execute on function auth.role() to anon,
  authenticated,
  service_role;
-- Supabase provisions this publication; create a stand-in locally so
-- migrations that publish tables for Realtime take the same code path.
do $$ begin if not exists (
  select 1
  from pg_publication
  where pubname = 'supabase_realtime'
) then create publication supabase_realtime;
end if;
end $$;