-- ════════════════════════════════════════════════════════════════════
--  193_team_editor_listing_access
--
--  NOT APPLIED. The owner applies this file after review (pre-apply tag,
--  rollback-only probe docs/audit/probes/193_team_editor_listing_access.probe.sql,
--  advisor 0 ERROR). Expected advisor change: +1 WARN for
--  public.is_active_team_member (SECURITY DEFINER, executable by
--  authenticated on purpose: the new write policies call it). It returns
--  only a boolean, and false when there is no JWT.
--  public.update_contributor_public_profile is the same shape, authenticated
--  only, and refuses every column that is not on its allow-list.
--  public.log_team_editor_write is a trigger function: EXECUTE revoked from
--  public, anon and authenticated.
--
--  WHAT THIS ADDS
--   An active editor (team_memberships.role = 'editor', status = 'active')
--   of an approved, non-hidden, non-deleted contributor can write that
--   listing's public content: news, events, places, services, listing
--   sources, and the public profile columns named in
--   update_contributor_public_profile. A viewer can read. Pending,
--   declined and removed memberships gain nothing.
--
--  WHAT DOES NOT CHANGE
--   Owner and admin policies are left in place (new policies are OR-ed on).
--   profiles UPDATE policies are not widened. Editors cannot change role,
--   slug, billing, status, contributor_hidden, email, or any other column
--   outside the allow-list. They cannot transfer ownership or manage the
--   team: those policies stay "auth.uid() = contributor_id".
--   Content created by an editor is owned by the contributor
--   (news_posts.contributor_id / events.created_by / places.created_by),
--   not by the editor.
--
--  SLUG
--   Stays owner-only (and the existing admin-with-grant override). This
--   migration does not let an editor write contributor_slug.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Who is an active team member of a live listing ─────────────────
-- False with no JWT, so a missing claim cannot fall through. The listing
-- must be an approved contributor that is not hidden and not deleted.
-- Pending, declined and removed rows do not count. Owner and admin
-- policies do not call this, so their behaviour is unchanged.
create or replace function public.is_active_team_member(p_contributor_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and p_contributor_id is not null
     and p_roles is not null
     and exists (
       select 1
       from public.team_memberships tm
       join public.profiles p on p.id = tm.contributor_id
       where tm.contributor_id = p_contributor_id
         and tm.member_id = (select auth.uid())
         and tm.status = 'active'
         and tm.role = any (p_roles)
         and p.role = 'contributor'
         and p.contributor_status = 'approved'
         and coalesce(p.contributor_hidden, false) = false
         and p.deleted_at is null
     );
$$;

comment on function public.is_active_team_member(uuid, text[]) is
  'True when the signed-in caller has an active team_memberships row on this contributor in one of p_roles, and the listing is an approved, visible, non-deleted contributor. False with no JWT. Never returns row data.';

revoke all on function public.is_active_team_member(uuid, text[]) from public, anon;
grant execute on function public.is_active_team_member(uuid, text[]) to authenticated;

-- ── 2. activity_log can name a team editor ────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'activity_log'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%actor_role%'
  loop
    execute format('alter table public.activity_log drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.activity_log
  add constraint activity_log_actor_role_check
  check (actor_role is null or actor_role in ('contributor', 'admin', 'system', 'team_editor'));

comment on column public.activity_log.actor_role is
  'Role of the actor. "admin" is an on-behalf-of platform admin. "team_editor" is an active editor of the listing (migration 193). The row stays owned by the contributor.';

-- Editors and viewers can read the listing's activity (the dashboard).
-- They cannot insert rows themselves; the trigger and the profile RPC do.
drop policy if exists activity_log_select_team on public.activity_log;
create policy activity_log_select_team
  on public.activity_log
  for select
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor', 'viewer']));

-- ── 3. Attribute editor writes, and only editor writes ────────────────
-- Owners, admins and service_role (no JWT) pass through with no new row,
-- so existing logs are unchanged. The function is the trigger body only.
create or replace function public.log_team_editor_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  -- events and places are owned by created_by. news_posts, listing_sources
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
$$;

comment on function public.log_team_editor_write() is
  'BEFORE trigger: when the signed-in caller is an active editor (not the owner) of the row, write one activity_log row with actor_role team_editor, and refuse a change of the owner column. No JWT, the owner, an admin and anyone else: no new row.';

revoke all on function public.log_team_editor_write() from public, anon, authenticated;

drop trigger if exists trg_log_team_editor_news on public.news_posts;
create trigger trg_log_team_editor_news
  before insert or update or delete on public.news_posts
  for each row execute function public.log_team_editor_write();

drop trigger if exists trg_log_team_editor_events on public.events;
create trigger trg_log_team_editor_events
  before insert or update or delete on public.events
  for each row execute function public.log_team_editor_write();

drop trigger if exists trg_log_team_editor_places on public.places;
create trigger trg_log_team_editor_places
  before insert or update or delete on public.places
  for each row execute function public.log_team_editor_write();

drop trigger if exists trg_log_team_editor_sources on public.listing_sources;
create trigger trg_log_team_editor_sources
  before insert or update or delete on public.listing_sources
  for each row execute function public.log_team_editor_write();

drop trigger if exists trg_log_team_editor_services on public.specialised_services;
create trigger trg_log_team_editor_services
  before insert or update or delete on public.specialised_services
  for each row execute function public.log_team_editor_write();

-- ── 4. Editor write policies (additive; owner and admin policies stay) ─
-- Content is owned by the contributor: the editor sets contributor_id or
-- created_by to the listing, not to themselves.

drop policy if exists "Active editors can read contributor events" on public.events;
create policy "Active editors can read contributor events"
  on public.events
  for select
  to authenticated
  using (public.is_active_team_member(created_by, array['editor', 'viewer']));

drop policy if exists "Active editors can create contributor events" on public.events;
create policy "Active editors can create contributor events"
  on public.events
  for insert
  to authenticated
  with check (public.is_active_team_member(created_by, array['editor']));

drop policy if exists "Active editors can update contributor events" on public.events;
create policy "Active editors can update contributor events"
  on public.events
  for update
  to authenticated
  using (public.is_active_team_member(created_by, array['editor']))
  with check (public.is_active_team_member(created_by, array['editor']));

drop policy if exists "Active editors can delete contributor events" on public.events;
create policy "Active editors can delete contributor events"
  on public.events
  for delete
  to authenticated
  using (public.is_active_team_member(created_by, array['editor']));

drop policy if exists "Active editors can create contributor news posts" on public.news_posts;
create policy "Active editors can create contributor news posts"
  on public.news_posts
  for insert
  to authenticated
  with check (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can update contributor news posts" on public.news_posts;
create policy "Active editors can update contributor news posts"
  on public.news_posts
  for update
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']))
  with check (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can delete contributor news posts" on public.news_posts;
create policy "Active editors can delete contributor news posts"
  on public.news_posts
  for delete
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can create contributor places" on public.places;
create policy "Active editors can create contributor places"
  on public.places
  for insert
  to authenticated
  with check (public.is_active_team_member(created_by, array['editor']));

drop policy if exists "Active editors can update contributor places" on public.places;
create policy "Active editors can update contributor places"
  on public.places
  for update
  to authenticated
  using (public.is_active_team_member(created_by, array['editor']))
  with check (public.is_active_team_member(created_by, array['editor']));

drop policy if exists "Active editors can delete contributor places" on public.places;
create policy "Active editors can delete contributor places"
  on public.places
  for delete
  to authenticated
  using (public.is_active_team_member(created_by, array['editor']));

drop policy if exists "Active editors can read contributor sources" on public.listing_sources;
create policy "Active editors can read contributor sources"
  on public.listing_sources
  for select
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can add contributor sources" on public.listing_sources;
create policy "Active editors can add contributor sources"
  on public.listing_sources
  for insert
  to authenticated
  with check (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can update contributor sources" on public.listing_sources;
create policy "Active editors can update contributor sources"
  on public.listing_sources
  for update
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']))
  with check (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can delete contributor sources" on public.listing_sources;
create policy "Active editors can delete contributor sources"
  on public.listing_sources
  for delete
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can read contributor suggestions" on public.listing_suggestions;
create policy "Active editors can read contributor suggestions"
  on public.listing_suggestions
  for select
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can add contributor services" on public.specialised_services;
create policy "Active editors can add contributor services"
  on public.specialised_services
  for insert
  to authenticated
  with check (public.is_active_team_member(contributor_id, array['editor']));

drop policy if exists "Active editors can delete contributor services" on public.specialised_services;
create policy "Active editors can delete contributor services"
  on public.specialised_services
  for delete
  to authenticated
  using (public.is_active_team_member(contributor_id, array['editor']));

-- ── 5. Column-limited profile write for editors ───────────────────────
-- Does not widen profiles UPDATE. Unknown keys, including role, slug,
-- billing, status, hidden and email, raise forbidden_field and change
-- nothing. Only an active editor of that listing may call it.
create or replace function public.update_contributor_public_profile(p_contributor_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_allowed constant text[] := array[
    'bio',
    'website_url',
    'instagram_handle',
    'facebook_url',
    'tiktok_handle',
    'youtube_url',
    'x_handle',
    'linkedin_url',
    'whatsapp_number',
    'physical_address',
    'physical_latitude',
    'physical_longitude',
    'contributor_no_fixed_location',
    'logo_url',
    'gallery_urls',
    'contributor_contact_email',
    'contributor_category'
  ];
  v_lat double precision;
  v_lng double precision;
  v_gallery jsonb;
  v_item jsonb;
  v_url text;
begin
  if v_uid is null or not public.is_active_team_member(p_contributor_id, array['editor']) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    if not (v_key = any (v_allowed)) then
      raise exception 'forbidden_field' using errcode = '42501';
    end if;
  end loop;

  if p_patch ? 'bio' and p_patch->>'bio' is not null and char_length(p_patch->>'bio') > 2000 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'physical_address' and p_patch->>'physical_address' is not null and char_length(p_patch->>'physical_address') > 500 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'contributor_category' and p_patch->>'contributor_category' is not null and char_length(p_patch->>'contributor_category') > 80 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'contributor_contact_email' and p_patch->>'contributor_contact_email' is not null and char_length(p_patch->>'contributor_contact_email') > 254 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;

  if p_patch ? 'website_url' and p_patch->>'website_url' is not null and p_patch->>'website_url' !~ '^https?://' then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'logo_url' and p_patch->>'logo_url' is not null and p_patch->>'logo_url' !~ '^https://' then
    raise exception 'invalid_field' using errcode = '22023';
  end if;

  if p_patch ? 'physical_latitude' and p_patch->'physical_latitude' <> 'null'::jsonb then
    v_lat := (p_patch->>'physical_latitude')::double precision;
    if v_lat < -90 or v_lat > 90 then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'physical_longitude' and p_patch->'physical_longitude' <> 'null'::jsonb then
    v_lng := (p_patch->>'physical_longitude')::double precision;
    if v_lng < -180 or v_lng > 180 then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'gallery_urls' and p_patch->'gallery_urls' <> 'null'::jsonb then
    v_gallery := p_patch->'gallery_urls';
    if jsonb_typeof(v_gallery) <> 'array' or jsonb_array_length(v_gallery) > 6 then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(v_gallery)
    loop
      if jsonb_typeof(v_item) <> 'string' then
        raise exception 'invalid_field' using errcode = '22023';
      end if;
      v_url := v_item #>> '{}';
      if v_url is null or v_url !~ '^https://' or char_length(v_url) > 2000 then
        raise exception 'invalid_field' using errcode = '22023';
      end if;
    end loop;
  end if;

  update public.profiles set
    bio = case when p_patch ? 'bio' then nullif(p_patch->>'bio', '') else bio end,
    website_url = case when p_patch ? 'website_url' then nullif(p_patch->>'website_url', '') else website_url end,
    instagram_handle = case when p_patch ? 'instagram_handle' then nullif(p_patch->>'instagram_handle', '') else instagram_handle end,
    facebook_url = case when p_patch ? 'facebook_url' then nullif(p_patch->>'facebook_url', '') else facebook_url end,
    tiktok_handle = case when p_patch ? 'tiktok_handle' then nullif(p_patch->>'tiktok_handle', '') else tiktok_handle end,
    youtube_url = case when p_patch ? 'youtube_url' then nullif(p_patch->>'youtube_url', '') else youtube_url end,
    x_handle = case when p_patch ? 'x_handle' then nullif(p_patch->>'x_handle', '') else x_handle end,
    linkedin_url = case when p_patch ? 'linkedin_url' then nullif(p_patch->>'linkedin_url', '') else linkedin_url end,
    whatsapp_number = case when p_patch ? 'whatsapp_number' then nullif(p_patch->>'whatsapp_number', '') else whatsapp_number end,
    physical_address = case
      when p_patch ? 'contributor_no_fixed_location' and (p_patch->>'contributor_no_fixed_location')::boolean then null
      when p_patch ? 'physical_address' then nullif(p_patch->>'physical_address', '')
      else physical_address
    end,
    physical_latitude = case
      when p_patch ? 'contributor_no_fixed_location' and (p_patch->>'contributor_no_fixed_location')::boolean then null
      when p_patch ? 'physical_latitude' and p_patch->'physical_latitude' = 'null'::jsonb then null
      when p_patch ? 'physical_latitude' then (p_patch->>'physical_latitude')::double precision
      else physical_latitude
    end,
    physical_longitude = case
      when p_patch ? 'contributor_no_fixed_location' and (p_patch->>'contributor_no_fixed_location')::boolean then null
      when p_patch ? 'physical_longitude' and p_patch->'physical_longitude' = 'null'::jsonb then null
      when p_patch ? 'physical_longitude' then (p_patch->>'physical_longitude')::double precision
      else physical_longitude
    end,
    contributor_no_fixed_location = case
      when p_patch ? 'contributor_no_fixed_location' then (p_patch->>'contributor_no_fixed_location')::boolean
      else contributor_no_fixed_location
    end,
    logo_url = case when p_patch ? 'logo_url' then nullif(p_patch->>'logo_url', '') else logo_url end,
    gallery_urls = case
      when p_patch ? 'gallery_urls' and p_patch->'gallery_urls' = 'null'::jsonb then null
      when p_patch ? 'gallery_urls' then p_patch->'gallery_urls'
      else gallery_urls
    end,
    contributor_contact_email = case
      when p_patch ? 'contributor_contact_email' then nullif(lower(p_patch->>'contributor_contact_email'), '')
      else contributor_contact_email
    end,
    contributor_category = case
      when p_patch ? 'contributor_category' then nullif(p_patch->>'contributor_category', '')
      else contributor_category
    end
  where id = p_contributor_id;

  insert into public.activity_log (
    contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_contributor_id,
    v_uid,
    'team_editor',
    'update_profile',
    'profile',
    p_contributor_id::text,
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_patch) as k))
  );

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.update_contributor_public_profile(uuid, jsonb) is
  'Mig 193: an active editor updates the public profile columns of a listing they edit. Any other key raises forbidden_field. Owners keep their existing profile route. Authenticated EXECUTE is by design (auth.uid() guard inside).';

revoke all on function public.update_contributor_public_profile(uuid, jsonb) from public, anon;
grant execute on function public.update_contributor_public_profile(uuid, jsonb) to authenticated;

-- ── 6. Editors may decide listing suggestions for the listing ─────────
-- Owner path is the same result as migration 181: the suggestion's
-- contributor_id equals auth.uid(), and the published ref must belong to
-- that same id. An editor is allowed when is_active_team_member says so;
-- the ref is still owned by the contributor, and decided_by is the editor.
-- A stranger still receives not_found.
create or replace function public.decide_listing_suggestion(_id uuid, _action text, _ref uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s   record;
  v_owner uuid;
  v_editor boolean := false;
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_signed_in');
  end if;
  if _action is null or _action not in ('dismiss', 'published', 'unpublish') then
    return jsonb_build_object('success', false, 'reason', 'invalid_action');
  end if;

  select id, kind, status, published_ref, contributor_id
    into v_s
    from public.listing_suggestions
   where id = _id
     for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  v_owner := v_s.contributor_id;
  if v_owner = v_uid then
    v_editor := false;
  elsif public.is_active_team_member(v_owner, array['editor']) then
    v_editor := true;
  else
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if _action = 'dismiss' then
    if v_s.status <> 'pending' then
      return jsonb_build_object('success', false, 'reason', 'not_pending');
    end if;
    update public.listing_suggestions
       set status = 'dismissed', decided_at = now(), decided_by = v_uid
     where id = _id;
  elsif _action = 'published' then
    if v_s.status <> 'pending' then
      return jsonb_build_object('success', false, 'reason', 'not_pending');
    end if;
    if v_s.kind = 'event' then
      if _ref is null or not exists (select 1 from public.events where id = _ref and created_by = v_owner) then
        return jsonb_build_object('success', false, 'reason', 'ref_not_yours');
      end if;
    elsif v_s.kind = 'news' then
      if _ref is null or not exists (select 1 from public.news_posts where id = _ref and contributor_id = v_owner) then
        return jsonb_build_object('success', false, 'reason', 'ref_not_yours');
      end if;
    elsif _ref is not null then
      return jsonb_build_object('success', false, 'reason', 'ref_not_allowed');
    end if;
    update public.listing_suggestions
       set status = 'published', published_ref = _ref, decided_at = now(), decided_by = v_uid
     where id = _id;
  else
    if v_s.status <> 'auto_published' or v_s.kind <> 'event' or v_s.published_ref is null then
      return jsonb_build_object('success', false, 'reason', 'not_auto_published');
    end if;
    update public.events
       set status = 'cancelled'
     where id = v_s.published_ref and created_by = v_owner and status = 'published';
    get diagnostics v_n = row_count;
    update public.listing_suggestions
       set status = 'dismissed', decided_at = now(), decided_by = v_uid
     where id = _id;
    if v_editor then
      insert into public.activity_log (
        contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
      ) values (
        v_owner, v_uid, 'team_editor', 'unpublish_suggestion', 'listing_suggestion', _id::text,
        jsonb_build_object('event_cancelled', v_n > 0)
      );
    end if;
    return jsonb_build_object('success', true, 'status', 'dismissed', 'event_cancelled', v_n > 0);
  end if;

  if v_editor then
    insert into public.activity_log (
      contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
    ) values (
      v_owner, v_uid, 'team_editor', _action || '_suggestion', 'listing_suggestion', _id::text,
      jsonb_build_object('kind', v_s.kind)
    );
  end if;

  if _action = 'dismiss' then
    return jsonb_build_object('success', true, 'status', 'dismissed');
  end if;
  return jsonb_build_object('success', true, 'status', 'published');
end;
$$;

revoke all on function public.decide_listing_suggestion(uuid, text, uuid) from public, anon;
grant execute on function public.decide_listing_suggestion(uuid, text, uuid) to authenticated;

comment on function public.decide_listing_suggestion(uuid, text, uuid) is
  'Mig 181, extended by mig 193: the owner, or an active editor of that listing, dismisses, marks published (the event or news post must belong to the contributor) or unpublishes an auto-published event. A stranger gets not_found. Authenticated EXECUTE is by design.';

commit;
