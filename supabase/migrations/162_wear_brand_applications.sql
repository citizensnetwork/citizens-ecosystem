-- ============================================================================
-- 162_wear_brand_applications.sql — the Become-a-Brand application
-- (§3V-3 / §3W deferred №1; docs/Citizens_Wear_Roles_and_Concepts_MD.md §6.1,
-- RATIFIED 2026-07-15; grill decisions RATIFIED 2026-07-16)
-- ============================================================================
-- Brand genesis is ASSIGNED, never self-created (§6.1): an admin mints every
-- `wear.brands` row — directly (launch/partner bootstrap) or by approving a
-- citizen's Become-a-Brand application. This migration adds the application:
--
--   * brand_applications — one row per ATTEMPT (immutable once submitted —
--     ratified: no edits, no withdraw). A rejection permits an IMMEDIATE
--     re-apply as a NEW row (ratified; verification-lifecycle precedent), so
--     the admin queue keeps the full decision history per applicant. At most
--     ONE open application per user (partial unique index on 'pending').
--
--   * brand_eligibility(p_user) — the §6.1 gate, DERIVED (never stored):
--       concepts posted ≥ 20  AND  own concepts claimed ≥ 10  AND
--       zero admin-ACTIONED reports against the user (subject_kind 'user';
--       mere accusations never block — a moderator must have actioned one).
--     SECURITY DEFINER because wear.reports is reporter/moderator-scoped
--     under RLS — an applicant could not otherwise count reports against
--     themselves. Guarded: self or moderator only. Support email + contact
--     number are REQUIRED FORM FIELDS (they exist nowhere before the form,
--     so they cannot "unlock" anything). Claimed uses the cached concept
--     stage (> 'proposed'): forward-only lifecycle, and a revoked claim
--     re-opens the concept — correctly dropping it back out of the count.
--
--   * ENFORCEMENT (ratified: RLS-hard): UI locks the Settings entry, the API
--     403s, and the INSERT `WITH CHECK` calls brand_eligibility() — a crafted
--     PostgREST call cannot file an ineligible application. The release valve
--     for below-threshold invites is the existing admin direct mint
--     (`POST /api/brands` + `brands_admin_insert`, mig 160) — deliberate,
--     admin-authored, and NOT this table's concern.
--
--   * APPROVE = MINT: the admin route creates the brand via the mig-160
--     admin INSERT path with `verified = true` — the mig-157
--     `protect_verified_column` guard explicitly admits `wear.is_admin()`
--     (its comment anticipated exactly this "admin UPDATE path"). No
--     brand_verifications row is involved (that table has no admin INSERT
--     policy; its lifecycle remains the path for brands whose verification
--     is later revoked/re-requested). The decision UPDATE is column-scoped
--     (grant list) so even an admin can never rewrite what the applicant
--     attested — only decide on it.
--
--   * NOTIFICATIONS: +2 wear.notification_type values; an AFTER UPDATE
--     trigger notifies the applicant on the decision (mig-159 invariant:
--     notification rows are trigger-produced ONLY; wear.notify is
--     best-effort and swallows its own errors). actor_id stays NULL — the
--     decision is institutional ("Citizens Wear"), not a personal act of
--     the reviewing admin. (Enum literals appear only inside plpgsql
--     bodies, so ALTER TYPE ADD VALUE is transaction-safe here — mig-161
--     note.)
--
-- Conventions: mig-143/157 style (RLS every table, hardened empty
-- search_path, schema-qualified bodies); mig-146 lesson (explicit
-- least-privilege grants); every new FK indexed (advisor "0 new" gate).
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
create type wear.brand_application_status as enum ('pending', 'approved', 'rejected');

alter type wear.notification_type add value 'brand_application_approved';
alter type wear.notification_type add value 'brand_application_rejected';

