-- ============================================================================
-- 157_wear_concepts_marketplace.sql — Wear Concepts marketplace (schema tranche)
-- (Drafted as 147; renumbered — a parallel Vision session in the standalone
-- citizens-connect checkout had already applied 147–156 to prod. Those ten
-- files were reconciled into this monorepo lineage in the same commit.)
-- ============================================================================
-- First schema tranche of the ratified Wear roadmap
-- (docs/Citizens_Wear_Roles_and_Concepts_MD.md, 2026-07-13 — "Confirmed
-- direction"). Implements, at the DB layer:
--
--   * Concepts        — public, browsable, upvotable designs by any signed-in
--                       user ("Creator" tier is DERIVED, not a schema object:
--                       baseline participation is never level-gated,
--                       ECOSYSTEM_PROFILE_LEVELS P-rules).
--   * Proposals       — many Brands pitch per Concept. Details (pricing,
--                       materials, timelines) are PRIVATE to the concept's
--                       creator + the proposing brand during bidding; the
--                       PUBLIC sees only brand tags via a narrow SECURITY
--                       DEFINER reader (RLS is row-level, not column-level).
--   * Claim/Award     — exclusive, one active claim per concept, awarded by
--                       the concept's creator via RPC; enforced by a partial
--                       unique index (race-safe with row locks).
--   * Status log      — append-only, brand-authored after Claimed:
--                       Claimed → In Production → Sample Review → Released →
--                       Sold Out. `wear.concept_stage` is defined in lifecycle
--                       order so native enum comparison gives forward-only
--                       transitions. No UPDATE/DELETE path exists (no policy,
--                       no grant) — the audit trail is structural.
--   * Auto "Completed Concepts" post — AFTER-INSERT trigger on the log
--                       ('released') creates the wear.posts row + copies the
--                       concept artwork. Attribution is rendered RELATIONALLY
--                       (posts.concept_id → concept → creator), never baked
--                       into the body, so catalogue conversion can drop the
--                       PUBLIC tag (claims.attribution_public=false) while the
--                       underlying link persists PERMANENTLY (doc §3.2 data-
--                       integrity note — the lifetime royalty depends on it).
--   * Royalties       — milestone 10% / first 100 units auto-committed at
--                       award; brand submits proof of the 100th sale; the
--                       CREATOR (or admin) confirms close-out. Catalogue
--                       conversion (two-party handshake) closes the milestone
--                       obligation and commits lifetime 5% "in its place"
--                       (doc §3.3: milestone OR lifetime, not both).
--   * Brand verification — `wear.brand_verifications` lifecycle (owner
--                       requests, ADMIN reviews; works for either KYC depth —
--                       an open item in the doc). A SECDEF trigger caches the
--                       outcome into `wear.brands.verified` so existing badge
--                       serializers keep working; a column guard makes that
--                       flag admin-managed (it is now load-bearing: only
--                       verified brands may propose/claim).
--
-- PRE-EXISTING HOLES CLOSED HERE (surfaced by this session's security pass;
-- none is reachable through the live Wear /api/* surface, all are reachable
-- through direct PostgREST with the publishable key):
--   1. wear.brands.verified was owner-writable (143 brands_owner_write FOR
--      ALL) — self-escalation once verification gates marketplace power.
--   2. wear.profiles.verified was self-writable — self-badging.
--   3. wear.posts.brand_id / wear.stories.brand_id were unchecked on write —
--      any user could post/story AS any brand. Policies recreated with an
--      ownership check.
--
-- Conventions: mig-143 style (RLS on every table, hardened empty search_path,
-- schema-qualified bodies); mig-144 SECDEF-RPC precedent (auth.uid() re-derived
-- internally, NULL-uid arm FIRST — the §3E gotcha); mig-146 lesson (grants are
-- explicit per new table, least-privilege; 143's blanket grant was one-time).
-- Physical on-garment attribution (doc §4) is a marketplace policy recorded on
-- the claim (attribution_note), not DB-enforceable.
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
-- concept_stage is defined in LIFECYCLE ORDER on purpose: postgres compares
-- enums by definition order, which is what makes "forward-only" a native `<`.
-- Never append values out of lifecycle order.
create type wear.concept_stage as enum
  ('proposed','claimed','in_production','sample_review','released','sold_out');
create type wear.concept_proposal_status as enum
  ('submitted','withdrawn','awarded','declined');
create type wear.concept_claim_status as enum ('active','revoked');
create type wear.royalty_kind   as enum ('milestone','lifetime');
create type wear.royalty_status as enum ('active','proof_submitted','closed');
create type wear.catalogue_conversion_status as enum
  ('proposed','accepted','declined','cancelled');
create type wear.brand_verification_status as enum
  ('pending','approved','rejected','revoked');

-- ── 2. Verified-column guard (holes #1/#2) ──────────────────────────────────
-- Plain (SECURITY INVOKER) trigger fn: current_user reflects the caller role.
-- PostgREST end-user roles are 'anon'/'authenticated'; the SECDEF sync trigger
-- below and service_role sessions pass through. Admins (wear.is_admin(), mig
-- 145) may flip the flag once an admin UPDATE path exists.
create or replace function wear.protect_verified_column()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.verified)
     or (tg_op = 'UPDATE' and new.verified is distinct from old.verified) then
    if current_user in ('anon','authenticated') then
      if not wear.is_admin() then
        raise exception 'verified is admin-managed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function wear.protect_verified_column() from public;

create trigger trg_protect_brands_verified
  before insert or update on wear.brands
  for each row execute function wear.protect_verified_column();
create trigger trg_protect_profiles_verified
  before insert or update on wear.profiles
  for each row execute function wear.protect_verified_column();

-- ── 3. Brand verification lifecycle ─────────────────────────────────────────
create table wear.brand_verifications (
  brand_id     uuid primary key references wear.brands(id) on delete cascade,
  status       wear.brand_verification_status not null default 'pending',
  note         text,   -- applicant's submission (business info, links)
  requested_by uuid references wear.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_by  uuid references wear.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index brand_verifications_status_idx
  on wear.brand_verifications(status, requested_at);
alter table wear.brand_verifications enable row level security;

-- Owner + moderation queue read; owner requests (forced 'pending'); owner may
-- RE-request only after 'rejected' ('revoked' re-entry is an admin decision);
-- review (approve/reject/revoke) is ADMIN-only per the ratified role model.
create policy brand_verifications_read on wear.brand_verifications for select using (
  wear.is_moderator()
  or exists (select 1 from wear.brands b
             where b.id = brand_id and b.owner_user_id = auth.uid())
);
create policy brand_verifications_owner_request on wear.brand_verifications for insert with check (
  status = 'pending'
  and requested_by = auth.uid()
  and exists (select 1 from wear.brands b
              where b.id = brand_id and b.owner_user_id = auth.uid())
);
create policy brand_verifications_owner_rerequest on wear.brand_verifications for update
  using (status = 'rejected'
         and exists (select 1 from wear.brands b
                     where b.id = brand_id and b.owner_user_id = auth.uid()))
  with check (status = 'pending'
              and exists (select 1 from wear.brands b
                          where b.id = brand_id and b.owner_user_id = auth.uid()));
create policy brand_verifications_admin_review on wear.brand_verifications for update
  using (wear.is_admin()) with check (wear.is_admin());

create trigger trg_brand_verifications_updated_at before update on wear.brand_verifications
  for each row execute function wear.set_updated_at();

-- Cache the outcome into wear.brands.verified (badge serializers + marketplace
-- RLS predicates read the flag directly). SECDEF: runs as owner, passes the
-- column guard above.
create or replace function wear.sync_brand_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update wear.brands set verified = false where id = old.brand_id;
    return old;
  end if;
  update wear.brands set verified = (new.status = 'approved') where id = new.brand_id;
  return new;
end $$;
revoke all on function wear.sync_brand_verified() from public;
create trigger trg_sync_brand_verified
  after insert or update or delete on wear.brand_verifications
  for each row execute function wear.sync_brand_verified();

-- ── 4. Concepts (+media +upvotes) ───────────────────────────────────────────
create table wear.concepts (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references wear.users(id) on delete cascade,
  title       text not null,
  description text,
  status      wear.concept_stage not null default 'proposed',  -- cached; log is truth post-claim
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index concepts_creator_idx on wear.concepts(creator_id, created_at desc);
create index concepts_status_idx  on wear.concepts(status, created_at desc);
create index concepts_created_idx on wear.concepts(created_at desc);
alter table wear.concepts enable row level security;

-- Creator may edit/delete ONLY while unclaimed ('proposed'): after award the
-- design is production input and the claim/royalty chain must not lose its
-- root. WITH CHECK pins status so a creator can never self-advance the
-- lifecycle (that is RPC-only). Moderator takedown mirrors mig 145.
create policy concepts_public_read on wear.concepts for select using (true);
create policy concepts_creator_insert on wear.concepts for insert
  with check (auth.uid() = creator_id and status = 'proposed');
create policy concepts_creator_update on wear.concepts for update
  using (auth.uid() = creator_id and status = 'proposed')
  with check (auth.uid() = creator_id and status = 'proposed');
create policy concepts_creator_delete on wear.concepts for delete
  using (auth.uid() = creator_id and status = 'proposed');
create policy concepts_moderator_delete on wear.concepts for delete
  using (wear.is_moderator());
create trigger trg_concepts_updated_at before update on wear.concepts
  for each row execute function wear.set_updated_at();

create table wear.concept_media (
  id          uuid primary key default gen_random_uuid(),
  concept_id  uuid not null references wear.concepts(id) on delete cascade,
  url         text not null,
  kind        wear.post_media_kind not null default 'image',
  alt_text    text,
  order_index int not null default 0
);
create index concept_media_concept_idx on wear.concept_media(concept_id, order_index);
alter table wear.concept_media enable row level security;
create policy concept_media_public_read on wear.concept_media for select using (true);
-- Artwork is frozen once claimed (same reason as the concept row itself).
create policy concept_media_creator_write on wear.concept_media for all
  using (exists (select 1 from wear.concepts c
                 where c.id = concept_id and c.creator_id = auth.uid() and c.status = 'proposed'))
  with check (exists (select 1 from wear.concepts c
                      where c.id = concept_id and c.creator_id = auth.uid() and c.status = 'proposed'));

create table wear.concept_upvotes (
  concept_id uuid not null references wear.concepts(id) on delete cascade,
  user_id    uuid not null references wear.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (concept_id, user_id)
);
create index concept_upvotes_user_idx on wear.concept_upvotes(user_id, created_at desc);
alter table wear.concept_upvotes enable row level security;
create policy concept_upvotes_public_read on wear.concept_upvotes for select using (true);
create policy concept_upvotes_self_write on wear.concept_upvotes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Completed-Concepts link on posts (relational attribution; see header).
alter table wear.posts
  add column concept_id uuid references wear.concepts(id) on delete set null;
create index posts_concept_idx on wear.posts(concept_id) where concept_id is not null;

-- ── 5. Proposals ────────────────────────────────────────────────────────────
create table wear.concept_proposals (
  id                  uuid primary key default gen_random_uuid(),
  concept_id          uuid not null references wear.concepts(id) on delete cascade,
  brand_id            uuid not null references wear.brands(id) on delete cascade,
  status              wear.concept_proposal_status not null default 'submitted',
  mockup_urls         text[] not null default '{}',  -- URL-only media, platform-wide model
  materials           text,
  est_unit_price      numeric(10,2) check (est_unit_price is null or est_unit_price >= 0),
  moq                 integer check (moq is null or moq > 0),
  est_turnaround_days integer check (est_turnaround_days is null or est_turnaround_days > 0),
  note                text,   -- brand's specialty/capability pitch
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (concept_id, brand_id)   -- one proposal per brand per concept (also the concept index)
);
create index concept_proposals_brand_idx on wear.concept_proposals(brand_id, created_at desc);
alter table wear.concept_proposals enable row level security;

-- Details stay private during bidding: creator of the concept, owner of the
-- proposing brand, and moderators (dispute duty, doc §1) only. The PUBLIC
-- brand-tag surface is wear.get_concept_proposal_tags() below.
create policy concept_proposals_party_read on wear.concept_proposals for select using (
  exists (select 1 from wear.brands b
          where b.id = brand_id and b.owner_user_id = auth.uid())
  or exists (select 1 from wear.concepts c
             where c.id = concept_id and c.creator_id = auth.uid())
  or wear.is_moderator()
);
-- Only VERIFIED brands may pitch, only while the concept is open, never across
-- a block (mirrors the DM rules).
create policy concept_proposals_brand_insert on wear.concept_proposals for insert with check (
  status = 'submitted'
  and exists (select 1 from wear.brands b
              where b.id = brand_id and b.owner_user_id = auth.uid() and b.verified)
  and exists (select 1 from wear.concepts c
              where c.id = concept_id and c.status = 'proposed'
                and not wear.is_blocked_either(auth.uid(), c.creator_id))
);
-- Brand may edit/withdraw while bidding; withdraw stays possible even if the
-- brand loses verification mid-bid; a 'declined' proposal may re-enter ONLY
-- when the concept is open again (claim revoked). Award/decline transitions
-- are RPC-only (WITH CHECK never admits 'awarded'/'declined').
create policy concept_proposals_brand_update on wear.concept_proposals for update
  using (status in ('submitted','withdrawn','declined')
         and exists (select 1 from wear.brands b
                     where b.id = brand_id and b.owner_user_id = auth.uid()))
  with check (
    exists (select 1 from wear.brands b
            where b.id = brand_id and b.owner_user_id = auth.uid())
    and (
      status = 'withdrawn'
      or (status = 'submitted'
          and exists (select 1 from wear.brands b
                      where b.id = brand_id and b.owner_user_id = auth.uid() and b.verified)
          and exists (select 1 from wear.concepts c
                      where c.id = concept_id and c.status = 'proposed'))
    )
  );
create policy concept_proposals_brand_delete on wear.concept_proposals for delete using (
  status <> 'awarded'
  and exists (select 1 from wear.brands b
              where b.id = brand_id and b.owner_user_id = auth.uid())
  and exists (select 1 from wear.concepts c
              where c.id = concept_id and c.status = 'proposed')
);
create trigger trg_concept_proposals_updated_at before update on wear.concept_proposals
  for each row execute function wear.set_updated_at();

-- ── 6. Claims (exclusive award) ─────────────────────────────────────────────
create table wear.concept_claims (
  id                 uuid primary key default gen_random_uuid(),
  concept_id         uuid not null references wear.concepts(id) on delete cascade,
  brand_id           uuid not null references wear.brands(id) on delete cascade,
  proposal_id        uuid references wear.concept_proposals(id) on delete set null,
  status             wear.concept_claim_status not null default 'active',
  awarded_by         uuid references wear.users(id) on delete set null,
  awarded_at         timestamptz not null default now(),
  -- Public creator-tag flag. Flipped false ONLY by catalogue conversion; the
  -- claim row itself (the concept↔item link) persists permanently (doc §3.2).
  attribution_public boolean not null default true,
  -- Brand's on-garment placement commitment (doc §4) — informational.
  attribution_note   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- THE exclusivity wall: one ACTIVE claim per concept, race-safe.
create unique index concept_claims_active_uidx on wear.concept_claims(concept_id)
  where (status = 'active');
create index concept_claims_brand_idx on wear.concept_claims(brand_id, awarded_at desc);
alter table wear.concept_claims enable row level security;

-- Claims are public info ("Claimed by X" renders on the concept). Creation is
-- RPC-only (no INSERT policy/grant); the only direct UPDATE path is the admin
-- dispute lever (revoke).
create policy concept_claims_public_read on wear.concept_claims for select using (true);
create policy concept_claims_admin_update on wear.concept_claims for update
  using (wear.is_admin()) with check (wear.is_admin());
create trigger trg_concept_claims_updated_at before update on wear.concept_claims
  for each row execute function wear.set_updated_at();

-- ── 7. Append-only status log ───────────────────────────────────────────────
create table wear.concept_status_log (
  id         uuid primary key default gen_random_uuid(),
  concept_id uuid not null references wear.concepts(id) on delete cascade,
  claim_id   uuid not null references wear.concept_claims(id) on delete cascade,
  status     wear.concept_stage not null,
  note       text,
  created_by uuid references wear.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index concept_status_log_concept_idx on wear.concept_status_log(concept_id, created_at);
create index concept_status_log_claim_idx   on wear.concept_status_log(claim_id, created_at);
alter table wear.concept_status_log enable row level security;
-- Public timeline; APPEND-ONLY BY CONSTRUCTION: no write policy, no write
-- grant — rows enter only through the RPCs below (definer = table owner).
create policy concept_status_log_public_read on wear.concept_status_log for select using (true);

-- ── 8. Royalty obligations ──────────────────────────────────────────────────
create table wear.royalty_obligations (
  id                 uuid primary key default gen_random_uuid(),
  claim_id           uuid not null references wear.concept_claims(id) on delete cascade,
  kind               wear.royalty_kind not null,
  pct                numeric(5,2) not null check (pct > 0 and pct <= 100),
  threshold_units    integer check (threshold_units is null or threshold_units > 0),
  status             wear.royalty_status not null default 'active',
  proof_url          text,
  proof_note         text,
  proof_submitted_at timestamptz,
  closed_at          timestamptz,
  closed_by          uuid references wear.users(id) on delete set null,
  closed_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (claim_id, kind)   -- at most one milestone + one lifetime per claim
);
create index royalty_obligations_status_idx on wear.royalty_obligations(status);
alter table wear.royalty_obligations enable row level security;
-- Party-scoped (+ moderators): proof documents may carry order/sales data, so
-- NOT public. The doc's PUBLIC accountability surface is the status log +
-- Completed Concepts, which are public above. Writes are RPC-only.
create policy royalty_obligations_party_read on wear.royalty_obligations for select using (
  exists (select 1 from wear.concept_claims cl
          join wear.brands b on b.id = cl.brand_id
          where cl.id = claim_id and b.owner_user_id = auth.uid())
  or exists (select 1 from wear.concept_claims cl
             join wear.concepts c on c.id = cl.concept_id
             where cl.id = claim_id and c.creator_id = auth.uid())
  or wear.is_moderator()
);
create trigger trg_royalty_obligations_updated_at before update on wear.royalty_obligations
  for each row execute function wear.set_updated_at();

-- ── 9. Catalogue conversions (two-party handshake) ──────────────────────────
create table wear.catalogue_conversions (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references wear.concept_claims(id) on delete cascade,
  status       wear.catalogue_conversion_status not null default 'proposed',
  proposed_by  uuid references wear.users(id) on delete set null,
  proposed_at  timestamptz not null default now(),
  responded_by uuid references wear.users(id) on delete set null,
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- One open-or-accepted handshake per claim; accepted is permanent, declined/
-- cancelled may be re-proposed later.
create unique index catalogue_conversions_open_uidx on wear.catalogue_conversions(claim_id)
  where (status in ('proposed','accepted'));
create index catalogue_conversions_claim_idx on wear.catalogue_conversions(claim_id, created_at desc);
alter table wear.catalogue_conversions enable row level security;
-- Negotiation is between the parties (+ moderators). The public learns the
-- OUTCOME via claims.attribution_public. Writes are RPC-only.
create policy catalogue_conversions_party_read on wear.catalogue_conversions for select using (
  exists (select 1 from wear.concept_claims cl
          join wear.brands b on b.id = cl.brand_id
          where cl.id = claim_id and b.owner_user_id = auth.uid())
  or exists (select 1 from wear.concept_claims cl
             join wear.concepts c on c.id = cl.concept_id
             where cl.id = claim_id and c.creator_id = auth.uid())
  or wear.is_moderator()
);
create trigger trg_catalogue_conversions_updated_at before update on wear.catalogue_conversions
  for each row execute function wear.set_updated_at();

-- ── 10. Tighten posts/stories brand attribution (hole #3) ───────────────────
-- Recreated with: (a) brand_id only for a brand you own; (b) posts.concept_id
-- only for the brand holding that concept's ACTIVE claim (the auto-post
-- trigger bypasses RLS as owner; this guards manual spoofing).
drop policy posts_author_write on wear.posts;
create policy posts_author_write on wear.posts for all
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and (brand_id is null
         or exists (select 1 from wear.brands b
                    where b.id = brand_id and b.owner_user_id = auth.uid()))
    and (concept_id is null
         or exists (select 1 from wear.concept_claims cl
                    join wear.brands b on b.id = cl.brand_id
                    where cl.concept_id = posts.concept_id
                      and cl.status = 'active'
                      and b.owner_user_id = auth.uid()))
  );
drop policy stories_author_write on wear.stories;
create policy stories_author_write on wear.stories for all
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and (brand_id is null
         or exists (select 1 from wear.brands b
                    where b.id = brand_id and b.owner_user_id = auth.uid()))
  );

-- ── 11. Public proposal-tag reader ──────────────────────────────────────────
-- The doc's visibility rule: brand names are public tags ("3 Brands have
-- proposed"), details stay private. SECDEF returning ONLY (brand_id,
-- created_at); brand display data is public via wear.brands.
create or replace function wear.get_concept_proposal_tags(p_concept_id uuid)
returns table (brand_id uuid, proposed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.brand_id, p.created_at
  from wear.concept_proposals p
  where p.concept_id = p_concept_id
    and p.status <> 'withdrawn'
  order by p.created_at;
$$;
revoke all on function wear.get_concept_proposal_tags(uuid) from public;
grant execute on function wear.get_concept_proposal_tags(uuid) to anon, authenticated, service_role;

-- ── 12. Award RPC (creator selects the winning proposal) ────────────────────
create or replace function wear.award_concept_claim(p_proposal_id uuid)
returns wear.concept_claims
language plpgsql security definer set search_path = '' as $$
declare
  v_caller  uuid := auth.uid();
  v_prop    wear.concept_proposals;
  v_concept wear.concepts;
  v_brand   wear.brands;
  v_claim   wear.concept_claims;
  v_ts      timestamptz := now();
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_prop from wear.concept_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;
  select * into v_concept from wear.concepts where id = v_prop.concept_id for update;
  if not found then
    raise exception 'concept_not_found' using errcode = 'P0002';
  end if;
  if v_concept.creator_id <> v_caller then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_concept.status <> 'proposed' then
    raise exception 'concept_not_open' using errcode = '22023';
  end if;
  if v_prop.status <> 'submitted' then
    raise exception 'proposal_not_open' using errcode = '22023';
  end if;
  select * into v_brand from wear.brands where id = v_prop.brand_id;
  if not found or not v_brand.verified then
    raise exception 'brand_not_verified' using errcode = '22023';
  end if;
  if wear.is_blocked_either(v_caller, v_brand.owner_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into wear.concept_claims (concept_id, brand_id, proposal_id, awarded_by, awarded_at)
  values (v_concept.id, v_prop.brand_id, v_prop.id, v_caller, v_ts)
  returning * into v_claim;

  update wear.concept_proposals set status = 'awarded',  updated_at = v_ts
    where id = v_prop.id;
  update wear.concept_proposals set status = 'declined', updated_at = v_ts
    where concept_id = v_concept.id and id <> v_prop.id and status = 'submitted';
  update wear.concepts set status = 'claimed', updated_at = v_ts
    where id = v_concept.id;

  insert into wear.concept_status_log (concept_id, claim_id, status, created_by)
  values (v_concept.id, v_claim.id, 'claimed', v_caller);

  -- Doc §3.1: 10% on the first 100 units, committed at the point of claim.
  insert into wear.royalty_obligations (claim_id, kind, pct, threshold_units)
  values (v_claim.id, 'milestone', 10.00, 100);

  return v_claim;
end $$;
revoke all on function wear.award_concept_claim(uuid) from public;
grant execute on function wear.award_concept_claim(uuid) to authenticated, service_role;

-- ── 13. Stage-advance RPC (active brand only, forward only) ─────────────────
create or replace function wear.advance_concept_status(
  p_concept_id uuid, p_status wear.concept_stage, p_note text default null)
returns wear.concept_status_log
language plpgsql security definer set search_path = '' as $$
declare
  v_caller  uuid := auth.uid();
  v_concept wear.concepts;
  v_claim   wear.concept_claims;
  v_row     wear.concept_status_log;
  v_ts      timestamptz := now();
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_concept from wear.concepts where id = p_concept_id for update;
  if not found then
    raise exception 'concept_not_found' using errcode = 'P0002';
  end if;
  select cl.* into v_claim from wear.concept_claims cl
    where cl.concept_id = p_concept_id and cl.status = 'active' for update;
  if not found then
    raise exception 'no_active_claim' using errcode = '22023';
  end if;
  if not exists (select 1 from wear.brands b
                 where b.id = v_claim.brand_id and b.owner_user_id = v_caller) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- Brands own the log AFTER 'claimed'; enum order = lifecycle order, so
  -- forward-only (skips allowed, e.g. straight past sample_review) is `>`.
  if p_status <= 'claimed'::wear.concept_stage then
    raise exception 'invalid_stage' using errcode = '22023';
  end if;
  if p_status <= v_concept.status then
    raise exception 'stage_not_forward' using errcode = '22023';
  end if;

  insert into wear.concept_status_log (concept_id, claim_id, status, note, created_by)
  values (p_concept_id, v_claim.id, p_status,
          nullif(left(btrim(coalesce(p_note, '')), 500), ''), v_caller)
  returning * into v_row;

  update wear.concepts set status = p_status, updated_at = v_ts where id = p_concept_id;
  return v_row;
end $$;
revoke all on function wear.advance_concept_status(uuid, wear.concept_stage, text) from public;
grant execute on function wear.advance_concept_status(uuid, wear.concept_stage, text) to authenticated, service_role;

-- ── 14. Auto "Completed Concepts" post on Released ──────────────────────────
-- Body carries NO usernames (attribution renders relationally via concept_id;
-- catalogue conversion must be able to drop the public tag without rewriting
-- content). Duplicate-guarded per (concept, brand) — the forward-only RPC
-- already makes a second 'released' impossible for the same claim, this also
-- covers direct service_role log writes.
create or replace function wear.create_completed_concept_post()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_claim   wear.concept_claims;
  v_brand   wear.brands;
  v_title   text;
  v_post_id uuid;
begin
  select * into v_claim from wear.concept_claims where id = new.claim_id;
  if not found or v_claim.status <> 'active' then
    return new;
  end if;
  select * into v_brand from wear.brands where id = v_claim.brand_id;
  if not found then
    return new;
  end if;
  if exists (select 1 from wear.posts p
             where p.concept_id = new.concept_id and p.brand_id = v_claim.brand_id) then
    return new;
  end if;
  select c.title into v_title from wear.concepts c where c.id = new.concept_id;

  insert into wear.posts (author_id, brand_id, body, concept_id)
  values (v_brand.owner_user_id, v_brand.id,
          'Completed Concept — "' || coalesce(v_title, 'Untitled') || '"',
          new.concept_id)
  returning id into v_post_id;

  insert into wear.post_media (post_id, url, kind, alt_text, order_index)
  select v_post_id, m.url, m.kind, m.alt_text, m.order_index
  from wear.concept_media m
  where m.concept_id = new.concept_id;

  return new;
end $$;
revoke all on function wear.create_completed_concept_post() from public;
create trigger trg_completed_concept_post
  after insert on wear.concept_status_log
  for each row
  when (new.status = 'released')
  execute function wear.create_completed_concept_post();

-- ── 15. Re-open a concept when its claim is revoked (admin dispute lever) ───
-- Keeps the cached stage honest: a revoked claim must not leave the concept
-- stuck mid-lifecycle. Previously-declined proposals may then re-enter via
-- the proposals UPDATE policy above.
create or replace function wear.reopen_concept_on_claim_revoke()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update wear.concepts set status = 'proposed', updated_at = now()
    where id = new.concept_id;
  return new;
end $$;
revoke all on function wear.reopen_concept_on_claim_revoke() from public;
create trigger trg_reopen_concept_on_claim_revoke
  after update on wear.concept_claims
  for each row
  when (old.status = 'active' and new.status = 'revoked')
  execute function wear.reopen_concept_on_claim_revoke();

-- ── 16. Catalogue-conversion RPCs ───────────────────────────────────────────
create or replace function wear.propose_catalogue_conversion(p_claim_id uuid)
returns wear.catalogue_conversions
language plpgsql security definer set search_path = '' as $$
declare
  v_caller  uuid := auth.uid();
  v_claim   wear.concept_claims;
  v_brand   wear.brands;
  v_concept wear.concepts;
  v_row     wear.catalogue_conversions;
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_claim from wear.concept_claims
    where id = p_claim_id and status = 'active' for update;
  if not found then
    raise exception 'claim_not_active' using errcode = '22023';
  end if;
  select * into v_brand from wear.brands where id = v_claim.brand_id;
  if not found or v_brand.owner_user_id <> v_caller then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_concept from wear.concepts where id = v_claim.concept_id;
  if not found or v_concept.status < 'released'::wear.concept_stage then
    raise exception 'not_released' using errcode = '22023';
  end if;
  if exists (select 1 from wear.catalogue_conversions
             where claim_id = v_claim.id and status in ('proposed','accepted')) then
    raise exception 'conversion_already_open' using errcode = '22023';
  end if;

  insert into wear.catalogue_conversions (claim_id, proposed_by)
  values (v_claim.id, v_caller)
  returning * into v_row;
  return v_row;
end $$;
revoke all on function wear.propose_catalogue_conversion(uuid) from public;
grant execute on function wear.propose_catalogue_conversion(uuid) to authenticated, service_role;

-- Creator accepts (drops public tag; milestone → closed as superseded;
-- lifetime 5% committed "in its place", doc §3.2/§3.3) or declines.
create or replace function wear.respond_catalogue_conversion(p_conversion_id uuid, p_accept boolean)
returns wear.catalogue_conversions
language plpgsql security definer set search_path = '' as $$
declare
  v_caller  uuid := auth.uid();
  v_conv    wear.catalogue_conversions;
  v_claim   wear.concept_claims;
  v_concept wear.concepts;
  v_ts      timestamptz := now();
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_conv from wear.catalogue_conversions
    where id = p_conversion_id for update;
  if not found or v_conv.status <> 'proposed' then
    raise exception 'conversion_not_open' using errcode = '22023';
  end if;
  select * into v_claim from wear.concept_claims where id = v_conv.claim_id for update;
  if not found or v_claim.status <> 'active' then
    raise exception 'claim_not_active' using errcode = '22023';
  end if;
  select * into v_concept from wear.concepts where id = v_claim.concept_id;
  if not found or v_concept.creator_id <> v_caller then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_accept then
    update wear.catalogue_conversions
      set status = 'accepted', responded_by = v_caller, responded_at = v_ts, updated_at = v_ts
      where id = v_conv.id;
    update wear.concept_claims
      set attribution_public = false, updated_at = v_ts
      where id = v_claim.id;
    update wear.royalty_obligations
      set status = 'closed', closed_at = v_ts, closed_by = v_caller,
          closed_note = 'superseded by catalogue conversion (lifetime 5%)', updated_at = v_ts
      where claim_id = v_claim.id and kind = 'milestone' and status <> 'closed';
    insert into wear.royalty_obligations (claim_id, kind, pct, threshold_units)
    values (v_claim.id, 'lifetime', 5.00, null)
    on conflict (claim_id, kind) do nothing;
  else
    update wear.catalogue_conversions
      set status = 'declined', responded_by = v_caller, responded_at = v_ts, updated_at = v_ts
      where id = v_conv.id;
  end if;

  select * into v_conv from wear.catalogue_conversions where id = v_conv.id;
  return v_conv;
end $$;
revoke all on function wear.respond_catalogue_conversion(uuid, boolean) from public;
grant execute on function wear.respond_catalogue_conversion(uuid, boolean) to authenticated, service_role;

-- Proposing brand may withdraw a pending handshake.
create or replace function wear.cancel_catalogue_conversion(p_conversion_id uuid)
returns wear.catalogue_conversions
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := auth.uid();
  v_conv   wear.catalogue_conversions;
  v_ts     timestamptz := now();
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_conv from wear.catalogue_conversions
    where id = p_conversion_id for update;
  if not found or v_conv.status <> 'proposed' then
    raise exception 'conversion_not_open' using errcode = '22023';
  end if;
  if not exists (select 1 from wear.concept_claims cl
                 join wear.brands b on b.id = cl.brand_id
                 where cl.id = v_conv.claim_id and b.owner_user_id = v_caller) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update wear.catalogue_conversions
    set status = 'cancelled', updated_at = v_ts
    where id = v_conv.id;
  select * into v_conv from wear.catalogue_conversions where id = v_conv.id;
  return v_conv;
end $$;
revoke all on function wear.cancel_catalogue_conversion(uuid) from public;
grant execute on function wear.cancel_catalogue_conversion(uuid) to authenticated, service_role;

-- ── 17. Royalty proof + close-out RPCs ──────────────────────────────────────
-- Brand submits proof of the 100th sale (re-submission allowed while open).
create or replace function wear.submit_royalty_proof(
  p_obligation_id uuid, p_proof_url text, p_note text default null)
returns wear.royalty_obligations
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := auth.uid();
  v_ob     wear.royalty_obligations;
  v_url    text := btrim(coalesce(p_proof_url, ''));
  v_ts     timestamptz := now();
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_ob from wear.royalty_obligations where id = p_obligation_id for update;
  if not found then
    raise exception 'obligation_not_found' using errcode = 'P0002';
  end if;
  if v_ob.kind <> 'milestone' then
    raise exception 'not_milestone' using errcode = '22023';
  end if;
  if v_ob.status = 'closed' then
    raise exception 'already_closed' using errcode = '22023';
  end if;
  if not exists (select 1 from wear.concept_claims cl
                 join wear.brands b on b.id = cl.brand_id
                 where cl.id = v_ob.claim_id and b.owner_user_id = v_caller) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_url = '' then
    raise exception 'proof_url_required' using errcode = '22023';
  end if;

  update wear.royalty_obligations
    set status = 'proof_submitted', proof_url = v_url,
        proof_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
        proof_submitted_at = v_ts, updated_at = v_ts
    where id = v_ob.id;
  select * into v_ob from wear.royalty_obligations where id = v_ob.id;
  return v_ob;
end $$;
revoke all on function wear.submit_royalty_proof(uuid, text, text) from public;
grant execute on function wear.submit_royalty_proof(uuid, text, text) to authenticated, service_role;

-- Creator confirms the proof and closes the obligation; admin may close from
-- any open state (dispute lever). Auto-close-on-proof was deliberately NOT
-- chosen: the confirmation protects the creator (doc §3.1 accountability).
create or replace function wear.close_royalty_obligation(p_obligation_id uuid)
returns wear.royalty_obligations
language plpgsql security definer set search_path = '' as $$
declare
  v_caller   uuid := auth.uid();
  v_ob       wear.royalty_obligations;
  v_is_admin boolean;
  v_ts       timestamptz := now();
begin
  if v_caller is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into v_ob from wear.royalty_obligations where id = p_obligation_id for update;
  if not found then
    raise exception 'obligation_not_found' using errcode = 'P0002';
  end if;
  if v_ob.status = 'closed' then
    raise exception 'already_closed' using errcode = '22023';
  end if;
  v_is_admin := wear.is_admin();
  if not v_is_admin then
    if v_ob.status <> 'proof_submitted'
       or not exists (select 1 from wear.concept_claims cl
                      join wear.concepts c on c.id = cl.concept_id
                      where cl.id = v_ob.claim_id and c.creator_id = v_caller) then
      raise exception 'unauthorized' using errcode = '42501';
    end if;
  end if;

  update wear.royalty_obligations
    set status = 'closed', closed_at = v_ts, closed_by = v_caller, updated_at = v_ts
    where id = v_ob.id;
  select * into v_ob from wear.royalty_obligations where id = v_ob.id;
  return v_ob;
end $$;
revoke all on function wear.close_royalty_obligation(uuid) from public;
grant execute on function wear.close_royalty_obligation(uuid) to authenticated, service_role;

-- ── 18. Table grants (explicit + least-privilege — the mig-146 lesson) ──────
-- RLS still gates every row; write grants exist only where a write POLICY (or
-- the admin lever) exists. Log/obligations/conversions get NO authenticated
-- write grants at all — RPC-only.
grant select on wear.concepts, wear.concept_media, wear.concept_upvotes,
                wear.concept_claims, wear.concept_status_log
  to anon, authenticated;
grant insert, update, delete on wear.concepts, wear.concept_media to authenticated;
grant insert, delete on wear.concept_upvotes to authenticated;
grant select, insert, update, delete on wear.concept_proposals to authenticated;
grant update on wear.concept_claims to authenticated;              -- admin revoke (RLS-gated)
grant select on wear.royalty_obligations, wear.catalogue_conversions to authenticated;
grant select, insert, update on wear.brand_verifications to authenticated;
grant all on wear.concepts, wear.concept_media, wear.concept_upvotes,
             wear.concept_proposals, wear.concept_claims, wear.concept_status_log,
             wear.royalty_obligations, wear.catalogue_conversions,
             wear.brand_verifications
  to service_role;

-- ============================================================================
-- Post-apply checklist:
--  * get_advisors(security) = 0 ERROR, 0 new findings vs mig-146 baseline
--    (72 WARN / 3 INFO; the linter does not surface wear.* SECDEF fns —
--    pre-existing behaviour noted at mig 145).
--  * Structural QA: wear.* = 32 tables / 0 without RLS / ~70 policies /
--    21 fns / 19 enums.
--  * Rolled-back smokes: (a) owner UPDATE brands.verified → 42501;
--    (b) unverified-brand proposal INSERT → RLS denial; (c) full happy path
--    concept → propose → award → advance → released auto-post → convert;
--    (d) non-creator award attempt → 42501; (e) stage backwards → error;
--    (f) status_log INSERT as authenticated → denied (no grant).
--  * Update SHARED_DB_CONTRACT §9 (head 157) + RESUME_HERE.
--  * Wear app follow-up (next tranche): /api/concepts* routes + screens;
--    store repos; brand-verification admin UI; rate limiting (NEXT STEPS 3b).
-- ============================================================================
