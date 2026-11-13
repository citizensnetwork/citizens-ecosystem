-- TEST ONLY. Never applied to a real project.
--
-- A hosted database project already has these things before the first engine migration runs:
-- the data API roles, the sign-in and file storage schemas, the realtime publication and the job
-- scheduler. A bare Postgres (the one in CI, and the in-memory one the unit tests use) does not.
-- This file adds whatever is missing, and nothing where it already exists, so the same baseline
-- files can be built and probed anywhere. Run it as a superuser, before 0001.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres login createrole createdb bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$roles$;

grant usage on schema public to anon, authenticated, service_role;
grant create on schema public to postgres;
create schema if not exists extensions;
grant usage on schema extensions to public;
grant create on schema extensions to postgres;

-- ── sign-in ─────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, postgres;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone default now()
);
grant all on table auth.users to postgres;

do $auth$
begin
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(
        coalesce(
          current_setting('request.jwt.claim.sub', true),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        ), '')::uuid
    $f$;
  end if;
  if to_regprocedure('auth.role()') is null then
    create function auth.role() returns text language sql stable as $f$
      select nullif(
        coalesce(
          current_setting('request.jwt.claim.role', true),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        ), '')
    $f$;
  end if;
  if to_regprocedure('auth.jwt()') is null then
    create function auth.jwt() returns jsonb language sql stable as $f$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $f$;
  end if;
end;
$auth$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to public;

-- ── file storage ────────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role, postgres;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  created_at timestamp with time zone default now()
);
alter table storage.buckets add column if not exists public boolean default false;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamp with time zone default now()
);
alter table storage.objects enable row level security;
grant all on table storage.buckets, storage.objects to postgres;

do $storage$
declare
  v_owner text;
begin
  if to_regprocedure('storage.foldername(text)') is null then
    create function storage.foldername(name text) returns text[] language sql immutable as $f$
      select (string_to_array(name, '/'))[1 : greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
    $f$;
  end if;
  -- On a hosted project the migration role may add rules to the file table. Make that true here.
  select pg_get_userbyid(c.relowner) into v_owner from pg_class c where c.oid = 'storage.objects'::regclass;
  if v_owner <> 'postgres' and not pg_has_role('postgres', v_owner, 'member') then
    execute format('grant %I to postgres', v_owner);
  end if;
end;
$storage$;
grant execute on function storage.foldername(text) to public;

-- ── realtime ────────────────────────────────────────────────────────
do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if (select pg_get_userbyid(pubowner) from pg_publication where pubname = 'supabase_realtime') <> 'postgres'
     and not (select rolsuper from pg_roles where rolname = 'postgres') then
    alter publication supabase_realtime owner to postgres;
  end if;
end;
$realtime$;

-- ── scheduler and outbound calls ────────────────────────────────────
-- Where the real extensions can be installed they are, and the migration role is allowed to use
-- them. Where they cannot (the in-memory database), small stand-ins record what was scheduled.
do $jobs$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    create schema if not exists cron;
    create table if not exists cron.job (
      jobid bigserial primary key,
      jobname text unique,
      schedule text not null,
      command text not null,
      active boolean not null default true
    );
    if to_regprocedure('cron.schedule(text,text,text)') is null then
      create function cron.schedule(job_name text, schedule text, command text) returns bigint
      language sql as $f$
        insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
        on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
        returning jobid
      $f$;
    end if;
  end;
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    create schema if not exists net;
    if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
      create function net.http_post(
        url text,
        body jsonb default '{}'::jsonb,
        params jsonb default '{}'::jsonb,
        headers jsonb default '{}'::jsonb,
        timeout_milliseconds integer default 5000
      ) returns bigint language sql as $f$ select 1::bigint $f$;
    end if;
  end;
end;
$jobs$;
grant usage on schema cron to postgres;
grant all on all tables in schema cron to postgres;
grant all on all sequences in schema cron to postgres;
grant execute on all functions in schema cron to postgres;
grant usage on schema net to postgres;
grant execute on all functions in schema net to postgres;