-- ── 2. The application table ────────────────────────────────────────────────
create table wear.brand_applications (
  id               uuid primary key default gen_random_uuid(),
  applicant_id     uuid not null references wear.users(id) on delete cascade,
  status           wear.brand_application_status not null default 'pending',
  -- §6.1 form fields (immutable once submitted — no owner UPDATE path exists).
  brand_name       text not null check (length(btrim(brand_name)) between 2 and 80),
  bio              text check (bio is null or length(bio) <= 500),
  -- {instagram, tiktok, x, website, …} — flat string map, UI-defined keys.
  socials          jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(socials) = 'object' and length(socials::text) <= 2000),
  support_email    text not null
                   check (support_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                          and length(support_email) <= 254),
  contact_number   text not null check (length(btrim(contact_number)) between 7 and 32),
  delivery_options text not null check (length(btrim(delivery_options)) between 3 and 500),
  -- Attestations (Ts&Cs, Citizens Code of Conduct, monthly platform fees):
  -- an application without full agreement is invalid data, period.
  agree_terms      boolean not null,
  agree_conduct    boolean not null,
  agree_fees       boolean not null,
  constraint brand_applications_agreements check (agree_terms and agree_conduct and agree_fees),
  -- Decision (admin-stamped; the column-scoped UPDATE grant below is the
  -- only writable surface after submit).
  reviewed_by      uuid references wear.users(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text check (review_note is null or length(review_note) <= 2000),
  minted_brand_id  uuid references wear.brands(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Lifecycle invariants: pending ⇔ undecided; only an approval carries a mint.
  constraint brand_applications_decided check ((status = 'pending') = (reviewed_at is null)),
  constraint brand_applications_mint    check (status = 'approved' or minted_brand_id is null)
);

-- One OPEN application per user (re-apply after rejection = a NEW row).
create unique index brand_applications_one_pending
  on wear.brand_applications(applicant_id) where status = 'pending';
-- The admin queue (status filter, oldest first) + own-history reads.
create index brand_applications_status_idx
  on wear.brand_applications(status, created_at);
create index brand_applications_applicant_idx
  on wear.brand_applications(applicant_id, created_at desc);
-- Remaining FKs (advisor gate): decision stamps are sparse — partial indexes.
create index brand_applications_reviewed_by_idx
  on wear.brand_applications(reviewed_by) where reviewed_by is not null;
create index brand_applications_minted_brand_idx
  on wear.brand_applications(minted_brand_id) where minted_brand_id is not null;

alter table wear.brand_applications enable row level security;

create trigger trg_brand_applications_updated_at before update on wear.brand_applications
  for each row execute function wear.set_updated_at();

-- ── 3. The eligibility derivation (§6.1, SECDEF — see header) ───────────────
-- Thresholds are deliberately literals HERE (one migration to tune) and are
-- mirrored by BRAND_ELIGIBILITY_* in packages/db/src/contract.ts (lockstep).
create or replace function wear.brand_eligibility(p_user uuid)
returns table (
  concepts_posted  integer,
  concepts_claimed integer,
  actioned_reports integer,
  eligible         boolean
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_posted  integer;
  v_claimed integer;
  v_reports integer;
begin
  -- Self-or-moderator read guard (the admin queue shows applicant numbers).
  -- Anonymous callers: auth.uid() is null → 'is distinct from' any p_user →
  -- forbidden (and anon holds no EXECUTE grant anyway).
  if auth.uid() is distinct from p_user and not wear.is_moderator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select count(*)::int into v_posted
    from wear.concepts c where c.creator_id = p_user;
  select count(*)::int into v_claimed
    from wear.concepts c
   where c.creator_id = p_user and c.status > 'proposed'::wear.concept_stage;
  select count(*)::int into v_reports
    from wear.reports r
   where r.subject_kind = 'user'::wear.report_subject_kind
     and r.subject_id = p_user
     and r.status = 'actioned'::wear.report_status;
  return query select v_posted, v_claimed, v_reports,
    (v_posted >= 20 and v_claimed >= 10 and v_reports = 0);
end $$;
revoke all on function wear.brand_eligibility(uuid) from public, anon;
grant execute on function wear.brand_eligibility(uuid) to authenticated, service_role;

-- ── 4. RLS policies ─────────────────────────────────────────────────────────
-- Applications are PRIVATE: the applicant and the moderation bench only.
create policy brand_applications_read on wear.brand_applications for select using (
  applicant_id = auth.uid() or wear.is_moderator()
);

-- Submit: own row, born pending, fully agreed, and ELIGIBLE (the RLS
-- backstop — ratified hard). The one-pending unique index is the re-apply
-- throttle. service_role (seed) bypasses RLS by design.
create policy brand_applications_self_submit on wear.brand_applications for insert
  with check (
    applicant_id = auth.uid()
    and status = 'pending'
    and agree_terms and agree_conduct and agree_fees
    and (select e.eligible from wear.brand_eligibility(auth.uid()) e)
  );

-- Decide: ADMIN-only, only while 'pending' (decided rows are immutable for
-- EVERYONE — a wrong rejection is answered by the free immediate re-apply,
-- a wrong approval by the verification-revoke lever), must land decided,
-- and the decision is stamped with the deciding admin.
create policy brand_applications_admin_review on wear.brand_applications for update
  using (wear.is_admin() and status = 'pending')
  with check (
    wear.is_admin()
    and status in ('approved', 'rejected')
    and reviewed_by = auth.uid()
  );

-- No DELETE policy: submitted applications are records; account deletion
-- cascades via the applicant FK (FK actions are not subject to RLS).

-- ── 5. Decision notification (mig-159 pattern; institutional voice) ─────────
create or replace function wear.notify_on_brand_application_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_slug text;
begin
  if old.status = 'pending'::wear.brand_application_status
     and new.status in ('approved'::wear.brand_application_status,
                        'rejected'::wear.brand_application_status) then
    -- The newborn brand's slug lets the inbox deep-link straight to it.
    if new.minted_brand_id is not null then
      select b.slug into v_slug from wear.brands b where b.id = new.minted_brand_id;
    end if;
    perform wear.notify(
      new.applicant_id,
      (case when new.status = 'approved'::wear.brand_application_status
            then 'brand_application_approved'
            else 'brand_application_rejected' end)::wear.notification_type,
      null,                 -- institutional: the decision is Citizens Wear's
      null,
      new.minted_brand_id,  -- approve → deep-link to the newborn brand
      jsonb_build_object('brandName', new.brand_name, 'reviewNote', new.review_note,
                         'brandSlug', v_slug)
    );
  end if;
  return new;
end $$;
revoke all on function wear.notify_on_brand_application_decision() from public;
create trigger trg_notify_on_brand_application_decision
  after update on wear.brand_applications
  for each row execute function wear.notify_on_brand_application_decision();

-- ── 6. Grants (explicit + least-privilege; RLS gates every row) ─────────────
-- No anon access at all: applications are a signed-in surface.
grant select, insert on wear.brand_applications to authenticated;
-- COLUMN-SCOPED update: the decision stamp is the ONLY writable surface after
-- submit — even an admin can never rewrite what the applicant attested.
grant update (status, reviewed_by, reviewed_at, review_note, minted_brand_id)
  on wear.brand_applications to authenticated;
grant all on wear.brand_applications to service_role;

-- ============================================================================
-- Post-apply record (APPLIED 2026-07-16, tag wear-pre-mig162 @b0a84a9):
--  * get_advisors(security) = 0 ERROR / 102 WARN / 3 INFO. The single new WARN
--    vs the head-161 baseline is the INTENTIONAL brand_eligibility SECDEF
--    EXECUTE grant to authenticated (mig-157 precedent: 9 such documented
--    WARNs): the fn is the eligibility read API AND the INSERT WITH CHECK
--    requires callers to hold EXECUTE; it self-guards (self-or-moderator) and
--    exposes nothing but the caller's own three counts. All other findings
--    baseline-identical.
--  * Rolled-back prod smokes 6/6 PASS:
--    (a) INSERT as an ineligible authenticated user            → 42501 (RLS);
--    (b) brand_eligibility(other-user) as non-moderator        → 42501;
--    (c) brand_eligibility(self)                → live counts, eligible=false;
--    (d) UPDATE a decided row as admin                         → 0 rows (USING);
--    (e) UPDATE brand_name as authenticated admin              → 42501 (column grant);
--    (f) service INSERT + admin decide → trigger notification row with
--        institutional null actor + brandSlug payload key      → OK (rolled back).
--  * Structural QA (verified live): wear tables 37→38; policies 83→86 (read,
--    submit, review); fns 32→34 (brand_eligibility,
--    notify_on_brand_application_decision); enums 22→23 (+2 notification_type
--    values → 12); +5 indexes (1 partial-unique = the one-pending rule).
--  * SHARED_DB_CONTRACT §9 stamped (head 162, next # = 163); roles MD §6.4
--    marked shipped; RESUME_HERE §3X.
--  * Seed §13 applied: one pending demo application (Mustard Seed Supply /
--    thabo_m) for the founder's Admin queue — service_role bypasses the
--    eligibility backstop by design; its fixed id is the idempotency guard.
-- ============================================================================
