-- 178 — Admin "Delete listing" (Admin → Listings).
--
-- Why this exists
-- ---------------
-- A Contributor listing IS a user account (public.profiles.id = auth.users.id), so
-- "delete this listing" means one of two very different things. The server
-- decides which — never the client — from one fact, auth.users.last_sign_in_at:
--
--   placeholder  The owner has NEVER signed in: a Form-intake / admin-created
--                shell. Hard-delete the auth user; ON DELETE CASCADE takes the
--                profile, events, places, news posts and the rest with it.
--   account      The owner HAS signed in: a real person. Remove the LISTING and
--                keep the PERSON — role -> citizen, contributor_status ->
--                not_applied, every listing field cleared, events/places
--                cancelled, news posts + team removed, contributor_hidden left
--                TRUE. They can still sign in as a citizen and apply again.
--
-- Why one SECURITY DEFINER function
-- ---------------------------------
-- The check, the change and the audit row commit in ONE transaction: no
-- half-removed listing, and no window in which an owner signs in between "never
-- signed in?" and "delete" (the DELETE itself re-tests last_sign_in_at).
-- protect_role_column() lets only an admin (is_admin(), keyed on auth.uid())
-- demote a role, and service_role has no auth.uid() — so this runs on the
-- ADMIN'S OWN session, exactly like set_contributor_hidden (mig 164) and
-- admin_create_contributor_profile (mig 170). Only the Storage cleanup (outside
-- Postgres) needs service_role, and that stays in the API route.
--
-- Calling convention (used by /api/admin/contributors/delete-listing)
--   _apply = false   read-only preflight: which case, what it would touch, and
--                    anything that forbids it (blockers). Used by the modal.
--   _apply = true    perform it. _confirm_name must equal the listing's name
--                    (trimmed, case-insensitive, whitespace collapsed); a listing
--                    with no name is confirmed by typing "delete".
--
-- Refused (never deleted or demoted): an admin, the caller themself, anyone who
-- is not a Contributor listing, and anyone who owns a Wear brand or has Vision
-- data (several Vision FKs into auth.users are NO ACTION and would fail a hard
-- delete anyway; a Wear brand would be cascaded away silently). The Vision/Wear
-- reads are ownership checks only, in this one deletion-safety function — see
-- SHARED_DB_CONTRACT §9.
--
-- Footguns restated (§3, migs 165/166): `set search_path to ''` — so every
-- reference is schema-qualified — and the mandatory `auth.uid() is null or …`
-- admin guard (a missing JWT must not skip the check).

create or replace function public.admin_remove_contributor_listing(
  _user_id uuid,
  _apply boolean default false,
  _confirm_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- array_append with an explicit ::text — `text[] || 'literal'` is ambiguous
  -- (the untyped literal gets parsed as an array) and fails at run time.
  if exists (select 1 from wear.brands where owner_user_id = _user_id) then
    v_blockers := array_append(v_blockers, 'owns_wear_brand'::text);
  end if;
  if exists (select 1 from vision.organisations where created_by = _user_id) then
    v_blockers := array_append(v_blockers, 'created_vision_organisation'::text);
  end if;
  if exists (select 1 from vision.activities where created_by = _user_id)
     or exists (select 1 from vision.goals where created_by = _user_id)
     or exists (select 1 from vision.projects where created_by = _user_id)
     or exists (select 1 from vision.cc_event_claims where claimed_by = _user_id)
     or exists (select 1 from vision.cc_place_claims where claimed_by = _user_id)
     or exists (select 1 from vision.org_partnerships where initiated_by = _user_id or responded_by = _user_id)
  then
    v_blockers := array_append(v_blockers, 'has_vision_activity'::text);
  end if;

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

revoke all on function public.admin_remove_contributor_listing(uuid, boolean, text) from public, anon;
grant execute on function public.admin_remove_contributor_listing(uuid, boolean, text) to authenticated;

comment on function public.admin_remove_contributor_listing(uuid, boolean, text) is
  'Admin → Listings "Delete" (mig 178). _apply=false: read-only preflight {case, name, counts, blockers}. _apply=true (+ _confirm_name): placeholder (auth.users.last_sign_in_at is null) => hard-delete the auth user; account => demote to citizen, clear listing fields, cancel events/places, delete news posts + team, keep contributor_hidden. Refuses admins, self, non-listings, Wear brand owners and Vision data. Audit row in the same transaction. Admin only; runs on the admin''s own session.';
