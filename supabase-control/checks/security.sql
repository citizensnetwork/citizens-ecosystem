-- The security check of the control-plane line. It changes nothing; it raises one error listing
-- every finding. Run it after the control-plane migrations, on any database.
--
-- It looks for the mistakes that would open the control plane:
--   1. a table without row security
--   2. any row policy at all (there is none by design: nobody reads or writes a table directly)
--   3. a data API role (anon, authenticated, service_role) or "everyone" holding any privilege on
--      a table or a sequence of the private schema
--   4. a data API role or "everyone" able to use the private schema
--   5. a function in "public" that does not run with its owner's rights, has no empty search
--      path, or does not start by checking the caller
--   6. a private function that runs with its owner's rights (none needs to)
--   7. the audit log or the support grants without their guards, or with a guard switched off
--   8. a default that would hand new objects to the data API roles or to everyone

do $security$
declare
  v_findings text[] := array[]::text[];
  v_role text;
  v_privilege text;
  v_has_maintain constant boolean := pg_catalog.current_setting('server_version_num')::integer >= 170000;
  v_schemas constant oid[] := array['control'::regnamespace::oid, 'public'::regnamespace::oid];
begin
  -- 1
  v_findings := v_findings || coalesce((
    select array_agg('no row security: ' || c.relname::text order by c.relname)
      from pg_catalog.pg_class c
     where c.relnamespace = any (v_schemas) and c.relkind in ('r', 'p') and not c.relrowsecurity), array[]::text[]);

  -- 2
  v_findings := v_findings || coalesce((
    select array_agg('a row policy exists: ' || c.relname::text || '.' || p.polname::text order by c.relname, p.polname)
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
     where c.relnamespace = any (v_schemas)), array[]::text[]);

  -- 3
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      continue when v_privilege = 'MAINTAIN' and not v_has_maintain;
      v_findings := v_findings || coalesce((
        select array_agg(v_role || ' holds ' || v_privilege || ' on ' || c.relname::text order by c.relname)
          from pg_catalog.pg_class c
         where c.relnamespace = any (v_schemas) and c.relkind in ('r', 'p', 'v', 'm')
           and pg_catalog.has_table_privilege(v_role, c.oid, v_privilege)), array[]::text[]);
    end loop;
    v_findings := v_findings || coalesce((
      select array_agg(v_role || ' can use the sequence ' || c.relname::text order by c.relname)
        from pg_catalog.pg_class c
       where c.relnamespace = any (v_schemas)
         -- Inside a CASE, so the question is only ever asked about a sequence.
         and (case when c.relkind = 'S'
                   then pg_catalog.has_sequence_privilege(v_role, c.oid, 'USAGE, SELECT, UPDATE')
                   else false end)), array[]::text[]);
    -- 4
    if pg_catalog.has_schema_privilege(v_role, 'control', 'USAGE, CREATE') then
      v_findings := v_findings || array[v_role || ' can use the private schema']::text[];
    end if;
  end loop;
  v_findings := v_findings || coalesce((
    select array_agg('everyone holds ' || g.privilege_type || ' on ' || c.relname::text order by c.relname, g.privilege_type)
      from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(c.relacl) g
     where c.relnamespace = any (v_schemas) and g.grantee = 0), array[]::text[]);
  if exists (select 1 from pg_catalog.pg_namespace n
              cross join lateral pg_catalog.aclexplode(n.nspacl) g
              where n.nspname = 'control' and g.grantee = 0) then
    v_findings := v_findings || array['everyone can use the private schema']::text[];
  end if;

  -- 5
  v_findings := v_findings || coalesce((
    select array_agg('function without its owner''s rights: ' || p.proname::text order by p.proname)
      from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::regnamespace and not p.prosecdef
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')), array[]::text[]);
  v_findings := v_findings || coalesce((
    select array_agg('function without an empty search path: ' || p.proname::text order by p.proname)
      from pg_catalog.pg_proc p
     where p.pronamespace = any (v_schemas)
       and not ('search_path=""' = any (coalesce(p.proconfig, array[]::text[])))
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')), array[]::text[]);
  -- The check of the caller is the first declaration of every function, so it runs before the
  -- function reads an argument.
  v_findings := v_findings || coalesce((
    select array_agg('function that does not start by checking the caller: ' || p.proname::text order by p.proname)
      from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc !~ '^\s*declare\s+v_actor control\.superusers := control\.require_superuser\(('')?(support_operator)?('')?\);'
       and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')), array[]::text[]);

  -- 6
  v_findings := v_findings || coalesce((
    select array_agg('private function with its owner''s rights: ' || p.proname::text order by p.proname)
      from pg_catalog.pg_proc p
     where p.pronamespace = 'control'::regnamespace and p.prosecdef), array[]::text[]);

  -- 7
  v_findings := v_findings || coalesce((
    select array_agg('guard missing or switched off: ' || e.name order by e.name)
      from unnest(array[
             'audit_log.audit_log_no_change', 'audit_log.audit_log_no_truncate',
             'support_access_grants.support_access_grants_guard', 'support_access_grants.support_access_grants_no_truncate'
           ]) e(name)
     where not exists (
       select 1 from pg_catalog.pg_trigger t
         join pg_catalog.pg_class c on c.oid = t.tgrelid
        where c.relnamespace = 'control'::regnamespace
          and c.relname::text || '.' || t.tgname::text = e.name
          and t.tgenabled in ('O', 'A'))), array[]::text[]);
  if not exists (
       select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = 'control.audit_log'::regclass and t.tgname = 'audit_log_no_change'
          and (t.tgtype & 2) = 2 and (t.tgtype & 8) = 8 and (t.tgtype & 16) = 16) then
    v_findings := v_findings || array['the audit log guard does not cover both update and delete']::text[];
  end if;

  -- 8
  -- Without a stated default, a new function is open to everyone. The default must be stated.
  if not exists (select 1 from pg_catalog.pg_default_acl d
                  where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f') then
    v_findings := v_findings || array['a new function is open to everyone by default']::text[];
  end if;
  v_findings := v_findings || coalesce((
    select array_agg('a default hands new ' || case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' else d.defaclobjtype::text end
                     || ' to ' || case when g.grantee = 0 then 'everyone' else pg_catalog.pg_get_userbyid(g.grantee) end)
      from pg_catalog.pg_default_acl d
      cross join lateral pg_catalog.aclexplode(d.defaclacl) g
     where d.defaclrole = 'postgres'::regrole
       and (d.defaclnamespace = 0 or d.defaclnamespace = any (v_schemas))
       and (g.grantee = 0 or pg_catalog.pg_get_userbyid(g.grantee) in ('anon', 'authenticated', 'service_role'))), array[]::text[]);

  if pg_catalog.array_length(v_findings, 1) > 0 then
    raise exception 'SECURITY CHECK FAILED (% findings): %',
      pg_catalog.array_length(v_findings, 1), pg_catalog.array_to_string(v_findings, '; ');
  end if;
end;
$security$;
