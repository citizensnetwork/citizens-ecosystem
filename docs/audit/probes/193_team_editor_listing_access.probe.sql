-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 193. Run AFTER the apply, in the SQL editor.
--  Synthetic users only. Ends with RAISE EXCEPTION so NOTHING persists.
--  The error text is one PASS or FAIL per line. Nothing here names a real person.
--  Do not run this against production as a commit; the exception rolls the block back.
--
--  Writes exercise every table log_team_editor_write is attached to.
--  A shared IF that reads created_by or contributor_id on a table without
--  that column fails here as: record "new" has no field "...". That line
--  is a FAIL for the owner and the editor as well as for a viewer.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  owner uuid := gen_random_uuid();
  editor uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  pending uuid := gen_random_uuid();
  hidden uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  res text[] := '{}';
  n int;
  ok boolean;
  bio text;
  logged int;
  news_id uuid;
  event_id uuid;
  place_id uuid;
  source_id uuid;
  service_id uuid;
begin
  insert into auth.users (id, email) values
    (owner, 'probe193-owner@probe.example'),
    (editor, 'probe193-editor@probe.example'),
    (viewer, 'probe193-viewer@probe.example'),
    (pending, 'probe193-pending@probe.example'),
    (hidden, 'probe193-hidden@probe.example'),
    (stranger, 'probe193-stranger@probe.example');

  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_slug = 'probe193-owner' where id = owner;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = editor;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = viewer;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = pending;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = true, contributor_slug = 'probe193-hidden' where id = hidden;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = stranger;

  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (owner, editor, 'editor', 'active', owner);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (owner, viewer, 'viewer', 'active', owner);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (owner, pending, 'editor', 'pending', owner);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (hidden, editor, 'editor', 'active', hidden);

  perform set_config('request.jwt.claims', json_build_object('sub', editor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', editor::text, true);
  execute 'set local role authenticated';

  select public.is_active_team_member(owner, array['editor']) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' editor is an active editor of the live listing');
  select public.is_active_team_member(owner, array['viewer']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' editor is not a viewer of the listing');
  select public.is_active_team_member(hidden, array['editor']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' editor of a hidden listing is not active');

  -- news_posts (contributor_id). Insert, update, delete, and a refused owner move.
  begin
    insert into public.news_posts (contributor_id, title, body)
    values (owner, 'Editor note', 'Written for the listing')
    returning id into news_id;
    res := array_append(res, 'PASS editor can insert news owned by the contributor');
  exception when others then
    news_id := null;
    res := array_append(res, 'FAIL editor news insert: ' || sqlerrm);
  end;

  select count(*) into logged from public.activity_log
    where contributor_id = owner and actor_id = editor and actor_role = 'team_editor' and action = 'insert_news_posts';
  res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL' end) || ' editor news insert is logged as team_editor');

  if news_id is not null then
    begin
      update public.news_posts set title = 'Editor note revised' where id = news_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can update news');
    exception when others then
      res := array_append(res, 'FAIL editor news update: ' || sqlerrm);
    end;
    begin
      update public.news_posts set contributor_id = stranger where id = news_id;
      res := array_append(res, 'FAIL editor moved news onto another owner');
    exception when others then
      res := array_append(res, (case when sqlerrm ilike '%owner_change_forbidden%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor cannot move news owner');
    end;
    begin
      delete from public.news_posts where id = news_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can delete news');
    exception when others then
      res := array_append(res, 'FAIL editor news delete: ' || sqlerrm);
    end;
  end if;

  -- events (created_by)
  begin
    insert into public.events (created_by, title, date)
    values (owner, 'Editor event', now())
    returning id into event_id;
    res := array_append(res, 'PASS editor can insert an event owned by the contributor');
  exception when others then
    event_id := null;
    res := array_append(res, 'FAIL editor event insert: ' || sqlerrm);
  end;
  if event_id is not null then
    select count(*) into logged from public.activity_log
      where actor_id = editor and actor_role = 'team_editor' and action = 'insert_events' and entity_id = event_id::text;
    res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL' end) || ' editor event insert is logged as team_editor');
    begin
      update public.events set title = 'Editor event revised' where id = event_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can update an event');
    exception when others then
      res := array_append(res, 'FAIL editor event update: ' || sqlerrm);
    end;
    begin
      update public.events set created_by = stranger where id = event_id;
      res := array_append(res, 'FAIL editor moved event onto another owner');
    exception when others then
      res := array_append(res, (case when sqlerrm ilike '%owner_change_forbidden%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor cannot move event owner');
    end;
    begin
      delete from public.events where id = event_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can delete an event');
    exception when others then
      res := array_append(res, 'FAIL editor event delete: ' || sqlerrm);
    end;
  end if;

  -- places (created_by). Delete is aged past the six-month window first,
  -- as the table owner, so the delete trigger under test is the one that runs.
  begin
    insert into public.places (created_by, name, latitude, longitude)
    values (owner, 'Editor place', 0, 0)
    returning id into place_id;
    res := array_append(res, 'PASS editor can insert a place owned by the contributor');
  exception when others then
    place_id := null;
    res := array_append(res, 'FAIL editor place insert: ' || sqlerrm);
  end;
  if place_id is not null then
    select count(*) into logged from public.activity_log
      where actor_id = editor and actor_role = 'team_editor' and action = 'insert_places' and entity_id = place_id::text;
    res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL' end) || ' editor place insert is logged as team_editor');
    begin
      update public.places set name = 'Editor place revised' where id = place_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can update a place');
    exception when others then
      res := array_append(res, 'FAIL editor place update: ' || sqlerrm);
    end;
    begin
      update public.places set created_by = stranger where id = place_id;
      res := array_append(res, 'FAIL editor moved place onto another owner');
    exception when others then
      res := array_append(res, (case when sqlerrm ilike '%owner_change_forbidden%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor cannot move place owner');
    end;

    begin
      insert into public.specialised_services (place_id, contributor_id, service)
      values (place_id, owner, 'Editor service')
      returning id into service_id;
      res := array_append(res, 'PASS editor can insert a service owned by the contributor');
    exception when others then
      service_id := null;
      res := array_append(res, 'FAIL editor service insert: ' || sqlerrm);
    end;
    if service_id is not null then
      select count(*) into logged from public.activity_log
        where actor_id = editor and actor_role = 'team_editor' and action = 'insert_specialised_services' and entity_id = service_id::text;
      res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL' end) || ' editor service insert is logged as team_editor');
      begin
        update public.specialised_services set service = 'Editor service revised' where id = service_id;
        get diagnostics n = row_count;
        res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL rows=' || n end) || ' editor service update is not granted');
      exception when others then
        res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL ' else 'PASS ' end) || 'editor service update: ' || sqlerrm);
      end;
      begin
        delete from public.specialised_services where id = service_id;
        get diagnostics n = row_count;
        res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can delete a service');
      exception when others then
        res := array_append(res, 'FAIL editor service delete: ' || sqlerrm);
      end;
    end if;

    execute 'reset role';
    update public.places set created_at = now() - interval '7 months' where id = place_id;
    perform set_config('request.jwt.claims', json_build_object('sub', editor, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', editor::text, true);
    execute 'set local role authenticated';
    begin
      delete from public.places where id = place_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can delete a place');
    exception when others then
      res := array_append(res, 'FAIL editor place delete: ' || sqlerrm);
    end;
  end if;

  -- listing_sources (contributor_id). Update touches enabled, the column
  -- authenticated is granted.
  begin
    insert into public.listing_sources (contributor_id, kind, url)
    values (owner, 'website', 'https://probe.example/editor-source')
    returning id into source_id;
    res := array_append(res, 'PASS editor can insert a source owned by the contributor');
  exception when others then
    source_id := null;
    res := array_append(res, 'FAIL editor source insert: ' || sqlerrm);
  end;
  if source_id is not null then
    select count(*) into logged from public.activity_log
      where actor_id = editor and actor_role = 'team_editor' and action = 'insert_listing_sources' and entity_id = source_id::text;
    res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL' end) || ' editor source insert is logged as team_editor');
    begin
      update public.listing_sources set enabled = false where id = source_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can update a source');
    exception when others then
      res := array_append(res, 'FAIL editor source update: ' || sqlerrm);
    end;
    begin
      delete from public.listing_sources where id = source_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' editor can delete a source');
    exception when others then
      res := array_append(res, 'FAIL editor source delete: ' || sqlerrm);
    end;
  end if;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('bio', 'Probe bio'));
    select p.bio into bio from public.profiles p where p.id = owner;
    res := array_append(res, (case when bio = 'Probe bio' then 'PASS' else 'FAIL' end) || ' editor rpc updates bio');
  exception when others then
    res := array_append(res, 'FAIL editor bio rpc: ' || sqlerrm);
  end;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('role', 'admin'));
    res := array_append(res, 'FAIL editor rpc accepted role');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%forbidden_field%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor rpc rejects role');
  end;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('billing_tier', 'paid'));
    res := array_append(res, 'FAIL editor rpc accepted billing_tier');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%forbidden_field%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor rpc rejects billing_tier');
  end;

  update public.profiles set role = 'admin' where id = owner;
  select count(*) into n from public.profiles where id = owner and role = 'contributor';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' editor direct profiles update does not change role');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', viewer::text, true);
  execute 'set local role authenticated';

  select public.is_active_team_member(owner, array['editor']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' viewer is not an editor');

  begin
    insert into public.news_posts (contributor_id, title, body) values (owner, 'Viewer note', 'Should fail');
    res := array_append(res, 'FAIL viewer inserted news');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL viewer news insert: ' || sqlerrm else 'PASS viewer cannot insert news' end));
  end;
  begin
    insert into public.events (created_by, title, date) values (owner, 'Viewer event', now());
    res := array_append(res, 'FAIL viewer inserted an event');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL viewer event insert: ' || sqlerrm else 'PASS viewer cannot insert an event' end));
  end;
  begin
    insert into public.places (created_by, name, latitude, longitude) values (owner, 'Viewer place', 0, 0);
    res := array_append(res, 'FAIL viewer inserted a place');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL viewer place insert: ' || sqlerrm else 'PASS viewer cannot insert a place' end));
  end;
  begin
    insert into public.listing_sources (contributor_id, kind, url) values (owner, 'website', 'https://probe.example/viewer-source');
    res := array_append(res, 'FAIL viewer inserted a source');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL viewer source insert: ' || sqlerrm else 'PASS viewer cannot insert a source' end));
  end;
  begin
    insert into public.specialised_services (place_id, contributor_id, service)
    values ('00000000-0000-0000-0000-000000000001', owner, 'Viewer service');
    res := array_append(res, 'FAIL viewer inserted a service');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL viewer service insert: ' || sqlerrm else 'PASS viewer cannot insert a service' end));
  end;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('bio', 'Viewer bio'));
    res := array_append(res, 'FAIL viewer rpc updated the profile');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%unauthorized%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' viewer rpc is unauthorized');
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.news_posts (contributor_id, title, body) values (owner, 'Stranger note', 'Should fail');
    res := array_append(res, 'FAIL stranger inserted news');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL stranger news insert: ' || sqlerrm else 'PASS stranger cannot insert news' end));
  end;
  begin
    insert into public.events (created_by, title, date) values (owner, 'Stranger event', now());
    res := array_append(res, 'FAIL stranger inserted an event');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL stranger event insert: ' || sqlerrm else 'PASS stranger cannot insert an event' end));
  end;
  begin
    insert into public.places (created_by, name, latitude, longitude) values (owner, 'Stranger place', 0, 0);
    res := array_append(res, 'FAIL stranger inserted a place');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL stranger place insert: ' || sqlerrm else 'PASS stranger cannot insert a place' end));
  end;
  begin
    insert into public.listing_sources (contributor_id, kind, url) values (owner, 'website', 'https://probe.example/stranger-source');
    res := array_append(res, 'FAIL stranger inserted a source');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL stranger source insert: ' || sqlerrm else 'PASS stranger cannot insert a source' end));
  end;
  begin
    insert into public.specialised_services (place_id, contributor_id, service)
    values ('00000000-0000-0000-0000-000000000001', owner, 'Stranger service');
    res := array_append(res, 'FAIL stranger inserted a service');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%has no field%' then 'FAIL stranger service insert: ' || sqlerrm else 'PASS stranger cannot insert a service' end));
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', pending, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pending::text, true);
  execute 'set local role authenticated';
  select public.is_active_team_member(owner, array['editor']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' pending membership is not active');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.news_posts (contributor_id, title, body) values (owner, 'Owner note', 'Still theirs')
    returning id into news_id;
    res := array_append(res, 'PASS owner can still insert their own news');
  exception when others then
    news_id := null;
    res := array_append(res, 'FAIL owner news insert: ' || sqlerrm);
  end;
  select count(*) into logged from public.activity_log
    where actor_id = owner and actor_role = 'team_editor';
  res := array_append(res, (case when logged = 0 then 'PASS' else 'FAIL' end) || ' owner news insert is not logged as team_editor');
  if news_id is not null then
    begin
      update public.news_posts set title = 'Owner note revised' where id = news_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can update their own news');
    exception when others then
      res := array_append(res, 'FAIL owner news update: ' || sqlerrm);
    end;
    begin
      delete from public.news_posts where id = news_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can delete their own news');
    exception when others then
      res := array_append(res, 'FAIL owner news delete: ' || sqlerrm);
    end;
  end if;

  begin
    insert into public.events (created_by, title, date) values (owner, 'Owner event', now()) returning id into event_id;
    res := array_append(res, 'PASS owner can insert their own event');
  exception when others then
    event_id := null;
    res := array_append(res, 'FAIL owner event insert: ' || sqlerrm);
  end;
  if event_id is not null then
    begin
      update public.events set title = 'Owner event revised' where id = event_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can update their own event');
    exception when others then
      res := array_append(res, 'FAIL owner event update: ' || sqlerrm);
    end;
    begin
      delete from public.events where id = event_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can delete their own event');
    exception when others then
      res := array_append(res, 'FAIL owner event delete: ' || sqlerrm);
    end;
  end if;

  begin
    insert into public.places (created_by, name, latitude, longitude) values (owner, 'Owner place', 0, 0) returning id into place_id;
    res := array_append(res, 'PASS owner can insert their own place');
  exception when others then
    place_id := null;
    res := array_append(res, 'FAIL owner place insert: ' || sqlerrm);
  end;
  if place_id is not null then
    begin
      update public.places set name = 'Owner place revised' where id = place_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can update their own place');
    exception when others then
      res := array_append(res, 'FAIL owner place update: ' || sqlerrm);
    end;
    begin
      insert into public.specialised_services (place_id, contributor_id, service)
      values (place_id, owner, 'Owner service') returning id into service_id;
      res := array_append(res, 'PASS owner can insert their own service');
    exception when others then
      service_id := null;
      res := array_append(res, 'FAIL owner service insert: ' || sqlerrm);
    end;
    if service_id is not null then
      begin
        delete from public.specialised_services where id = service_id;
        get diagnostics n = row_count;
        res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can delete their own service');
      exception when others then
        res := array_append(res, 'FAIL owner service delete: ' || sqlerrm);
      end;
    end if;
    execute 'reset role';
    update public.places set created_at = now() - interval '7 months' where id = place_id;
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', owner::text, true);
    execute 'set local role authenticated';
    begin
      delete from public.places where id = place_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can delete their own place');
    exception when others then
      res := array_append(res, 'FAIL owner place delete: ' || sqlerrm);
    end;
  end if;

  begin
    insert into public.listing_sources (contributor_id, kind, url)
    values (owner, 'website', 'https://probe.example/owner-source') returning id into source_id;
    res := array_append(res, 'PASS owner can insert their own source');
  exception when others then
    source_id := null;
    res := array_append(res, 'FAIL owner source insert: ' || sqlerrm);
  end;
  if source_id is not null then
    begin
      update public.listing_sources set enabled = false where id = source_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can update their own source');
    exception when others then
      res := array_append(res, 'FAIL owner source update: ' || sqlerrm);
    end;
    begin
      delete from public.listing_sources where id = source_id;
      get diagnostics n = row_count;
      res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL rows=' || n end) || ' owner can delete their own source');
    exception when others then
      res := array_append(res, 'FAIL owner source delete: ' || sqlerrm);
    end;
  end if;

  raise exception '%', array_to_string(res, E'\n');
end
$probe$;
