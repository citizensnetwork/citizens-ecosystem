-- Engine baseline 0005: the functions that go in after a change.
--
-- Each one is the source function with the smallest edit that makes it fit a world of its own:
-- its sentences are read by key from the wording table, a fixed list becomes data, or a check
-- against something that stays out is removed. The reason is stated above each function.

set check_function_bodies = off;

-- The checks against two sibling apps are removed.
CREATE OR REPLACE FUNCTION public.admin_delete_citizen_account(_user_id uuid, _apply boolean DEFAULT false, _confirm text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_row record;
  v_blockers text[] := '{}';
  v_follows integer;
  v_place_follows integer;
  v_saves integer;
  v_rsvps integer;
  v_comments integer;
  v_moments integer;
  v_messages integer;
  v_notifications integer;
  v_deleted integer;
  v_expected text;
  v_meta jsonb;
begin
  if v_caller is null or not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select id, role, full_name
    into v_row
    from public.profiles
   where id = _user_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_row.id = v_caller then
    return jsonb_build_object('success', false, 'reason', 'cannot_delete_self');
  end if;
  if v_row.role = 'admin' then
    return jsonb_build_object('success', false, 'reason', 'target_is_admin');
  end if;
  if v_row.role is distinct from 'citizen' then
    return jsonb_build_object('success', false, 'reason', 'not_a_citizen');
  end if;

  select count(*) into v_follows from public.follows where follower_id = _user_id or followee_id = _user_id;
  select count(*) into v_place_follows from public.place_follows where user_id = _user_id;
  select count(*) into v_saves from public.saved_items where user_id = _user_id;
  select count(*) into v_rsvps from public.rsvps where user_id = _user_id;
  select count(*) into v_comments from public.comments where user_id = _user_id;
  select count(*) into v_moments from public.moments where contributor_id = _user_id;
  select count(*) into v_messages from public.messages where sender_id = _user_id;
  select count(*) into v_notifications from public.notifications where user_id = _user_id;

  if not coalesce(_apply, false) then
    return jsonb_build_object(
      'success', true,
      'name', v_row.full_name,
      'follows', v_follows,
      'place_follows', v_place_follows,
      'saves', v_saves,
      'rsvps', v_rsvps,
      'comments', v_comments,
      'moments', v_moments,
      'messages', v_messages,
      'notifications', v_notifications,
      'blockers', to_jsonb(v_blockers)
    );
  end if;

  if cardinality(v_blockers) > 0 then
    return jsonb_build_object('success', false, 'reason', 'blocked', 'blockers', to_jsonb(v_blockers));
  end if;

  v_expected := lower(btrim(regexp_replace(coalesce(nullif(btrim(v_row.full_name), ''), 'delete'), '\s+', ' ', 'g')));
  if lower(btrim(regexp_replace(coalesce(_confirm, ''), '\s+', ' ', 'g'))) is distinct from v_expected then
    return jsonb_build_object('success', false, 'reason', 'name_mismatch');
  end if;

  perform 1 from public.profiles where id = _user_id for update;

  -- Re-read under the lock. A role change between the check and the delete must not slip through.
  select id, role into v_row from public.profiles where id = _user_id;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_row.id = v_caller then
    return jsonb_build_object('success', false, 'reason', 'cannot_delete_self');
  end if;
  if v_row.role = 'admin' then
    return jsonb_build_object('success', false, 'reason', 'target_is_admin');
  end if;
  if v_row.role is distinct from 'citizen' then
    return jsonb_build_object('success', false, 'reason', 'not_a_citizen');
  end if;

  v_meta := jsonb_build_object(
    'follows', v_follows,
    'place_follows', v_place_follows,
    'saves', v_saves,
    'rsvps', v_rsvps,
    'comments', v_comments,
    'moments', v_moments,
    'messages', v_messages,
    'notifications', v_notifications
  );

  begin
    -- Their words must not remain with a null sender (messages.sender_id is ON DELETE SET NULL).
    delete from public.messages where sender_id = _user_id;
    delete from auth.users where id = _user_id;
    get diagnostics v_deleted = row_count;
  exception when foreign_key_violation then
    return jsonb_build_object('success', false, 'reason', 'blocked_by_related_data');
  end;

  if v_deleted = 0 then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (v_caller, 'citizen_account_deleted', 'profile', _user_id::text, v_meta);

  return jsonb_build_object('success', true, 'outcome', 'deleted') || v_meta;
end;
$function$;

-- The checks against two sibling apps are removed.
CREATE OR REPLACE FUNCTION public.admin_remove_contributor_listing(_user_id uuid, _apply boolean DEFAULT false, _confirm_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller   uuid := auth.uid();
  v_row      record;
  v_case     text;
  v_moved    boolean;
  v_events   int;
  v_places   int;
  v_news     int;
  v_team     int;
  v_blockers text[] := '{}';
  v_deleted  int;
  v_expected text;
begin
  if v_caller is null or not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  select id, role, full_name, contributor_slug, contributor_hidden, contributor_claimed_at
    into v_row
    from public.profiles
   where id = _user_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_row.id = v_caller then
    return jsonb_build_object('success', false, 'reason', 'cannot_delete_self');
  end if;
  if v_row.role = 'admin' then
    return jsonb_build_object('success', false, 'reason', 'target_is_admin');
  end if;
  if v_row.role <> 'contributor' then
    return jsonb_build_object('success', false, 'reason', 'not_a_listing');
  end if;

  -- Never signed in => a placeholder shell; signed in at least once => a person.
  v_case := case
    when exists (select 1 from auth.users u where u.id = _user_id and u.last_sign_in_at is null)
      then 'placeholder'
    else 'account'
  end;

  -- A placeholder whose listing was claimed from a DIFFERENT account: the claim
  -- copied the logo/cover URLs onto the claimant, so those files are now theirs.
  v_moved := coalesce(v_row.contributor_hidden, false)
             and v_row.contributor_slug is null
             and v_row.contributor_claimed_at is not null;

  select count(*) into v_events from public.events where created_by = _user_id and status = 'published';
  select count(*) into v_places from public.places where created_by = _user_id and status = 'published';
  select count(*) into v_news   from public.news_posts where contributor_id = _user_id;
  select count(*) into v_team   from public.team_memberships where contributor_id = _user_id and member_id <> _user_id;

  if not _apply then
    return jsonb_build_object(
      'success', true,
      'case', v_case,
      'name', v_row.full_name,
      'slug', v_row.contributor_slug,
      'events', v_events,
      'places', v_places,
      'news_posts', v_news,
      'team_members', v_team,
      'moved_placeholder', v_moved,
      'blockers', to_jsonb(v_blockers)
    );
  end if;

  -- ── apply ──────────────────────────────────────────────────────────
  if cardinality(v_blockers) > 0 then
    return jsonb_build_object('success', false, 'reason', 'blocked', 'blockers', to_jsonb(v_blockers));
  end if;

  v_expected := lower(btrim(regexp_replace(coalesce(nullif(btrim(v_row.full_name), ''), 'delete'), '\s+', ' ', 'g')));
  if lower(btrim(regexp_replace(coalesce(_confirm_name, ''), '\s+', ' ', 'g'))) is distinct from v_expected then
    return jsonb_build_object('success', false, 'reason', 'name_mismatch');
  end if;

  perform 1 from public.profiles where id = _user_id for update;

  if v_case = 'placeholder' then
    begin
      -- The predicate is the race guard: if the owner signed in after the check
      -- above, nothing is deleted.
      delete from auth.users where id = _user_id and last_sign_in_at is null;
      get diagnostics v_deleted = row_count;
    exception when foreign_key_violation then
      return jsonb_build_object('success', false, 'reason', 'blocked_by_related_data');
    end;
    if v_deleted = 0 then
      return jsonb_build_object('success', false, 'reason', 'signed_in_meanwhile');
    end if;

    insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
    values (v_caller, 'contributor_listing_deleted', 'profile', _user_id::text,
            jsonb_build_object('case', 'placeholder', 'name', v_row.full_name, 'slug', v_row.contributor_slug,
                               'events', v_events, 'places', v_places, 'news_posts', v_news,
                               'moved_placeholder', v_moved));

    return jsonb_build_object('success', true, 'outcome', 'deleted', 'case', 'placeholder',
                              'events', v_events, 'places', v_places, 'moved_placeholder', v_moved);
  end if;

  -- account: remove the listing, keep the person.
  update public.events set status = 'cancelled' where created_by = _user_id and status = 'published';
  get diagnostics v_events = row_count;
  update public.places set status = 'cancelled' where created_by = _user_id and status = 'published';
  get diagnostics v_places = row_count;
  delete from public.news_posts where contributor_id = _user_id;
  delete from public.team_memberships where contributor_id = _user_id;

  -- full_name, bio and avatar stay: they are the person's. contributor_hidden
  -- stays TRUE on purpose — self_approve_contributor_application never resets
  -- it, so if they apply again the new listing starts hidden until an admin
  -- unhides it in Listings (removal is moderation, not an instant revolving door).
  update public.profiles set
    role = 'citizen',
    contributor_status = 'not_applied',
    contributor_kind = null,
    contributor_category = null,
    contributor_slug = null,
    contributor_hidden = true,
    contributor_no_fixed_location = false,
    physical_address = null,
    physical_latitude = null,
    physical_longitude = null,
    logo_url = null,
    gallery_urls = '[]'::jsonb,
    cover_photo_urls = '[]'::jsonb,
    website_url = null,
    instagram_handle = null,
    facebook_url = null,
    tiktok_handle = null,
    youtube_url = null,
    x_handle = null,
    linkedin_url = null,
    whatsapp_number = null,
    contributor_contact_email = null,
    contributor_claim_email = null,
    contributor_claimed_at = null,
    needs_re_review = false
  where id = _user_id;

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (v_caller, 'contributor_listing_removed', 'profile', _user_id::text,
          jsonb_build_object('case', 'account', 'name', v_row.full_name, 'slug', v_row.contributor_slug,
                             'events_cancelled', v_events, 'places_cancelled', v_places,
                             'news_posts_deleted', v_news, 'team_members_removed', v_team));

  return jsonb_build_object('success', true, 'outcome', 'removed', 'case', 'account',
                            'events', v_events, 'places', v_places, 'moved_placeholder', false);
end;
$function$;

-- Notification text is read by key.
CREATE OR REPLACE FUNCTION public.approve_contributor_application(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  app record;
  new_slug text;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  select * into app from public.contributor_applications
    where id = _application_id and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found_or_not_pending');
  end if;

  new_slug := public.generate_contributor_slug(app.display_name);

  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_hidden = false,
    contributor_kind = coalesce(app.contributor_kind, contributor_kind),
    contributor_category = coalesce(app.contributor_category, contributor_category),
    full_name = coalesce(nullif(app.display_name, ''), full_name),
    bio = coalesce(app.bio, bio),
    website_url = coalesce(app.website_url, website_url),
    contributor_contact_email = coalesce(app.contributor_contact_email, contributor_contact_email),
    instagram_handle = coalesce(app.instagram_handle, instagram_handle),
    facebook_url = coalesce(app.facebook_url, facebook_url),
    tiktok_handle = coalesce(app.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(app.youtube_url, youtube_url),
    x_handle = coalesce(app.x_handle, x_handle),
    linkedin_url = coalesce(app.linkedin_url, linkedin_url),
    whatsapp_number = coalesce(app.whatsapp_number, whatsapp_number),
    contributor_no_fixed_location = coalesce(app.no_fixed_location, contributor_no_fixed_location),
    physical_address = case when app.no_fixed_location then null else coalesce(app.physical_address, physical_address) end,
    physical_latitude = case when app.no_fixed_location then null else coalesce(app.physical_latitude, physical_latitude) end,
    physical_longitude = case when app.no_fixed_location then null else coalesce(app.physical_longitude, physical_longitude) end,
    logo_url = coalesce(app.logo_url, logo_url),
    gallery_urls = case
      when jsonb_array_length(coalesce(app.gallery_urls, '[]'::jsonb)) > 0
        then app.gallery_urls
      else gallery_urls
    end,
    cover_photo_urls = case
      when jsonb_array_length(coalesce(app.cover_photo_urls, '[]'::jsonb)) > 0
        then app.cover_photo_urls
      else cover_photo_urls
    end,
    contributor_slug = new_slug,
    needs_re_review = false
  where id = app.user_id;

  update public.contributor_applications set
    status = 'approved',
    reviewed_at = now(),
    reviewer_id = auth.uid()
  where id = _application_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    app.user_id,
    'contributor_approved',
    public.engine_text('notification.partnerApproved.title'),
    public.engine_text('notification.partnerApproved.body'),
    jsonb_build_object('url', '/dashboard')
  );

  return jsonb_build_object(
    'success', true,
    'action', 'approved',
    'slug', new_slug,
    'user_id', app.user_id
  );
end;
$function$;

-- Two error sentences are reworded.
CREATE OR REPLACE FUNCTION public.events_enforce_community_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_days int;
  v_count int;
  v_lets_cap int := 4;
  v_recent int;
  v_cfg jsonb;
begin
  -- Not a trigger. One guard: a direct call is refused whether or not a
  -- JWT is present. A missing JWT on a real trigger does not skip the
  -- cap; the creator's role is read below.
  if TG_OP is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if TG_OP = 'UPDATE' then
    if v_uid is null then
      if coalesce(auth.role(), '') = 'service_role' then
        return new;
      end if;
    elsif coalesce(public.is_admin(), false) then
      return new;
    end if;

    -- The marker is chosen at insert. Clearing it would turn a Let's
    -- row into an ordinary event that never used the ordinary cap.
    if new.lets_starter is distinct from old.lets_starter then
      raise exception 'lets_starter_locked: the Let''s marker cannot be changed.'
        using errcode = '42501';
    end if;

    if old.lets_starter is not null and new.category is distinct from old.category then
      raise exception 'lets_category_locked: the category of a Let''s gathering cannot be changed.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if TG_OP <> 'INSERT' then
    return new;
  end if;

  if new.lets_starter is not null and btrim(new.lets_starter) = '' then
    new.lets_starter := null;
  end if;

  -- A missing JWT does not skip the cap. The creator's role decides.
  select p.role into v_role
    from public.profiles p
   where p.id = new.created_by;
  if v_role is distinct from 'citizen' then
    return new;
  end if;

  select s.value into v_cfg
    from public.app_settings s
   where s.key = 'community_event_rate_limit';
  v_days := coalesce((v_cfg->>'days')::int, 30);
  v_count := coalesce((v_cfg->>'count')::int, 1);
  if v_days < 1 then
    v_days := 30;
  end if;
  if v_count < 1 then
    v_count := 1;
  end if;

  if new.lets_starter is not null then
    select count(*) into v_recent
      from public.events e
     where e.created_by = new.created_by
       and e.lets_starter is not null
       and e.created_at >= (pg_catalog.now() - pg_catalog.make_interval(days => v_days));

    if v_recent >= v_lets_cap then
      raise exception
        'lets_event_rate_limited: you may create % Let''s gathering(s) per % day(s); please wait and try again.',
        v_lets_cap, v_days
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  select count(*) into v_recent
    from public.events e
   where e.created_by = new.created_by
     and e.community_contributor = true
     and e.lets_starter is null
     and e.created_at >= (pg_catalog.now() - pg_catalog.make_interval(days => v_days));

  if v_recent >= v_count then
    raise exception
      'community_event_rate_limited: you may create % event(s) per % day(s); please wait and try again.',
      v_count, v_days
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

-- Returns no cut column.
CREATE OR REPLACE FUNCTION public.get_my_profile_private()
 RETURNS TABLE(id uuid, role text, contributor_status text, email text, notification_email text, home_latitude double precision, home_longitude double precision, connect_home_province text, gender text, age_range text, relationship_status text, stage_of_life text, energy_level text, preferences jsonb, notification_prefs jsonb, notification_radius_km integer, notification_digest text, muted_source_ids jsonb, location_sharing boolean, terms_accepted_at timestamp with time zone, force_reauth_at timestamp with time zone, bio_setup_required boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id,
    p.role,
    p.contributor_status,
    p.email,
    p.notification_email,
    p.home_latitude,
    p.home_longitude,
    p.connect_home_province,
    p.gender,
    p.age_range,
    p.relationship_status,
    p.stage_of_life,
    p.energy_level,
    p.preferences,
    p.notification_prefs,
    p.notification_radius_km,
    p.notification_digest,
    p.muted_source_ids,
    p.location_sharing,
    p.terms_accepted_at,
    p.force_reauth_at,
    p.bio_setup_required
  from public.profiles p
  where p.id = (select auth.uid());
$function$;

-- The list of server-owned columns loses the cut columns; one error sentence is reworded.
CREATE OR REPLACE FUNCTION public.guard_profile_server_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  -- Columns only the server (service_role, SECURITY DEFINER flows, admins)
  -- may change. role / contributor_status are policed by
  -- protect_role_column(); contributor_slug / handle_changed_at below.
  server_owned constant text[] := array[
    'email',
    'created_at',
    'deleted_at',
    'contributor_hidden',
    'needs_re_review',
    'community_contributor_score',
    'force_reauth_at',
    'contributor_kind',
    'contributor_claim_email',
    'contributor_claimed_at',
    'contributor_created_by_admin'
  ];
  new_row jsonb;
  old_row jsonb;
  col text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  new_row := to_jsonb(new);
  old_row := to_jsonb(old);
  foreach col in array server_owned loop
    if (new_row -> col) is distinct from (old_row -> col) then
      raise exception 'profiles.% is managed by the server', col
        using errcode = '42501';
    end if;
  end loop;

  -- Handle (contributor_slug): the owner may change it once every 30 days,
  -- to a well-formed slug, and only while they hold a listing. Same
  -- format as admin_change_contributor_slug() and the slug route's SLUG_RE.
  -- handle_changed_at is always stamped here, never taken from the client.
  if new.contributor_slug is distinct from old.contributor_slug then
    if old.role is distinct from 'contributor' then
      raise exception 'handle_requires_listing'
        using errcode = '42501';
    end if;
    if new.contributor_slug is null
       or new.contributor_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' then
      raise exception 'invalid_slug_format'
        using errcode = '22023';
    end if;
    if old.handle_changed_at is not null
       and old.handle_changed_at > now() - interval '30 days' then
      raise exception 'handle can only be changed once every 30 days'
        using errcode = 'P0001';
    end if;
    new.handle_changed_at := now();
  elsif new.handle_changed_at is distinct from old.handle_changed_at then
    raise exception 'profiles.handle_changed_at is managed by the server'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- The partner kinds a new account may ask for come from the configuration.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare signup_kind text;
begin
  signup_kind := nullif(new.raw_user_meta_data->>'contributor_kind', '');
  -- A new account may only ask for a kind this world has (the configuration lists them).
  if signup_kind is not null and not exists (
    select 1
      from public.engine_configuration c
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(c.document -> 'categories' -> 'partnerKinds') = 'array'
            then c.document -> 'categories' -> 'partnerKinds'
            else '[]'::jsonb end) k
     where c.is_current and (k ->> 'id') = signup_kind
  ) then
    signup_kind := null;
  end if;
  insert into public.profiles (id, email, full_name, role, contributor_kind, contributor_status)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'citizen', signup_kind, 'not_applied');
  return new;
end;
$function$;

-- A code comment named a cut table.
CREATE OR REPLACE FUNCTION public.log_team_editor_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
begin
  if v_uid is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- events and places are owned by created_by. news_posts
  -- and specialised_services are owned by contributor_id. The column has to
  -- be read in a statement that only runs for tables which have it. PL/pgSQL
  -- plans a whole IF expression at once, so "tg_table_name in (...) and
  -- new.created_by ..." still raises "record new has no field created_by"
  -- on news_posts (and the contributor_id twin on events and places), for
  -- insert, update and delete, including the owner's own writes.
  if tg_table_name in ('events', 'places') then
    if tg_op = 'DELETE' then
      v_owner := old.created_by;
      v_id := old.id;
    else
      -- An editor must not move a row onto another owner. Owners are not
      -- editors of their own listing (their membership role is owner), so
      -- this does not apply to them. The comparison is its own statement,
      -- reached only on UPDATE, so INSERT never touches OLD.
      if tg_op = 'UPDATE' then
        if new.created_by is distinct from old.created_by
           and public.is_active_team_member(old.created_by, array['editor']) then
          raise exception 'owner_change_forbidden' using errcode = '42501';
        end if;
      end if;
      v_owner := new.created_by;
      v_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_owner := old.contributor_id;
      v_id := old.id;
    else
      if tg_op = 'UPDATE' then
        if new.contributor_id is distinct from old.contributor_id
           and public.is_active_team_member(old.contributor_id, array['editor']) then
          raise exception 'owner_change_forbidden' using errcode = '42501';
        end if;
      end if;
      v_owner := new.contributor_id;
      v_id := new.id;
    end if;
  end if;

  -- The owner writing their own row is the existing path. Do not add a log.
  if v_owner is null or v_owner = v_uid then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if not public.is_active_team_member(v_owner, array['editor']) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.activity_log (
    contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    v_owner,
    v_uid,
    'team_editor',
    lower(tg_op) || '_' || tg_table_name,
    tg_table_name,
    v_id::text,
    jsonb_build_object('op', tg_op)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- Notification text is read by key.
CREATE OR REPLACE FUNCTION public.notify_followers_of_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
begin
  if new.status <> 'published' or new.visibility <> 'public' or new.date < now() then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;

  select p.full_name into v_name
  from public.profiles p
  where p.id = new.created_by and p.role = 'contributor' and p.contributor_status = 'approved'
    and coalesce(p.contributor_hidden, false) = false;
  if not found then return new; end if;

  insert into public.notifications (user_id, type, title, body, data)
  select a.follower_id, 'followed_new_event',
         public.engine_text('notification.followedPartner.newEvent', jsonb_build_object('name', coalesce(nullif(v_name, ''), public.engine_text('notification.followedPartner.fallbackName')))),
         new.title,
         jsonb_build_object('event_id', new.id, 'post_id', new.id, 'contributor_id', new.created_by)
  from public.followed_post_audience(new.created_by, 'followed_new_event', new.id) a;
  return new;
end;
$function$;

-- Notification text is read by key.
CREATE OR REPLACE FUNCTION public.notify_followers_of_news()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
begin
  select p.full_name into v_name
  from public.profiles p
  where p.id = new.contributor_id and p.role = 'contributor' and p.contributor_status = 'approved'
    and coalesce(p.contributor_hidden, false) = false;
  if not found then return new; end if;

  insert into public.notifications (user_id, type, title, body, data)
  select a.follower_id, 'followed_new_news',
         public.engine_text('notification.followedPartner.newUpdate', jsonb_build_object('name', coalesce(nullif(v_name, ''), public.engine_text('notification.followedPartner.fallbackName')))),
         new.title,
         jsonb_build_object('post_id', new.id, 'contributor_id', new.contributor_id)
  from public.followed_post_audience(new.contributor_id, 'followed_new_news', new.id) a;
  return new;
end;
$function$;

-- One error sentence is reworded.
CREATE OR REPLACE FUNCTION public.protect_role_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Server code (SECURITY DEFINER functions, service_role, the SQL editor) runs
  -- as a role other than anon/authenticated and is trusted; this guard polices
  -- requests that arrive as the user. Same test as guard_profile_server_columns.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only staff may change a role.';
  end if;

  if new.contributor_status is distinct from old.contributor_status then
    if not (
      (old.contributor_status = 'not_applied' and new.contributor_status = 'pending')
      or (old.contributor_status = 'rejected' and new.contributor_status = 'pending')
    ) then
      raise exception 'contributor_status transition % -> % is not allowed.',
        old.contributor_status, new.contributor_status;
    end if;
  end if;

  return new;
end;
$function$;

-- Notification text is read by key.
CREATE OR REPLACE FUNCTION public.reject_contributor_application(_application_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  app record;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  if _reason is null or length(trim(_reason)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'reason_required');
  end if;
  if length(_reason) > 1000 then
    return jsonb_build_object('success', false, 'reason', 'reason_too_long');
  end if;

  select * into app from public.contributor_applications
    where id = _application_id and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found_or_not_pending');
  end if;

  update public.contributor_applications set
    status = 'rejected',
    reviewed_at = now(),
    reviewer_id = auth.uid(),
    rejection_reason = trim(_reason)
  where id = _application_id;

  update public.profiles set
    contributor_status = 'rejected'
  where id = app.user_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    app.user_id,
    'contributor_rejected',
    public.engine_text('notification.partnerDeclined.title'),
    trim(_reason),
    jsonb_build_object('url', '/')
  );

  return jsonb_build_object(
    'success', true,
    'action', 'rejected',
    'user_id', app.user_id
  );
end;
$function$;

-- Text is read by key; the fallback category is one the world has; refuses while the ideas feature is off.
CREATE OR REPLACE FUNCTION public.schedule_kingdom_project(p_idea_id uuid, p_date timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_idea  public.suggestions%rowtype;
  v_event uuid;
  v_category text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.engine_feature_on('communityIdeas') then
    raise exception 'feature_off' using errcode = '42501';
  end if;

  select * into v_idea from public.suggestions where id = p_idea_id for update;
  if not found then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;
  if v_idea.project_lead_id is distinct from v_uid then
    raise exception 'only the project lead can schedule this project' using errcode = '42501';
  end if;
  if v_idea.idea_status <> 'in_process' then
    raise exception 'project is not in process' using errcode = '22023';
  end if;
  if v_idea.associated_event_id is not null then
    raise exception 'project already scheduled' using errcode = '22023';
  end if;
  if p_date is null or p_date < now() then
    raise exception 'pick a future date for the kickoff' using errcode = '22023';
  end if;

  -- The kickoff event needs a category this world has: the idea's own, or the first one listed.
  v_category := v_idea.category;
  if v_category is null or not exists (
    select 1 from public.categories c where c.slug = v_category and c.applies_to in ('events', 'both')
  ) then
    select c.slug into v_category
      from public.categories c
     where c.applies_to in ('events', 'both')
     order by c.sort_order, c.slug
     limit 1;
  end if;
  if v_category is null then
    raise exception 'no_event_category' using errcode = '22023';
  end if;

  insert into public.events
    (title, description, category, date, end_time, location, created_by,
     latitude, longitude, status, visibility)
  values
    (coalesce(v_idea.title, public.engine_text('screen.ideas.eventTitle')),
     coalesce(v_idea.body, '') || E'\n\n' || public.engine_text('screen.ideas.eventNote'),
     v_category,
     p_date,
     p_end,
     coalesce(nullif(trim(p_location), ''), public.engine_text('screen.ideas.eventLocation')),
     v_uid,
     v_idea.latitude, v_idea.longitude,
     'published', 'public')
  returning id into v_event;

  update public.suggestions set associated_event_id = v_event where id = p_idea_id;

  insert into public.rsvps (user_id, event_id, location_snapshot)
  select v.user_id, v_event,
         (select connect_home_province from public.profiles pr where pr.id = v.user_id)
    from public.idea_votes v
   where v.idea_id = p_idea_id
  on conflict do nothing;

  insert into public.notifications (user_id, type, title, body, data)
  select v.user_id, 'suggestion_response',
         public.engine_text('notification.ideaScheduled.title'),
         public.engine_text('notification.ideaScheduled.body', jsonb_build_object('title', coalesce(v_idea.title, public.engine_text('notification.ideaScheduled.fallbackTitle')))),
         jsonb_build_object('suggestion_id', p_idea_id, 'event_id', v_event)
    from public.idea_votes v
   where v.idea_id = p_idea_id;

  return jsonb_build_object('event_id', v_event);
end;
$function$;

-- Notification text is read by key.
CREATE OR REPLACE FUNCTION public.transition_idea_to_in_process(p_idea_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_idea public.suggestions%rowtype;
begin
  select * into v_idea from public.suggestions where id = p_idea_id for update;
  if not found or v_idea.idea_status <> 'voting' then
    return;
  end if;

  update public.suggestions
     set idea_status = 'in_process',
         project_lead_id = coalesce(project_lead_id, v_idea.user_id)
   where id = p_idea_id;

  insert into public.notifications (user_id, type, title, body, data)
  select v.user_id,
         'suggestion_response',
         public.engine_text('notification.ideaGoalReached.title'),
         public.engine_text('notification.ideaGoalReached.body', jsonb_build_object('title', coalesce(v_idea.title, public.engine_text('notification.ideaGoalReached.fallbackTitle')))),
         jsonb_build_object('suggestion_id', p_idea_id, 'idea_status', 'in_process')
    from public.idea_votes v
   where v.idea_id = p_idea_id;

  if v_idea.user_id is not null
     and not exists (select 1 from public.idea_votes where idea_id = p_idea_id and user_id = v_idea.user_id) then
    insert into public.notifications (user_id, type, title, body, data)
    values (v_idea.user_id, 'suggestion_response',
            public.engine_text('notification.ideaLead.title'),
            public.engine_text('notification.ideaLead.body', jsonb_build_object('title', coalesce(v_idea.title, public.engine_text('notification.ideaLead.fallbackTitle')))),
            jsonb_build_object('suggestion_id', p_idea_id, 'idea_status', 'in_process'));
  end if;
end;
$function$;

-- The tiers that wait for staff come from a setting, not a fixed list; refuses while the ideas feature is off.
CREATE OR REPLACE FUNCTION public.vote_on_idea(p_idea_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_count    integer;
  v_idea     public.suggestions%rowtype;
  v_auto     boolean;
  v_review   boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.engine_feature_on('communityIdeas') then
    raise exception 'feature_off' using errcode = '42501';
  end if;

  select * into v_idea from public.suggestions where id = p_idea_id;
  if not found then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;

  -- Which goals wait for staff before a project starts is a setting of this world: the tier
  -- ids listed under 'ideas_review_tiers'. Every other tier starts on its own at its goal.
  v_review := exists (
    select 1 from public.app_settings s
     where s.key = 'ideas_review_tiers'
       and jsonb_typeof(s.value) = 'array'
       and s.value ? v_idea.tier
  );

  select id into v_existing
    from public.idea_votes
    where idea_id = p_idea_id and user_id = v_uid;

  if v_existing is not null then
    delete from public.idea_votes where id = v_existing;
    select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;
    return jsonb_build_object(
      'action', 'removed',
      'voted', false,
      'vote_count', v_count,
      'threshold_reached', v_count >= v_idea.vote_threshold
    );
  end if;

  insert into public.idea_votes (idea_id, user_id) values (p_idea_id, v_uid);
  select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;

  v_auto := (v_idea.idea_status = 'voting'
             and v_count >= v_idea.vote_threshold
             and not v_review);

  if v_auto then
    perform public.transition_idea_to_in_process(p_idea_id);
  elsif v_idea.idea_status = 'voting'
        and v_count = v_idea.vote_threshold
        and v_review then
    insert into public.notifications (user_id, type, title, body, data)
    select p.id, 'suggestion_response',
           'Idea reached its vote goal',
           '"' || coalesce(v_idea.title, 'An idea') || '" (' || coalesce(v_idea.tier_label, v_idea.tier) || ') hit ' || v_count || ' votes - review it for In Process.',
           jsonb_build_object('suggestion_id', p_idea_id, 'idea_status', 'voting')
      from public.profiles p
     where p.role = 'admin';
  end if;

  return jsonb_build_object(
    'action', 'added',
    'voted', true,
    'vote_count', v_count,
    'threshold_reached', v_count >= v_idea.vote_threshold,
    'auto_eligible', v_auto
  );
end;
$function$;

reset check_function_bodies;

insert into engine.schema_migrations (version, name) values ('0005', 'changed_functions');
