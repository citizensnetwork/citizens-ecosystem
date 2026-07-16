-- ============================================================================
-- 160_wear_content_permission_model.sql — Wear identity & content-permission
-- model (RATIFIED 2026-07-15; docs/Citizens_Wear_Roles_and_Concepts_MD.md §6 +
-- ECOSYSTEM_PROFILE_LEVELS §3.2/P1.1). Enforces, at the RLS layer, two rules the
-- design session locked:
--
--   1. POSTS ARE BRAND-TIER. A post must be authored by a user who OWNS the
--      attributed brand AND that brand must be `verified`. `brand_id` is now
--      MANDATORY on insert — base-Citizen "self-posts" (brand_id IS NULL) are
--      retired. The Home feed is therefore brand apparel by construction.
--      (Base Citizens keep Concepts + Stories — unchanged here.)
--
--   2. BRAND CREATION IS ADMIN-ASSIGNED. Self-serve brand creation is removed:
--      `wear.brands` INSERT is restricted to `wear.is_admin()` (mig 145). The
--      owner keeps UPDATE/DELETE of their own row; `verified` stays admin-managed
--      (mig 157 `protect_verified_column`). service_role seeding bypasses RLS.
--
-- WHY RLS (not just the app): the self-serve tile is gone and `POST /api/posts`
-- now gates on owned+verified, but the publishable key can reach PostgREST
-- directly (the mig-157 lesson) — the wall has to live in the policy. This
-- migration only TIGHTENS: no grant is widened, no data is touched.
--
-- Conventions: mig-143/157 style. Both policies are DROP+CREATE (mig 157 already
-- recreated `posts_author_write`; we re-tighten it). The completed-concept
-- auto-post trigger (mig 157 `create_completed_concept_post`) is SECURITY
-- DEFINER and bypasses RLS, so it is unaffected — and its brand is a verified
-- claim-holder anyway.
-- ============================================================================

-- ── 1. Posts: author must own an attributed, VERIFIED brand ─────────────────
-- USING stays author-only so authors can still read/delete their own rows
-- (including grandfathered self-posts). WITH CHECK gains the brand-tier gate.
drop policy posts_author_write on wear.posts;
create policy posts_author_write on wear.posts for all
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and brand_id is not null
    and exists (select 1 from wear.brands b
                where b.id = brand_id
                  and b.owner_user_id = auth.uid()
                  and b.verified)
    and (concept_id is null
         or exists (select 1 from wear.concept_claims cl
                    join wear.brands b on b.id = cl.brand_id
                    where cl.concept_id = posts.concept_id
                      and cl.status = 'active'
                      and b.owner_user_id = auth.uid()))
  );

-- ── 2. Brands: self-serve creation removed (admin-assigned only) ────────────
-- mig 143 `brands_owner_write` was FOR ALL (owner could self-INSERT). Split it:
-- owner keeps UPDATE + DELETE; INSERT is admin-only. Cross-owner minting (admin
-- creates a brand owned by an approved applicant) is allowed by the is_admin()
-- check — the owner_user_id column is free once the caller is an admin.
drop policy brands_owner_write on wear.brands;
create policy brands_owner_update on wear.brands for update
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy brands_owner_delete on wear.brands for delete
  using (auth.uid() = owner_user_id);
create policy brands_admin_insert on wear.brands for insert
  with check (wear.is_admin());

-- ============================================================================
-- APPLIED 2026-07-15 (founder-confirmed). Pre-apply tag `wear-pre-mig160`.
-- Advisor(security) = 0 ERROR / 101 WARN / 3 INFO — 0 new findings vs head-159.
-- Rolled-back prod smokes A–F2 all PASS (see checklist). wear policy count 73→75
-- (net +2: brands FOR-ALL split → owner_update + owner_delete + admin_insert).
-- ----------------------------------------------------------------------------
-- Post-apply checklist:
--  * get_advisors(security) = 0 ERROR / 0 new findings vs mig-159 baseline.
--  * Rolled-back smokes:
--    (a) authenticated INSERT into wear.posts with brand_id NULL  → RLS denial;
--    (b) INSERT as author owning an UNVERIFIED brand              → RLS denial;
--    (c) INSERT as author owning a VERIFIED brand they own        → OK;
--    (d) authenticated (non-admin) INSERT into wear.brands        → RLS denial;
--    (e) admin INSERT into wear.brands (any owner_user_id)        → OK;
--    (f) owner UPDATE own brand tagline/logo                      → OK (verified
--        column still guarded by mig-157 trg_protect_brands_verified).
--  * Structural QA: wear.posts policies = public_read + author_write (2);
--    wear.brands policies = public_read + owner_update + owner_delete +
--    admin_insert (4). No grant changes.
--  * Update SHARED_DB_CONTRACT §9 (head 160; policy count 46→48) + RESUME_HERE.
-- ============================================================================
