-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 195 (service areas). Run AFTER the apply, in the SQL editor.
--  Synthetic users only. Ends with RAISE EXCEPTION so NOTHING persists.
--  The error text is one PASS or FAIL per line. Nothing here names a real person.
--  Do not run this against production as a commit; the exception rolls the block back.
--
--  Covers: the selection rule (a tick never goes upward, matching goes downward only), the approval wall, the no-pin rule
--  for the main list, "Also served by" (radius, cap, order, dedupe), the radius needs a centre, who may write, who may read
--  what, that no client can write a table directly, and the owner-chosen Online / No fixed place tag.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a_owner   uuid := gen_random_uuid();  -- approved, no fixed location: ticks Eldoraigne
  b_pin     uuid := gen_random_uuid();  -- approved WITH a pin: radius around the pin
  c_hidden  uuid := gen_random_uuid();  -- approved but hidden: ticks Pretoria
  d_pending uuid := gen_random_uuid();  -- applicant, still pending
  e_kzn     uuid := gen_random_uuid();  -- approved, no fixed location: ticks KwaZulu-Natal
  f_citizen uuid := gen_random_uuid();  -- an ordinary Citizen
  g_editor  uuid := gen_random_uuid();  -- active editor of a_owner
  h_admin   uuid := gen_random_uuid();
  i_gauteng uuid := gen_random_uuid();  -- approved, no fixed location: ticks Gauteng as a whole
  j_pretoria uuid := gen_random_uuid(); -- approved, no fixed location: ticks Pretoria as a whole
  k_radius  uuid := gen_random_uuid();  -- approved, no fixed location: ticks Midrand with a 50 km radius
  area_eld uuid; area_cen uuid; area_pta uuid; area_gp uuid; area_kzn uuid; area_mid uuid; area_hat uuid; area_jhb uuid;
  res text[] := '{}';
  r jsonb;
  n int;
  n2 int;
  d numeric;
  first_id uuid;
  ids uuid[];
