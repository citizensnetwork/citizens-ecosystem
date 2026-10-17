-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 183_saved_items (run 2026-10-17, 21 of 21 PASS before the apply, as a dry run
--  that included the migration's statements, and again after the apply, as this file).
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds three synthetic users (a saver, a stranger and an
--  approved Contributor with places), exercises every policy as anon, the owner and a stranger, and ends with RAISE
--  EXCEPTION, so the whole transaction rolls back and NOTHING persists. The result comes back in the error text.
--  Read it as: one line per check, PASS or FAIL. Nothing here names a real person or organisation.
--  (A place cannot be deleted within 6 months of creation, so the probe back-dates its own places first.)
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  pl uuid; pl2 uuid; n int; res text[] := '{}';
begin
  insert into auth.users (id, email) values (a, 'probe-a@probe.example'), (b, 'probe-b@probe.example'), (c, 'probe-c@probe.example');
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-contrib' where id = c;
  insert into public.places (name, latitude, longitude, created_by) values ('Probe place', -25.7, 28.2, c) returning id into pl;
  insert into public.places (name, latitude, longitude, created_by) values ('Probe place 2', -25.71, 28.21, c) returning id into pl2;
  update public.places set created_at = now() - interval '1 year' where created_by = c;

  -- anon
  execute 'set local role anon';
  begin perform 1 from public.saved_items; res := array_append(res, 'FAIL anon can select'); exception when insufficient_privilege then res := array_append(res, 'PASS anon select denied'); end;
  begin insert into public.saved_items(user_id, contributor_id) values (a, c); res := array_append(res, 'FAIL anon can insert'); exception when insufficient_privilege then res := array_append(res, 'PASS anon insert denied'); end;
  execute 'reset role';

  -- the owner (a)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  insert into public.saved_items(user_id, contributor_id) values (a, c);
  insert into public.saved_items(user_id, place_id) values (a, pl);
  select count(*) into n from public.saved_items;
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' owner reads own 2 (got ' || n || ')');
  begin insert into public.saved_items(user_id, contributor_id) values (a, c); res := array_append(res, 'FAIL duplicate accepted'); exception when unique_violation then res := array_append(res, 'PASS duplicate contributor save refused'); end;
  begin insert into public.saved_items(user_id, place_id) values (a, pl); res := array_append(res, 'FAIL duplicate place accepted'); exception when unique_violation then res := array_append(res, 'PASS duplicate place save refused'); end;
  begin insert into public.saved_items(user_id) values (a); res := array_append(res, 'FAIL no target accepted'); exception when check_violation then res := array_append(res, 'PASS no target refused'); end;
  begin insert into public.saved_items(user_id, contributor_id, place_id) values (a, c, pl2); res := array_append(res, 'FAIL two targets accepted'); exception when check_violation then res := array_append(res, 'PASS two targets refused'); end;
  begin insert into public.saved_items(user_id, contributor_id) values (a, a); res := array_append(res, 'FAIL self save accepted'); exception when check_violation then res := array_append(res, 'PASS saving yourself refused'); end;
  begin insert into public.saved_items(user_id, contributor_id) values (b, c); res := array_append(res, 'FAIL wrote a row for someone else'); exception when insufficient_privilege then res := array_append(res, 'PASS cannot write a row for someone else'); end;
  begin insert into public.saved_items(user_id, place_id) values (a, gen_random_uuid()); res := array_append(res, 'FAIL dangling place accepted'); exception when foreign_key_violation then res := array_append(res, 'PASS dangling place refused'); end;
  begin update public.saved_items set created_at = now(); res := array_append(res, 'FAIL update allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no UPDATE'); end;
  begin truncate public.saved_items; res := array_append(res, 'FAIL truncate allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no TRUNCATE'); end;
  execute 'reset role';

  -- a stranger (b)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.saved_items;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' stranger reads 0 of a''s rows (got ' || n || ')');
  delete from public.saved_items; get diagnostics n = row_count;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' stranger deletes 0 (got ' || n || ')');
  execute 'reset role';

  -- the owner deletes their own
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  delete from public.saved_items where contributor_id = c; get diagnostics n = row_count;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' owner deletes own (got ' || n || ')');
  execute 'reset role';

  -- the cap of 500
  insert into public.places (name, latitude, longitude, created_by) select 'cap ' || g, -25.7, 28.2, c from generate_series(1, 500) g;
  update public.places set created_at = now() - interval '1 year' where created_by = c;
  insert into public.saved_items(user_id, place_id) select b, id from public.places where name like 'cap %';
  begin insert into public.saved_items(user_id, place_id) values (b, pl2); res := array_append(res, 'FAIL 501st save accepted');
  exception when raise_exception then res := array_append(res, (case when sqlerrm = 'saved_items_limit' then 'PASS' else 'FAIL' end) || ' 501st save refused: ' || sqlerrm); end;

  -- cascade: deleting a listing takes its saves with it
  insert into public.saved_items(user_id, place_id) values (a, pl2);
  delete from public.places where id = pl2;
  select count(*) into n from public.saved_items where place_id = pl2;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' place delete cascades its saves (left ' || n || ')');
  insert into public.saved_items(user_id, contributor_id) values (a, c);
  delete from auth.users where id = c;
  select count(*) into n from public.saved_items where contributor_id = c;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' contributor delete cascades its saves (left ' || n || ')');

  -- grants and policies
  res := array_append(res, (case when not has_function_privilege('anon', 'public.saved_items_cap()', 'EXECUTE') and not has_function_privilege('authenticated', 'public.saved_items_cap()', 'EXECUTE') then 'PASS' else 'FAIL' end) || ' cap function not callable by anon or authenticated');
  res := array_append(res, (case when has_table_privilege('authenticated', 'public.saved_items', 'SELECT') and has_table_privilege('authenticated', 'public.saved_items', 'INSERT') and has_table_privilege('authenticated', 'public.saved_items', 'DELETE') and not has_table_privilege('authenticated', 'public.saved_items', 'UPDATE') and not has_table_privilege('authenticated', 'public.saved_items', 'TRUNCATE') and not has_table_privilege('anon', 'public.saved_items', 'SELECT') then 'PASS' else 'FAIL' end) || ' table grants are exactly select, insert, delete for authenticated');
  select count(*) into n from pg_policies where tablename = 'saved_items';
  res := array_append(res, (case when n = 3 then 'PASS' else 'FAIL' end) || ' 3 policies (got ' || n || ')');
  raise exception 'PROBE_RESULT:%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
