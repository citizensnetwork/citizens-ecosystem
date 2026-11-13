-- Promise: a new world starts empty. No row is carried over from anywhere: no people, no
-- listings, no categories, no settings. The only rows are the engine's own default wording.

do $probe$
declare
  v_table record;
  v_rows bigint;
  v_filled text[] := array[]::text[];
begin
  for v_table in
    select c.relname::text as name
      from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     order by 1
  loop
    execute format('select count(*) from public.%I', v_table.name) into v_rows;
    if v_rows > 0 and v_table.name <> 'engine_wording' then
      v_filled := v_filled || array[v_table.name || ' (' || v_rows || ')']::text[];
    end if;
  end loop;
  if array_length(v_filled, 1) > 0 then
    raise exception 'PROBE FAILED: tables that do not arrive empty: %', array_to_string(v_filled, ', ');
  end if;

  if exists (select 1 from public.engine_wording where source <> 'engine') then
    raise exception 'PROBE FAILED: the wording table holds rows that are not engine defaults';
  end if;
  if not exists (select 1 from public.engine_wording) then
    raise exception 'PROBE FAILED: the engine default wording is missing';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'PROBE FAILED: there are accounts in a new world';
  end if;
  if exists (select 1 from engine.project_settings) then
    raise exception 'PROBE FAILED: per-project settings arrived filled in';
  end if;
end;
$probe$;
