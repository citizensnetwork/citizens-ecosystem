-- The security check of the engine line. It changes nothing; it raises one error listing every
-- finding. Run it after the engine migrations, on any database.
--
-- It looks for the mistakes that turn into a leak:
--   1. a table in "public" without row security
--   2. a data API role (anon, authenticated) holding TRUNCATE, REFERENCES, TRIGGER or MAINTAIN
--      on a table or view (row security does not stop a TRUNCATE)
--   3. a view that does not run with the caller's own rights
--   4. a function that runs with its owner's rights but without a fixed search path
--   5. a data API role able to write one of the engine's own tables, or to use the private schema
--   6. the service role able to change what this world is allowed

do $security$
declare
  v_findings text[] := array[]::text[];
  v_role text;
  v_privilege text;
  v_table text;
  v_has_maintain constant boolean := pg_catalog.current_setting('server_version_num')::integer >= 170000;
begin
  -- 1
  v_findings := v_findings || coalesce((
    select array_agg('no row security: ' || c.relname::text order by c.relname)
      from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity), array[]::text[]);

  -- 2
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_privilege in array array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      continue when v_privilege = 'MAINTAIN' and not v_has_maintain;
      v_findings := v_findings || coalesce((
        select array_agg(v_role || ' holds ' || v_privilege || ' on ' || c.relname::text order by c.relname)
          from pg_catalog.pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
           and pg_catalog.has_table_privilege(v_role, c.oid, v_privilege)), array[]::text[]);
    end loop;
    v_findings := v_findings || coalesce((
      select array_agg(v_role || ' can write the view ' || c.relname::text order by c.relname)
        from pg_catalog.pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
         and pg_catalog.has_table_privilege(v_role, c.oid, 'INSERT, UPDATE, DELETE')), array[]::text[]);
  end loop;

  -- 3
  v_findings := v_findings || coalesce((
    select array_agg('view without security_invoker: ' || c.relname::text order by c.relname)
      from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
       and not ('security_invoker=on' = any (coalesce(c.reloptions, array[]::text[])))
       and not ('security_invoker=true' = any (coalesce(c.reloptions, array[]::text[])))), array[]::text[]);

  -- 4
  v_findings := v_findings || coalesce((
    select array_agg('security definer without a fixed search path: ' || p.proname::text order by p.proname)
      from pg_catalog.pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'engine'::regnamespace)
       and p.prosecdef
       and not exists (
         select 1 from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) s where s like 'search_path=%')), array[]::text[]);

  -- 5
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_table in array array['engine_entitlements', 'engine_configuration', 'engine_wording', 'categories'] loop
      if pg_catalog.has_table_privilege(v_role, ('public.' || v_table)::regclass, 'INSERT, UPDATE, DELETE, TRUNCATE') then
        v_findings := v_findings || array[v_role || ' can write ' || v_table]::text[];
      end if;
    end loop;
    if pg_catalog.has_table_privilege(v_role, 'public.engine_wording'::regclass, 'SELECT') then
      v_findings := v_findings || array[v_role || ' can read engine_wording directly']::text[];
    end if;
    if pg_catalog.has_schema_privilege(v_role, 'engine', 'USAGE') then
      v_findings := v_findings || array[v_role || ' can use the private schema']::text[];
    end if;
    if pg_catalog.has_function_privilege(v_role, 'public.publish_engine_configuration(jsonb, jsonb, uuid)', 'EXECUTE') then
      v_findings := v_findings || array[v_role || ' can publish a configuration directly']::text[];
    end if;
  end loop;

  -- 6
  if pg_catalog.has_table_privilege('service_role', 'public.engine_entitlements'::regclass, 'INSERT, UPDATE, DELETE, TRUNCATE') then
    v_findings := v_findings || array['service_role can write engine_entitlements']::text[];
  end if;
  if pg_catalog.has_table_privilege('service_role', 'public.engine_configuration'::regclass, 'INSERT, UPDATE, DELETE, TRUNCATE') then
    v_findings := v_findings || array['service_role can write engine_configuration without publishing']::text[];
  end if;
  if pg_catalog.has_schema_privilege('service_role', 'engine', 'USAGE') then
    v_findings := v_findings || array['service_role can use the private schema']::text[];
  end if;

  if pg_catalog.array_length(v_findings, 1) > 0 then
    raise exception 'SECURITY CHECK FAILED (% findings): %',
      pg_catalog.array_length(v_findings, 1), pg_catalog.array_to_string(v_findings, '; ');
  end if;
end;
$security$;
