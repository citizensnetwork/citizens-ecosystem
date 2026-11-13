-- Engine baseline 0001: extensions, the engine's private schema, and safe defaults for new objects.
--
-- This file and every file after it belong to the engine line. They are applied to a tenant's own
-- database project, in order, and never to any other project.

-- ── Extensions the baseline uses ────────────────────────────────────
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ── The engine's private schema ─────────────────────────────────────
-- It is not served by the data API, and the roles that speak through the data API cannot use it.
create schema if not exists engine;
revoke all on schema engine from public;

-- Which engine migrations this database has. Every migration file ends by writing its own row.
create table engine.schema_migrations (
  version text not null,
  name text not null,
  applied_at timestamp with time zone not null default now(),
  constraint schema_migrations_pkey primary key (version),
  constraint schema_migrations_version_format check (version ~ '^[0-9]{4}$')
);
alter table engine.schema_migrations enable row level security;

-- Values that differ per project and are set when the project is provisioned (for example the
-- address its scheduled jobs call). Never a password: a key stored here must be a publishable one.
create table engine.project_settings (
  key text not null,
  value text not null,
  updated_at timestamp with time zone not null default now(),
  constraint project_settings_pkey primary key (key),
  constraint project_settings_key_format check (key ~ '^[a-z][a-z0-9_]{0,62}$')
);
alter table engine.project_settings enable row level security;

revoke all on all tables in schema engine from public, anon, authenticated, service_role;

-- ── A fingerprint of the schema, for the drift report ───────────────
-- One row per part and one row for the whole. Two databases on the same engine version must give
-- the same rows. Names are written out in full (empty search path), and every list is ordered
-- byte by byte, so the result does not depend on the session or the database's language settings.
create function engine.schema_fingerprint()
returns table (part text, hash text)
language plpgsql
stable
set search_path = ''
as $fingerprint$
declare
  v_public constant oid := 'public'::pg_catalog.regnamespace::oid;
begin
  return query
  with parts(part, line) as (
    select 'columns'::text,
           c.relname::text || '.' || a.attname::text || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod)
             || (case when a.attnotnull then ' not null' else '' end)
             || coalesce(' default ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
      from pg_catalog.pg_class c
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where c.relnamespace = v_public and c.relkind = 'r'
    union all
    select 'row_security', c.relname::text || ' ' || c.relrowsecurity::text || ' ' || c.relforcerowsecurity::text
      from pg_catalog.pg_class c
     where c.relnamespace = v_public and c.relkind = 'r'
    union all
    select 'constraints', c.relname::text || '.' || k.conname::text || ' ' || pg_catalog.pg_get_constraintdef(k.oid, true)
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
     where k.connamespace = v_public
       -- NOT NULL is counted with the columns; newer Postgres versions also list it here.
       and k.contype in ('p', 'u', 'c', 'f', 'x')
    union all
    select 'indexes', pg_catalog.pg_get_indexdef(i.indexrelid)
      from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid = i.indexrelid
     where c.relnamespace = v_public
    union all
    select 'policies',
           c.relname::text || '.' || p.polname::text || ' ' || p.polcmd::text || ' ' || p.polpermissive::text || ' '
             || coalesce((select pg_catalog.string_agg(
                                   case when r = 0 then 'public' else pg_catalog.pg_get_userbyid(r) end,
                                   ',' order by case when r = 0 then 'public' else pg_catalog.pg_get_userbyid(r) end collate "C")
                            from pg_catalog.unnest(p.polroles) r), '')
             || ' using ' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '')
             || ' check ' || coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
     where c.relnamespace = v_public
    union all
    select 'triggers', pg_catalog.pg_get_triggerdef(t.oid, true) || ' ' || t.tgenabled::text
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_proc f on f.oid = t.tgfoid
     where not t.tgisinternal and (c.relnamespace = v_public or f.pronamespace = v_public)
    union all
    select 'functions',
           f.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(f.oid) || ') returns '
             || pg_catalog.pg_get_function_result(f.oid) || ' ' || l.lanname::text || ' ' || f.provolatile::text
             || ' definer=' || f.prosecdef::text || ' config=' || coalesce(pg_catalog.array_to_string(f.proconfig, ','), '')
             || ' body=' || pg_catalog.md5(pg_catalog.replace(f.prosrc, pg_catalog.chr(13), ''))
      from pg_catalog.pg_proc f
      join pg_catalog.pg_language l on l.oid = f.prolang
     where f.pronamespace = v_public
       and not exists (select 1 from pg_catalog.pg_depend x where x.objid = f.oid and x.deptype = 'e')
    union all
    select 'views', c.relname::text || ' ' || coalesce(pg_catalog.array_to_string(c.reloptions, ','), '') || ' '
             || pg_catalog.pg_get_viewdef(c.oid, true)
      from pg_catalog.pg_class c
     where c.relnamespace = v_public and c.relkind = 'v'
    union all
    select 'table_grants',
           c.relname::text || ' ' || (case when g.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(g.grantee) end)
             || ' ' || g.privilege_type
      from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(c.relacl) g
     where c.relnamespace = v_public and c.relkind in ('r', 'v', 'S')
       and (g.grantee = 0 or pg_catalog.pg_get_userbyid(g.grantee) in ('anon', 'authenticated', 'service_role'))
    union all
    select 'column_grants',
           c.relname::text || '.' || a.attname::text || ' '
             || (case when g.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(g.grantee) end)
             || ' ' || g.privilege_type
      from pg_catalog.pg_class c
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join lateral pg_catalog.aclexplode(a.attacl) g
     where c.relnamespace = v_public and c.relkind = 'r'
    union all
    select 'function_grants',
           f.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(f.oid) || ') '
             || (case when g.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(g.grantee) end)
      from pg_catalog.pg_proc f
      cross join lateral pg_catalog.aclexplode(f.proacl) g
     where f.pronamespace = v_public
       and not exists (select 1 from pg_catalog.pg_depend x where x.objid = f.oid and x.deptype = 'e')
       and (g.grantee = 0 or pg_catalog.pg_get_userbyid(g.grantee) in ('anon', 'authenticated', 'service_role'))
  ),
  hashed as (
    select p.part, pg_catalog.md5(pg_catalog.string_agg(p.line, pg_catalog.chr(10) order by p.line collate "C")) as hash
      from parts p
     group by p.part
  )
  select h.part, h.hash from hashed h
  union all
  select 'all', pg_catalog.md5(pg_catalog.string_agg(h.part || '=' || h.hash, ',' order by h.part collate "C"))
    from hashed h;
end;
$fingerprint$;
revoke all on function engine.schema_fingerprint() from public, anon, authenticated, service_role;

-- ── Safe defaults for objects created from now on ───────────────────
-- A new project gives the data API roles every privilege on every new table, sequence and function
-- in "public". Row security does not stop a TRUNCATE. From here on nothing is granted to those roles
-- unless a migration says so, object by object (file 0007 does it for the baseline).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

insert into engine.schema_migrations (version, name) values ('0001', 'extensions_and_default_privileges');