begin
  select id into area_eld from public.service_areas where slug = 'eldoraigne';
  select id into area_cen from public.service_areas where slug = 'centurion';
  select id into area_pta from public.service_areas where slug = 'pretoria';
  select id into area_gp  from public.service_areas where slug = 'gauteng';
  select id into area_kzn from public.service_areas where slug = 'kwazulu-natal';
  select id into area_mid from public.service_areas where slug = 'midrand';
  select id into area_hat from public.service_areas where slug = 'hatfield';
  select id into area_jhb from public.service_areas where slug = 'johannesburg';

  select count(*) into n from public.service_areas;
  res := array_append(res, (case when n >= 26 then 'PASS' else 'FAIL' end) || ' seed present (' || n || ' areas)');
  select count(*) into n from public.service_areas where level = 'province';
  res := array_append(res, (case when n = 9 then 'PASS' else 'FAIL' end) || ' nine provinces');
  begin
    insert into public.service_areas (level, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east)
      values ('suburb', 'Orphan', 'probe195-orphan', -25.7, 28.2, -25.8, 28.1, -25.6, 28.3);
    res := array_append(res, 'FAIL a suburb with no parent was accepted');
  exception when others then
    res := array_append(res, 'PASS a suburb with no parent is refused (' || sqlstate || ')');
  end;
  begin
    insert into public.service_areas (level, parent_id, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east)
      values ('suburb', area_gp, 'Skipped level', 'probe195-skip', -25.7, 28.2, -25.8, 28.1, -25.6, 28.3);
    res := array_append(res, 'FAIL a suburb directly under a province was accepted');
  exception when others then
    res := array_append(res, 'PASS a suburb directly under a province is refused (' || sqlstate || ')');
  end;

  insert into auth.users (id, email) values
    (a_owner, 'probe195-a@probe.example'), (b_pin, 'probe195-b@probe.example'), (c_hidden, 'probe195-c@probe.example'),
    (d_pending, 'probe195-d@probe.example'), (e_kzn, 'probe195-e@probe.example'), (f_citizen, 'probe195-f@probe.example'),
    (g_editor, 'probe195-g@probe.example'), (h_admin, 'probe195-h@probe.example'), (i_gauteng, 'probe195-i@probe.example'),
    (j_pretoria, 'probe195-j@probe.example'), (k_radius, 'probe195-k@probe.example');

  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_no_fixed_location = true, contributor_slug = 'probe195-a', full_name = 'Probe A Online' where id = a_owner;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_no_fixed_location = false, physical_latitude = -25.76, physical_longitude = 28.24, contributor_slug = 'probe195-b', full_name = 'Probe Z Pinned' where id = b_pin;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = true, contributor_no_fixed_location = true, contributor_slug = 'probe195-c', full_name = 'Probe C Hidden' where id = c_hidden;
  update public.profiles set role = 'citizen', contributor_status = 'pending', contributor_no_fixed_location = false, full_name = 'Probe D Pending' where id = d_pending;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_no_fixed_location = true, contributor_slug = 'probe195-e', full_name = 'Probe E Natal' where id = e_kzn;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id = f_citizen;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id = g_editor;
  update public.profiles set role = 'admin' where id = h_admin;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_no_fixed_location = true, contributor_slug = 'probe195-i', full_name = 'Probe I Whole Gauteng' where id = i_gauteng;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_no_fixed_location = true, contributor_slug = 'probe195-j', full_name = 'Probe J Whole Pretoria' where id = j_pretoria;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_no_fixed_location = true, contributor_slug = 'probe195-k', full_name = 'Probe K Wide Range' where id = k_radius;

  insert into public.contributor_applications (user_id, status, display_name, no_fixed_location)
    values (d_pending, 'pending', 'Probe D Pending', true);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (a_owner, g_editor, 'editor', 'active', a_owner);

  -- 1. not signed in: nothing writes
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  r := public.set_service_areas(a_owner, array[area_eld]);
  res := array_append(res, (case when r->>'reason' = 'not_authenticated' then 'PASS' else 'FAIL' end) || ' no JWT: not_authenticated');

  -- 2. the owner ticks Eldoraigne only
  perform set_config('request.jwt.claims', json_build_object('sub', a_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a_owner::text, true);
  execute 'set local role authenticated';
  r := public.set_service_areas(a_owner, array[area_eld, area_eld]);
  res := array_append(res, (case when (r->>'success')::boolean and jsonb_array_length(r->'area_ids') = 1 then 'PASS' else 'FAIL' end) || ' owner saves one area (duplicates folded)');
  select count(*) into n from public.contributor_service_areas where contributor_id = a_owner;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' exactly one link stored: a tick never propagates upward (' || n || ')');
  select count(*) into n from public.contributor_service_areas where contributor_id = a_owner and area_id in (area_cen, area_pta, area_gp);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' Centurion, Pretoria and Gauteng are NOT served');

  r := public.set_service_areas(a_owner, array[area_eld], 50, null);
  res := array_append(res, (case when (r->>'success')::boolean and (r->>'radius_centre_area_id')::uuid = area_eld then 'PASS' else 'FAIL' end) || ' radius with one tick defaults its centre to that area');
  r := public.set_service_areas(a_owner, array[area_eld], 50, area_pta);
  res := array_append(res, (case when r->>'reason' = 'centre_not_ticked' then 'PASS' else 'FAIL' end) || ' a radius centre must be a ticked area');
  r := public.set_service_areas(a_owner, array[]::uuid[], 50, null);
  res := array_append(res, (case when r->>'reason' = 'radius_needs_centre' then 'PASS' else 'FAIL' end) || ' radius with no tick and no pin is refused (needs a centre)');
  r := public.set_service_areas(a_owner, array[area_eld], 101, null);
  res := array_append(res, (case when r->>'reason' = 'radius_out_of_range' then 'PASS' else 'FAIL' end) || ' radius above 100 km is refused');
  r := public.set_service_areas(a_owner, array[area_eld], 0, null);
  res := array_append(res, (case when r->>'reason' = 'radius_out_of_range' then 'PASS' else 'FAIL' end) || ' radius of 0 is refused');
  r := public.set_service_areas(a_owner, array[gen_random_uuid()]);
  res := array_append(res, (case when r->>'reason' = 'unknown_area' then 'PASS' else 'FAIL' end) || ' an unknown area id is refused');
  select array_agg(a.id) into ids from public.service_areas a limit 21;
  r := public.set_service_areas(a_owner, ids);
  res := array_append(res, (case when r->>'reason' = 'too_many_areas' then 'PASS' else 'FAIL' end) || ' more than 20 areas is refused');
  select count(*) into n from public.contributor_service_areas where contributor_id = a_owner;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a refused save changes nothing');
  r := public.set_service_areas(a_owner, array[area_eld], null, null, 'travelling');
  res := array_append(res, (case when r->>'reason' = 'invalid_presence' then 'PASS' else 'FAIL' end) || ' an unknown presence tag is refused');
  r := public.set_service_areas(a_owner, array[area_eld], null, null, null);
  res := array_append(res, (case when r->>'reason' = 'invalid_presence' then 'PASS' else 'FAIL' end) || ' a null presence tag is refused');
  r := public.set_service_areas(a_owner, array[area_eld]); -- back to a plain tick, no radius
  select count(*) into n from public.contributor_service_radius where contributor_id = a_owner;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' saving without a radius removes the radius');
  select count(*) into n from public.contributor_service_presence where contributor_id = a_owner and presence = 'online';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the tag defaults to online');

  -- 3. who may write for whom
  r := public.set_service_areas(e_kzn, array[area_kzn]);
  res := array_append(res, (case when r->>'reason' = 'not_allowed' then 'PASS' else 'FAIL' end) || ' a Contributor cannot write another Contributor''s areas');
  begin
    insert into public.contributor_service_areas (contributor_id, area_id) values (a_owner, area_gp);
    res := array_append(res, 'FAIL direct insert into contributor_service_areas was accepted');
  exception when others then
    res := array_append(res, 'PASS direct insert into contributor_service_areas is refused (' || sqlstate || ')');
  end;
  begin
    delete from public.contributor_service_areas where contributor_id = a_owner;
    get diagnostics n = row_count;
    res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' direct delete is refused or removes nothing');
  exception when others then
    res := array_append(res, 'PASS direct delete is refused (' || sqlstate || ')');
  end;
  begin
    execute 'truncate public.contributor_service_areas';
    res := array_append(res, 'FAIL TRUNCATE was accepted');
  exception when others then
    res := array_append(res, 'PASS TRUNCATE is refused (' || sqlstate || ')');
  end;
  begin
    insert into public.service_areas (level, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east)
      values ('province', 'Forged', 'probe195-forged', -25.7, 28.2, -25.8, 28.1, -25.6, 28.3);
    res := array_append(res, 'FAIL a signed-in user could add a service area');
  exception when others then
    res := array_append(res, 'PASS a signed-in user cannot add a service area (' || sqlstate || ')');
  end;

  -- an editor of the listing may write; a stranger may not
  perform set_config('request.jwt.claims', json_build_object('sub', g_editor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', g_editor::text, true);
  r := public.set_service_areas(a_owner, array[area_eld, area_cen]);
  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' an active editor can write the listing''s areas');
  r := public.set_service_areas(e_kzn, array[area_kzn]);
  res := array_append(res, (case when r->>'reason' = 'not_allowed' then 'PASS' else 'FAIL' end) || ' an editor cannot write a listing they do not edit');
  r := public.set_service_areas(a_owner, array[area_eld]);

  perform set_config('request.jwt.claims', json_build_object('sub', f_citizen, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f_citizen::text, true);
  r := public.set_service_areas(f_citizen, array[area_eld]);
  res := array_append(res, (case when r->>'reason' = 'not_a_contributor' then 'PASS' else 'FAIL' end) || ' a Citizen who never applied cannot choose areas');

  -- a pending applicant may (the wizard saves after the application row exists)
  perform set_config('request.jwt.claims', json_build_object('sub', d_pending, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', d_pending::text, true);
  r := public.set_service_areas(d_pending, array[area_pta], 25, null);
  res := array_append(res, (case when (r->>'success')::boolean and (r->>'radius_centre_area_id')::uuid = area_pta then 'PASS' else 'FAIL' end) || ' a pending applicant can choose areas and a radius');
  select count(*) into n from public.contributor_service_areas where contributor_id = d_pending;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a pending applicant can read back their own areas (the owner arm of the signed-in policy)');
  perform set_config('request.jwt.claims', json_build_object('sub', f_citizen, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f_citizen::text, true);
  select count(*) into n from public.contributor_service_areas where contributor_id = d_pending;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a signed-in stranger cannot read a pending applicant''s areas');
  perform set_config('request.jwt.claims', json_build_object('sub', d_pending, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', d_pending::text, true);

  -- the rest of the cast, written by the admin
  perform set_config('request.jwt.claims', json_build_object('sub', h_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', h_admin::text, true);
  r := public.set_service_areas(c_hidden, array[area_pta]);
  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' an admin can write for a Contributor');
  perform public.set_service_areas(e_kzn, array[area_kzn]);
  perform public.set_service_areas(i_gauteng, array[area_gp]);
  r := public.set_service_areas(j_pretoria, array[area_pta], null, null, 'no_fixed_place');
  res := array_append(res, (case when (r->>'success')::boolean and r->>'presence' = 'no_fixed_place' then 'PASS' else 'FAIL' end) || ' the owner can choose No fixed place');
  r := public.set_service_areas(k_radius, array[area_mid], 50, null);
  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' radius around a ticked area is saved');
  r := public.set_service_areas(b_pin, array[area_pta], 100, null);
  res := array_append(res, (case when (r->>'success')::boolean and r->'radius_centre_area_id' = 'null'::jsonb then 'PASS' else 'FAIL' end) || ' a pinned Contributor''s radius is centred on their pin, even with an area ticked');
  r := public.set_service_areas(b_pin, array[]::uuid[], 100, null);
  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' a pinned Contributor needs no area for a radius');
  perform public.set_service_areas(b_pin, array[area_pta], 100, null);
  perform public.set_service_areas(f_citizen, array[]::uuid[]);  -- (refused: not a Contributor; no row either way)
  r := public.set_service_areas(e_kzn, array[]::uuid[]);
  select count(*) into n from public.contributor_service_presence where contributor_id = e_kzn;
  res := array_append(res, (case when (r->>'success')::boolean and n = 0 then 'PASS' else 'FAIL' end) || ' clearing every area also clears the tag');
  perform public.set_service_areas(e_kzn, array[area_kzn]);

  -- 4. what the public sees. Back to anon.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';

  select count(*) into n from public.service_areas;
  res := array_append(res, (case when n >= 26 then 'PASS' else 'FAIL' end) || ' anon reads the area hierarchy');
  select count(*) into n from public.contributor_service_areas where contributor_id in (c_hidden, d_pending);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a hidden or pending Contributor''s areas');
  select count(*) into n from public.contributor_service_radius where contributor_id = d_pending;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a pending applicant''s radius');
  select count(*) into n from public.contributor_service_presence where contributor_id in (c_hidden, d_pending);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a hidden or pending Contributor''s tag');
  select count(*) into n from public.contributor_service_areas where contributor_id = a_owner;
  res := array_append(res, (case when n = 2 or n = 1 then 'PASS' else 'FAIL' end) || ' anon reads a live Contributor''s areas');
  begin
    perform public.set_service_areas(a_owner, array[area_gp]);
    res := array_append(res, 'FAIL anon can execute set_service_areas');
  exception when others then
    res := array_append(res, 'PASS anon cannot execute set_service_areas (' || sqlstate || ')');
  end;

  -- the downward-only rule, through the real read function (a_owner ticked Eldoraigne only)
  select count(*) into n from public.serving_area_listings(area_eld) where section = 'main' and contributor_id = a_owner;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' viewer in Eldoraigne finds the Contributor who ticked Eldoraigne');
  select count(*) into n from public.serving_area_listings(area_eld) where section = 'main' and contributor_id = j_pretoria;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' (Pretoria is NOT a parent of Eldoraigne: Eldoraigne sits under Centurion)');
  select count(*) into n from public.serving_area_listings(area_eld) where section = 'main' and contributor_id = i_gauteng;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' viewer in Eldoraigne also finds someone who ticked Gauteng as a whole (ancestor)');
  select count(*) into n from public.serving_area_listings(area_cen) where section = 'main' and contributor_id = a_owner;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' viewer in Centurion does NOT find the Eldoraigne-only Contributor (never upward)');
  select count(*) into n from public.serving_area_listings(area_gp) where section = 'main' and contributor_id = a_owner;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' viewer zoomed out to Gauteng does NOT find the Eldoraigne-only Contributor');
  select count(*) into n from public.serving_area_listings(area_gp) where section = 'main' and contributor_id = i_gauteng;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' viewer in Gauteng finds those who ticked Gauteng as a whole');
  select count(*) into n from public.serving_area_listings(area_hat) where section = 'main' and contributor_id = j_pretoria;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' viewer in Hatfield finds the one who ticked all of Pretoria (a tick means everything inside)');
  select count(*) into n from public.serving_area_listings(area_eld) where section = 'main' and contributor_id in (e_kzn);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' another province''s Contributor is not listed');

  -- the tag travels with each row
  select count(*) into n from public.serving_area_listings(area_eld) where section = 'main' and contributor_id = a_owner and presence = 'online';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a main row carries the default Online tag');
  select count(*) into n from public.serving_area_listings(area_hat) where section = 'main' and contributor_id = j_pretoria and presence = 'no_fixed_place';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a main row carries the chosen No fixed place tag (not labelled Online)');

  -- the approval wall and the no-pin rule
  select count(*) into n from public.serving_area_listings(area_pta) where contributor_id = c_hidden;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a hidden Contributor is never listed');
  select count(*) into n from public.serving_area_listings(area_pta) where contributor_id = d_pending;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a pending applicant is never listed');
  select count(*) into n from public.serving_area_listings(area_pta) where section = 'main' and contributor_id = b_pin;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a Contributor with a pin is never in the main (online or no fixed place) list');

  -- Also served by: K is 50 km around Midrand, which reaches Pretoria and Johannesburg, but is not in their main list
  select count(*) into n from public.serving_area_listings(area_pta) where section = 'also' and contributor_id = k_radius;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a 50 km radius around Midrand reaches Pretoria (Also served by)');
  select count(*) into n from public.serving_area_listings(area_pta) where section = 'also' and contributor_id = b_pin;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a pinned Contributor''s 100 km radius reaches Pretoria (Also served by)');
  select count(*) into n from public.serving_area_listings(area_pta) where section = 'also' and contributor_id = b_pin and presence is null;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a pinned Contributor''s Also served by row carries no Online tag (they are on the map)');
  select count(*) into n from public.serving_area_listings(area_pta) where section = 'also' and contributor_id = k_radius and presence = 'online';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' an unpinned Contributor''s Also served by row carries their tag');
  select count(*) into n from public.serving_area_listings(area_kzn) where section = 'also';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' nothing is "also served" in a faraway province');
  select count(*) into n from public.serving_area_listings(area_mid) where section = 'main' and contributor_id = k_radius;
  select count(*) into n2 from public.serving_area_listings(area_mid) where section = 'also' and contributor_id = k_radius;
  res := array_append(res, (case when n = 1 and n2 = 0 then 'PASS' else 'FAIL' end) || ' someone already in the main list is not repeated under Also served by');
  select min(distance_km) into d from public.serving_area_listings(area_pta) where section = 'also';
  res := array_append(res, (case when d is not null then 'PASS' else 'FAIL' end) || ' distance is reported');
  select contributor_id into first_id from public.serving_area_listings(area_pta) where section = 'also' limit 1;
  res := array_append(res, (case when first_id = b_pin then 'PASS' else 'FAIL' end) || ' Also served by comes nearest first (the Z-named pinned Contributor, about 2 km away, before the A-named one, about 28 km away)');
  select count(*) into n from public.serving_area_listings(area_pta, 1) where section = 'also';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the Also served by cap is honoured');
  select count(*) into n from public.serving_area_listings(area_pta, 0) where section = 'also';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a cap of 0 returns none');
  select count(*) into n from public.serving_area_listings(gen_random_uuid());
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' an unknown area returns nothing');

  -- the public function exposes no contact details
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'contributor_service_areas' and column_name ilike '%email%';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' no contact column on the link table');

  -- 4b. the read function re-applies the approval wall itself: as an ADMIN (whose RLS shows every link row) it still
  --     returns neither the hidden Contributor nor the pending applicant
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', h_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', h_admin::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.contributor_service_areas where contributor_id in (c_hidden, d_pending);
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' (setup check) the admin''s own RLS does show the hidden and pending links');
  select count(*) into n from public.serving_area_listings(area_pta) where contributor_id in (c_hidden, d_pending);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the read function itself drops hidden and pending Contributors, whoever asks');

  execute 'reset role';

  -- 5. grants (as the catalog sees them)
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('service_areas', 'contributor_service_areas', 'contributor_service_radius', 'contributor_service_presence')
     and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon and authenticated hold SELECT only on the four tables (' || n || ' extra)');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.set_service_areas(uuid, uuid[], integer, uuid, text)', 'execute') then 'PASS' else 'FAIL' end) || ' anon cannot execute set_service_areas');
  res := array_append(res, (case when has_function_privilege('authenticated', 'public.set_service_areas(uuid, uuid[], integer, uuid, text)', 'execute') then 'PASS' else 'FAIL' end) || ' authenticated can execute set_service_areas (guarded inside)');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.service_areas_check_parent()', 'execute') and not has_function_privilege('authenticated', 'public.service_areas_check_parent()', 'execute') then 'PASS' else 'FAIL' end) || ' the trigger function is not executable by anon or authenticated');
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'serving_area_listings' and p.prosecdef;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' serving_area_listings is SECURITY INVOKER');
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('set_service_areas', 'serving_area_listings', 'service_areas_check_parent')
     and not (coalesce(p.proconfig, '{}') && array['search_path=""']);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' all three functions pin an empty search_path');

  raise exception E'PROBE 195 RESULTS (rolled back):\n%', array_to_string(res, E'\n');
end
$probe$;
