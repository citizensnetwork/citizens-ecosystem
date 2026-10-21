-- ════════════════════════════════════════════════════════════════════
--  195_service_areas: serving areas for online and no-fixed-location Contributors (issue #259, option 3 "the globe").
--
--  APPLIED 2026-10-21 through MCP apply_migration as `195_service_areas` (remote version 20261021202404), on Stephen's yes in
--  chat naming this file (pre-apply tag `connect-pre-mig195-service-areas`). The statements applied are this file's, with the
--  comments left out. Rollback-only probe docs/audit/probes/195_service_areas.probe.sql.
--
--  KNOWN DEFECT, FIXED BY 197_service_areas_anon_read.sql (NOT APPLIED, awaiting a yes to that file): the probe run on the live
--  objects right after the apply failed with `42501 permission denied for function is_active_team_member` when `anon` read a
--  link row of a hidden or pending Contributor. The three link-table SELECT policies below call that helper in one policy
--  for every role, and `anon` cannot execute it (migration 193). No user was affected (the tables are empty and nothing
--  reads them yet). 197 splits each policy by role. The tables and functions here are otherwise as probed.
--
--  WHAT THIS ADDS
--   public.service_areas              the hierarchy province > city/town > suburb. A public commons: read only for everyone.
--   public.contributor_service_areas  "this Contributor serves this area (and everything inside it)". Nothing else.
--   public.contributor_service_radius an optional "within N km" add-on: radius (1 to 100) plus the area it is centred on
--                                     (null = the Contributor's own pin).
--   public.contributor_service_presence  one plain tag per Contributor, chosen by the owner: 'online' (the default) or
--                                     'no_fixed_place' (a travelling or mobile ministry that serves people in person and
--                                     is NOT online). The globe shows it on each row so nobody is labelled "Online" who
--                                     is not (founder naming rule, 2026-10-21).
--   public.set_service_areas(...)     the ONLY write path. SECURITY DEFINER, signed-in only. One atomic replace.
--   public.serving_area_listings(...) the public read for the globe. SECURITY INVOKER: it runs under the caller's own RLS.
--   a seed of the nine provinces, ten Gauteng cities/towns and seven suburbs (see SEED below).
--
--  THE SELECTION RULE (founder, 2026-10-21): a tick means that area and everything inside it, and never propagates upward.
--   Ticking Eldoraigne does not mean serving Centurion, Pretoria or Gauteng. Matching goes downward only: a viewer whose
--   area in view is Eldoraigne matches anyone who ticked Eldoraigne OR an area containing it; a viewer zoomed out to
--   Gauteng matches only those who ticked Gauteng as a whole. serving_area_listings walks UP from the viewed area, never down.
--
--  PUBLIC WORDING (founder, 2026-10-21): the public side says "Online in this area", the owner side keeps "serving".
--   That is UI copy (PR B and C); this file only stores the tag and returns it.
--
--  WHO APPEARS (honesty, tracker C21): the main list holds only approved, visible, non-deleted Contributors with NO map pin
--   (no_fixed_location, or no coordinates), which is exactly the people the map cannot show. "Also served by" holds the
--   Contributors (pin or not) whose radius reaches the area in view and who are not already in the main list: at most 5,
--   nearest first, then A to Z. Nothing is ordered by popularity.
--
--  WHAT DOES NOT CHANGE
--   No existing table, policy, function or grant is touched. profiles is not altered (so the column allow-list of contract
--   R3.5 is untouched). The D-12 approval wall is applied twice: in the link tables' SELECT policies and again in the read
--   function. Care/Recovery and other flagged listings keep their own admin review (#202): nothing here publishes anyone;
--   a Contributor who is not approved and visible is simply never returned.
--
--  EVENTS ARE OUT OF SCOPE. The create wizard requires a venue and an address (a location-less event cannot be created),
--   so there is no event link table here. Add one when online events exist (follow-up).
--
--  SEED (founder's decision pending: which gazetteer and licence). The rows below are HAND-ENTERED APPROXIMATIONS of public
--   geographic facts (a point and a rough rectangle per place, good to a few kilometres), taken from no third-party dataset
--   and no scrape, so they carry no licence obligation and are released with this repository. They exist so the pilot works
--   (Gauteng and the City of Tshwane's places, with a few suburbs to prove the third level). Resolving "the area in view"
--   from a rectangle is approximate by design: the smallest rectangle that contains the map centre wins, ties go to the
--   nearest centroid. Replace the rows with official demarcation data (or OpenStreetMap under the ODbL, with attribution)
--   once the founder picks a source; slugs stay stable.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. The hierarchy ──────────────────────────────────────────────────
create table public.service_areas (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.service_areas(id) on delete restrict,
  level        text not null check (level in ('province', 'place', 'suburb')),
  name         text not null check (char_length(name) between 1 and 120),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  centroid_lat double precision not null check (centroid_lat between -90 and 90),
  centroid_lng double precision not null check (centroid_lng between -180 and 180),
  bbox_south   double precision not null check (bbox_south between -90 and 90),
  bbox_west    double precision not null check (bbox_west between -180 and 180),
  bbox_north   double precision not null check (bbox_north between -90 and 90),
  bbox_east    double precision not null check (bbox_east between -180 and 180),
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  check (bbox_south <= bbox_north and bbox_west <= bbox_east),
  check (centroid_lat between bbox_south and bbox_north and centroid_lng between bbox_west and bbox_east),
  check ((level = 'province') = (parent_id is null))
);
create index service_areas_parent_idx on public.service_areas (parent_id);

comment on table public.service_areas is
  'Province > city/town > suburb. Public read-only commons; written only by migrations or an admin with service_role. Rectangles are approximate (no boundary polygons).';

-- A place sits directly under a province and a suburb directly under a place. (The CHECK above cannot read another row.)
create function public.service_areas_check_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_level text;
begin
  if new.parent_id is null then
    return new;
  end if;
  select a.level into v_parent_level from public.service_areas a where a.id = new.parent_id;
  if (new.level = 'place' and v_parent_level is distinct from 'province')
     or (new.level = 'suburb' and v_parent_level is distinct from 'place') then
    raise exception 'service area % has the wrong kind of parent', new.slug using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.service_areas_check_parent() from public, anon, authenticated;

create trigger service_areas_check_parent
  before insert or update of parent_id, level on public.service_areas
  for each row execute function public.service_areas_check_parent();

alter table public.service_areas enable row level security;
create policy service_areas_select on public.service_areas for select using (true);
-- no insert / update / delete policy: default deny. (A new table gives anon and authenticated every privilege, and
-- TRUNCATE is not subject to RLS: take everything away, then give back read.)
revoke all on public.service_areas from anon, authenticated, public;
grant select on public.service_areas to anon, authenticated;

-- ── 2. Who serves what ────────────────────────────────────────────────
create table public.contributor_service_areas (
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  area_id        uuid not null references public.service_areas(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (contributor_id, area_id)
);
create index contributor_service_areas_area_idx on public.contributor_service_areas (area_id);

alter table public.contributor_service_areas enable row level security;

-- Public: only for a live listing (approved, not hidden, not deleted: the D-12 wall). The owner always sees their own
-- (an applicant who is still pending too), an active team member sees the listing's, an admin sees all.
create policy contributor_service_areas_select on public.contributor_service_areas
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_areas.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
    or contributor_id = (select auth.uid())
    or public.is_active_team_member(contributor_id, array['editor', 'viewer'])
    or (select public.is_admin())
  );
revoke all on public.contributor_service_areas from anon, authenticated, public;
grant select on public.contributor_service_areas to anon, authenticated;

create table public.contributor_service_radius (
  contributor_id  uuid primary key references public.profiles(id) on delete cascade,
  radius_km       integer not null check (radius_km between 1 and 100),
  -- the ticked area the radius is measured from; null = the Contributor's own pin
  centre_area_id  uuid references public.service_areas(id) on delete cascade,
  updated_at      timestamptz not null default now()
);
create index contributor_service_radius_centre_idx on public.contributor_service_radius (centre_area_id);

alter table public.contributor_service_radius enable row level security;
create policy contributor_service_radius_select on public.contributor_service_radius
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_radius.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
    or contributor_id = (select auth.uid())
    or public.is_active_team_member(contributor_id, array['editor', 'viewer'])
    or (select public.is_admin())
  );
revoke all on public.contributor_service_radius from anon, authenticated, public;
grant select on public.contributor_service_radius to anon, authenticated;

-- one tag per Contributor, owner-chosen, default 'online' (an absent row means 'online')
create table public.contributor_service_presence (
  contributor_id uuid primary key references public.profiles(id) on delete cascade,
  presence       text not null default 'online' check (presence in ('online', 'no_fixed_place')),
  updated_at     timestamptz not null default now()
);

alter table public.contributor_service_presence enable row level security;
create policy contributor_service_presence_select on public.contributor_service_presence
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_presence.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
    or contributor_id = (select auth.uid())
    or public.is_active_team_member(contributor_id, array['editor', 'viewer'])
    or (select public.is_admin())
  );
revoke all on public.contributor_service_presence from anon, authenticated, public;
grant select on public.contributor_service_presence to anon, authenticated;

-- ── 3. The one write path ─────────────────────────────────────────────
-- Replaces a Contributor's whole selection in one transaction. Callable by the Contributor (an applicant still pending
-- counts: the Apply wizard saves areas after the application row exists), an active editor of the listing, or an admin.
-- Every refusal is a { success: false, reason } so the route can map it; nothing raises for a normal mistake.
create function public.set_service_areas(
  p_contributor_id uuid,
  p_area_ids uuid[],
  p_radius_km integer default null,
  p_radius_centre_area_id uuid default null,
  p_presence text default 'online'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    text;
  v_status  text;
  v_deleted timestamptz;
  v_has_pin boolean;
  v_ids     uuid[];
  v_known   integer;
  v_centre  uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;
  if p_contributor_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if not (
    v_uid = p_contributor_id
    or public.is_active_team_member(p_contributor_id, array['editor'])
    or (select public.is_admin())
  ) then
    return jsonb_build_object('success', false, 'reason', 'not_allowed');
  end if;

  select p.role, p.contributor_status, p.deleted_at,
         (coalesce(p.contributor_no_fixed_location, false) = false
            and p.physical_latitude is not null and p.physical_longitude is not null)
    into v_role, v_status, v_deleted, v_has_pin
    from public.profiles p where p.id = p_contributor_id;
  if not found or v_deleted is not null then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if not ((v_role = 'contributor' and v_status = 'approved') or v_status = 'pending') then
    return jsonb_build_object('success', false, 'reason', 'not_a_contributor');
  end if;
  -- a pending applicant's pin is staged on the application, not on the profile
  if v_status = 'pending' then
    select (coalesce(a.no_fixed_location, false) = false
              and a.physical_latitude is not null and a.physical_longitude is not null)
      into v_has_pin
      from public.contributor_applications a
     where a.user_id = p_contributor_id and a.status = 'pending'
     order by a.submitted_at desc limit 1;
    v_has_pin := coalesce(v_has_pin, false);
  end if;

  if p_presence is null or p_presence not in ('online', 'no_fixed_place') then
    return jsonb_build_object('success', false, 'reason', 'invalid_presence');
  end if;

  -- de-duplicate; null elements are dropped
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_area_ids, '{}'::uuid[])) as x where x is not null;
  if cardinality(v_ids) > 20 then
    return jsonb_build_object('success', false, 'reason', 'too_many_areas');
  end if;
  select count(*) into v_known from public.service_areas a where a.id = any (v_ids);
  if v_known <> cardinality(v_ids) then
    return jsonb_build_object('success', false, 'reason', 'unknown_area');
  end if;

  -- radius: an add-on that needs a centre. The centre is a ticked area, or the Contributor's own pin.
  if p_radius_km is not null then
    if p_radius_km < 1 or p_radius_km > 100 then
      return jsonb_build_object('success', false, 'reason', 'radius_out_of_range');
    end if;
    v_centre := p_radius_centre_area_id;
    if v_centre is not null then
      if not (v_centre = any (v_ids)) then
        return jsonb_build_object('success', false, 'reason', 'centre_not_ticked');
      end if;
    elsif cardinality(v_ids) > 0 and not v_has_pin then
      -- no pin to measure from: default to the most specific ticked area (suburb, then place, then province; A to Z)
      select a.id into v_centre
        from public.service_areas a
       where a.id = any (v_ids)
       order by (case a.level when 'suburb' then 3 when 'place' then 2 else 1 end) desc, a.name, a.id
       limit 1;
    elsif not v_has_pin then
      return jsonb_build_object('success', false, 'reason', 'radius_needs_centre');
    end if;
    -- (a pin and no centre named: stays null, the radius is measured from the pin)
  end if;

  -- two saves arriving together must not interleave
  perform pg_advisory_xact_lock(hashtextextended(p_contributor_id::text, 195));

  delete from public.contributor_service_areas c
   where c.contributor_id = p_contributor_id and not (c.area_id = any (v_ids));
  insert into public.contributor_service_areas (contributor_id, area_id)
    select p_contributor_id, x from unnest(v_ids) as x
    on conflict (contributor_id, area_id) do nothing;

  if p_radius_km is null then
    delete from public.contributor_service_radius r where r.contributor_id = p_contributor_id;
  else
    insert into public.contributor_service_radius (contributor_id, radius_km, centre_area_id)
      values (p_contributor_id, p_radius_km, v_centre)
      on conflict (contributor_id) do update
        set radius_km = excluded.radius_km, centre_area_id = excluded.centre_area_id, updated_at = now();
  end if;

  -- the tag lives only while the Contributor has something chosen
  if cardinality(v_ids) = 0 and p_radius_km is null then
    delete from public.contributor_service_presence pr where pr.contributor_id = p_contributor_id;
  else
    insert into public.contributor_service_presence (contributor_id, presence)
      values (p_contributor_id, p_presence)
      on conflict (contributor_id) do update set presence = excluded.presence, updated_at = now();
  end if;

  return jsonb_build_object(
    'success', true,
    'area_ids', to_jsonb(v_ids),
    'radius_km', p_radius_km,
    'radius_centre_area_id', case when p_radius_km is null then null else v_centre end,
    'presence', p_presence
  );
end;
$$;

comment on function public.set_service_areas(uuid, uuid[], integer, uuid, text) is
  'Replaces a Contributor''s served areas and optional radius in one transaction. Caller must be the Contributor, an active editor of the listing, or an admin. Returns { success, reason | area_ids, radius_km, radius_centre_area_id, presence }.';

revoke all on function public.set_service_areas(uuid, uuid[], integer, uuid, text) from public, anon;
grant execute on function public.set_service_areas(uuid, uuid[], integer, uuid, text) to authenticated;

-- ── 4. The public read for the globe ──────────────────────────────────
-- SECURITY INVOKER on purpose: it reads under the caller's own RLS, so it can never show more than the policies above
-- allow, and it adds no advisor finding. It also re-applies the approval wall itself.
-- p_also_limit is clamped to 0..20 here; the route asks for 5.
create function public.serving_area_listings(p_area_id uuid, p_also_limit integer default 5)
returns table (
  section             text,
  contributor_id      uuid,
  full_name           text,
  contributor_slug    text,
  contributor_kind    text,
  contributor_category text,
  avatar_url          text,
  logo_url            text,
  matched_area_id     uuid,
  matched_area_name   text,
  matched_level       text,
  centre_area_name    text,
  radius_km           integer,
  distance_km         numeric,
  presence            text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive chain as (
    -- the viewed area and every area that contains it (depth 0 = the area itself). Upward only.
    select a.id, a.parent_id, a.level, a.name, a.centroid_lat, a.centroid_lng, 0 as depth
      from public.service_areas a where a.id = p_area_id
    union all
    select a.id, a.parent_id, a.level, a.name, a.centroid_lat, a.centroid_lng, c.depth + 1
      from public.service_areas a join chain c on a.id = c.parent_id
  ),
  live as (
    select p.id, p.full_name, p.contributor_slug, p.contributor_kind, p.contributor_category, p.avatar_url, p.logo_url,
           p.physical_latitude, p.physical_longitude,
           (coalesce(p.contributor_no_fixed_location, false) = false
              and p.physical_latitude is not null and p.physical_longitude is not null) as has_pin,
           coalesce(pr.presence, 'online') as presence
      from public.profiles p
      left join public.contributor_service_presence pr on pr.contributor_id = p.id
     where p.role = 'contributor' and p.contributor_status = 'approved'
       and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
  ),
  main as (
    -- the nearest matching tick wins when someone ticked several areas on the way up
    select distinct on (l.id)
           l.id, l.full_name, l.contributor_slug, l.contributor_kind, l.contributor_category, l.avatar_url, l.logo_url,
           l.presence, c.id as matched_id, c.name as matched_name, c.level as matched_level
      from chain c
      join public.contributor_service_areas csa on csa.area_id = c.id
      join live l on l.id = csa.contributor_id
     where not l.has_pin
     order by l.id, c.depth
  ),
  here as (select centroid_lat, centroid_lng from chain where depth = 0),
  reach as (
    select l.id, l.full_name, l.contributor_slug, l.contributor_kind, l.contributor_category, l.avatar_url, l.logo_url,
           l.has_pin, l.presence, r.radius_km, ca.name as centre_name,
           -- haversine, kilometres
           6371.0 * 2 * asin(least(1.0, sqrt(
             power(sin(radians(h.centroid_lat - cp.lat) / 2), 2)
             + cos(radians(cp.lat)) * cos(radians(h.centroid_lat)) * power(sin(radians(h.centroid_lng - cp.lng) / 2), 2)
           ))) as d
      from public.contributor_service_radius r
      join live l on l.id = r.contributor_id
      left join public.service_areas ca on ca.id = r.centre_area_id
      cross join here h
      cross join lateral (
        select coalesce(ca.centroid_lat, case when l.has_pin then l.physical_latitude end) as lat,
               coalesce(ca.centroid_lng, case when l.has_pin then l.physical_longitude end) as lng
      ) cp
     where cp.lat is not null and cp.lng is not null
       and not exists (select 1 from main m where m.id = l.id)
  )
  select 'main'::text, m.id, m.full_name, m.contributor_slug, m.contributor_kind, m.contributor_category,
         m.avatar_url, m.logo_url, m.matched_id, m.matched_name, m.matched_level,
         null::text, null::integer, null::numeric, m.presence
    from main m
  union all
  select * from (
    select 'also'::text, x.id, x.full_name, x.contributor_slug, x.contributor_kind, x.contributor_category,
           x.avatar_url, x.logo_url, null::uuid, null::text, null::text,
           x.centre_name, x.radius_km, round(x.d::numeric, 1),
           -- a Contributor with a pin is on the map: the Online / No fixed place tag does not describe them
           case when x.has_pin then null else x.presence end
      from reach x
     where x.d <= x.radius_km
     order by x.d, x.full_name, x.id
     limit greatest(0, least(coalesce(p_also_limit, 5), 20))
  ) also_rows;
$$;

comment on function public.serving_area_listings(uuid, integer) is
  'Globe list for one area in view. section=main: approved visible Contributors with no map pin who ticked this area or one containing it (downward-only). section=also: radius reaches this area, not already in main, nearest first then A to Z, capped. Runs as the caller (RLS applies).';

revoke all on function public.serving_area_listings(uuid, integer) from public;
grant execute on function public.serving_area_listings(uuid, integer) to anon, authenticated;

-- ── 5. SEED ───────────────────────────────────────────────────────────
-- Hand-entered approximations (see the header). (name, slug, centroid lat, centroid lng, south, west, north, east)
insert into public.service_areas (level, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east)
values
  ('province', 'Eastern Cape',  'eastern-cape',  -32.3, 26.5, -34.2, 22.7, -30.2, 30.2),
  ('province', 'Free State',    'free-state',    -28.5, 26.8, -30.7, 24.0, -26.6, 29.9),
  ('province', 'Gauteng',       'gauteng',       -26.2, 28.1, -26.9, 27.2, -25.1, 29.0),
  ('province', 'KwaZulu-Natal', 'kwazulu-natal', -29.0, 30.9, -31.1, 28.8, -26.8, 32.9),
  ('province', 'Limpopo',       'limpopo',       -23.4, 29.4, -25.4, 26.4, -22.1, 31.6),
  ('province', 'Mpumalanga',    'mpumalanga',    -25.5, 30.0, -27.3, 28.5, -24.5, 32.0),
  ('province', 'North West',    'north-west',    -26.5, 25.5, -28.2, 22.5, -24.2, 28.2),
  ('province', 'Northern Cape', 'northern-cape', -29.7, 21.8, -32.5, 16.4, -26.5, 25.3),
  ('province', 'Western Cape',  'western-cape',  -33.2, 20.9, -34.9, 17.8, -30.3, 24.2);

insert into public.service_areas (level, parent_id, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east)
select 'place', p.id, v.name, v.slug, v.clat, v.clng, v.s, v.w, v.n, v.e
  from (values
    ('Atteridgeville',   'atteridgeville',   -25.7660, 28.0900, -25.80, 28.05, -25.72, 28.14),
    ('Bronkhorstspruit', 'bronkhorstspruit', -25.8100, 28.7400, -25.86, 28.68, -25.76, 28.80),
    ('Centurion',        'centurion',        -25.8603, 28.1894, -25.93, 28.08, -25.80, 28.26),
    ('Cullinan',         'cullinan',         -25.6700, 28.5200, -25.71, 28.47, -25.63, 28.57),
    ('Hammanskraal',     'hammanskraal',     -25.4000, 28.2800, -25.46, 28.22, -25.34, 28.34),
    ('Johannesburg',     'johannesburg',     -26.2041, 28.0473, -26.35, 27.90, -26.05, 28.20),
    ('Mamelodi',         'mamelodi',         -25.7000, 28.3500, -25.74, 28.30, -25.65, 28.42),
    ('Midrand',          'midrand',          -25.9992, 28.1263, -26.06, 28.05, -25.93, 28.22),
    ('Pretoria',         'pretoria',         -25.7479, 28.2293, -25.90, 28.05, -25.62, 28.40),
    ('Soshanguve',       'soshanguve',       -25.5200, 28.1000, -25.58, 28.03, -25.46, 28.17)
  ) as v(name, slug, clat, clng, s, w, n, e)
  join public.service_areas p on p.slug = 'gauteng' and p.level = 'province';

insert into public.service_areas (level, parent_id, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east)
select 'suburb', p.id, v.name, v.slug, v.clat, v.clng, v.clat - 0.012, v.clng - 0.012, v.clat + 0.012, v.clng + 0.012
  from (values
    ('Arcadia',      'arcadia',      'pretoria',  -25.7439, 28.2067),
    ('Brooklyn',     'brooklyn',     'pretoria',  -25.7611, 28.2397),
    ('Eldoraigne',   'eldoraigne',   'centurion', -25.8312, 28.1593),
    ('Hatfield',     'hatfield',     'pretoria',  -25.7487, 28.2389),
    ('Menlo Park',   'menlo-park',   'pretoria',  -25.7700, 28.2750),
    ('Sunnyside',    'sunnyside',    'pretoria',  -25.7544, 28.2060),
    ('Waterkloof',   'waterkloof',   'pretoria',  -25.7850, 28.2400)
  ) as v(name, slug, parent_slug, clat, clng)
  join public.service_areas p on p.slug = v.parent_slug and p.level = 'place';

commit;

-- Rollback (run in this order; nothing else in the database references these objects):
--   drop function public.serving_area_listings(uuid, integer);
--   drop function public.set_service_areas(uuid, uuid[], integer, uuid, text);
--   drop table public.contributor_service_presence;
--   drop table public.contributor_service_radius;
--   drop table public.contributor_service_areas;
--   drop table public.service_areas;            -- takes its trigger with it
--   drop function public.service_areas_check_parent();
-- Dropping the tables deletes every Contributor's chosen areas: nothing else is lost.
