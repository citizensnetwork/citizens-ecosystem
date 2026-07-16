# Citizens Ecosystem — Shared-DB Contract (LOCKED)

> **Status: LOCKED & CURRENT.** Created 2026-06-17. This is the normative agreement every
> Citizens app, migration, and API route MUST obey. It is the keystone that **Citizens Vision**
> and **Citizens Wear** depend on.
>
> **Authority:** This contract *implements* the decisions in
> [`docs/strategy/ECOSYSTEM_DECISION_BRIEF.md`](./strategy/ECOSYSTEM_DECISION_BRIEF.md) (D1, §3)
> and [`docs/PHASE_4_5_ADDENDUM.md`](./PHASE_4_5_ADDENDUM.md) §A3. Where this doc and the
> *prose* of older docs disagree, the decision brief wins on **intent** and this doc wins on the
> **operational rule**. The API surface is documented in [`docs/api-v1.md`](./api-v1.md) — that
> file is the wire-level companion to Rule 2 below.
>
> **Verified against live** Supabase project `xyiajtrvhlxaeplsiajj` (`Citizens-Connect`,
> eu-central, migration head **134**) on 2026-06-17. See §9 for the verification snapshot.

---

## 0. The model in one sentence

**One Supabase project, one `auth.users`, per-app Postgres schemas, and sibling apps talk to
each other through the versioned `/api/v1/*` API — never each other's raw tables — except for
user-scoped/realtime needs, which share the DB directly under RLS.**

This is *not* multi-region or multi-project. "Global databases" (founder's term) means **one
shared data plane** consumed by every Citizens channel, with schema boundaries keeping a future
split cheap. (See memory `global-databases-means-ecosystem-shared`.)

---

## 1. Schema boundaries (the map)

| Schema | Owner | Contains | Who may write |
|---|---|---|---|
| `public` | **Connect (commons)** | The shared Kingdom data every app surfaces: `profiles`, `contributors` (approved profiles), `events`, `places`, `categories`, social graph, plus Connect's own app tables. | Connect (via RLS + service_role). Other apps **read via `/api/v1`**, never write here. |
| `vision` | **Vision (back-office)** | **Two classes** (mig 133–134, 137–139): (a) **Connect-published aggregates** — `category_space_map`, `vision_period_snapshots`, views `reach_per_event`, `engagement_per_event`, `ratings_per_event`, `ratings_per_place`; (b) **Vision's own operational schema** — 24 tables (orgs, departments, activities, goals, projects, advisories, boundaries, partnerships, claims, …) + 5 MVs + ~28 fns. | (a) **`service_role` only** (Connect→Vision publishing; invisible to anon/auth). (b) **`authenticated` + RLS** (Vision org admins/members under per-org RLS) + `service_role` for backend jobs. **MVs are `service_role`-only** (they bypass RLS; users read via SECURITY DEFINER reader fns). Schema is **not** PostgREST-exposed until the Vision app repoint. |
| `wear` *(APPLIED — mig 143, 2026-07-01)* | **Wear** | Wear-owned social/commerce tables (display-safe users-mirror, profiles, brands, follows, posts, stories, DMs, moderation) — **22 tables, all RLS-enabled**. Applied as [`supabase/migrations/143_wear_schema.sql`](../supabase/migrations/143_wear_schema.sql) per Step 3 Direction A ([`strategy/STEP3_WEAR_INTEGRATION_SCOPE.md`](strategy/STEP3_WEAR_INTEGRATION_SCOPE.md)). The `wear.users` mirror is **display-safe only (no email/PII)** since it is public-SELECT. Optional Connect link = `brands.connect_contributor_id` (value-ref to `public.profiles.id`, **no cross-schema FK**, ownership-verified — mirrors `vision.organisations.connect_contributor_id`). Reads via `supabase-js` `db:{schema:'wear'}` under RLS, not Prisma. **PostgREST-exposed** (`wear` added to Exposed schemas, 2026-07-01). | `authenticated` + Wear RLS (per-user), `service_role` for backend; by analogy to `vision`. |

**Rules:**
- **R1.1** A new ecosystem app gets a **new Postgres schema**, not a new Supabase project, until
  its load justifies physical isolation (revisit before ~6 apps with real traffic — brief §3).
- **R1.2** An app **MUST NOT** read or write another app's schema directly. The commons
  (`public`) is read by siblings **only through `/api/v1`** (Rule 2). The one exception is
  user-scoped/realtime data under RLS (Rule 3).
- **R1.3** Schema-per-app is what makes a later *split* cheap: lifting `vision.*` or `wear.*` to
  its own project is a schema move, not a table-by-table untangle. Preserve this property.

---

## 2. The cross-app contract is `/api/v1/*`, not the tables

Sibling apps (Vision, Wear, Impact, Equip, Play, Citizens Central) consume Connect's commons
through the **versioned, rate-limited, API-key-capable** HTTP API — never PostgREST against
`public.*`.

- **R2.1** `/api/v1/*` is the **stable contract**. Connect's `public` schema may evolve freely as
  long as the v1 responses keep their guarantees. Schema changes are **not** a contract break;
  v1 response changes are.
- **R2.2** **Additive** changes (new fields, new endpoints) are non-breaking; consumers MUST
  tolerate unknown fields. **Removals/type changes** bump the prefix to `/api/v2`. (Mirrors the
  stability policy in `docs/api-v1.md`.)
- **R2.3** Every new ecosystem-facing read of commons data is added to `/api/v1` **and documented
  in `docs/api-v1.md` in the same change**. An undocumented endpoint is not part of the contract.
- **R2.4** Auth tiers: anonymous (IP rate-limited) or API key (`cck_live_…`, minted via
  `create_api_key`, scoped, revocable). The gate is `v1Gate` / `api_keys`.

Current v1 surface (see `docs/api-v1.md` for full shapes): `contributors`,
`contributors/{slug}`, `contributors/{slug}/stats`, `events`, `events/{id}`, `categories`,
`places`, `analytics/community`.

---

## 3. RLS is the only isolation wall

With **separate** databases, isolation was physical. In **one shared** project, a single RLS
mistake = cross-app/cross-tenant exposure. Therefore:

- **R3.1** Every table with PII or user writes **MUST** have RLS enabled with tight, tested
  policies. Public reads of the **commons** (events/places/contributors directory data) may be
  open; everything user-scoped is per-`auth.uid()`.
- **R3.2** Sensitive/aggregate tables that no end-user should read are **`service_role`-only** —
  RLS on, no anon/authenticated policy (the pattern already used for
  `vision.vision_period_snapshots`). The owning app's backend uses `service_role` (BYPASSRLS).
- **R3.3** `SECURITY DEFINER` functions follow the project standard: hardened
  `search_path = pg_catalog, public`, `EXECUTE` revoked from `public`, granted only to the roles
  that need it (see migrations 051, 076). Never grant a definer write-function to `anon`.
- **R3.4** A user-scoped or realtime feature **MAY** read the shared DB directly under RLS
  (same `auth.users`, RLS enforces per-user access regardless of which app calls) — this is the
  sanctioned exception to Rule 2 for that data class (addendum §A1/§A3).

---

## 4. `app_id` / source attribution (rule locked now; column lands on first sibling write)

When more than one app **writes** analytics into the shared plane, every analytics row must carry
which app produced it, so metrics don't silently blend.

- **R4.1** **Rule (locked now):** any analytics/event-tracking table that may be written by more
  than one app **MUST** carry an `app_id` (or equivalent `source`) attribution column.
- **R4.2** **Column timing (deferred, per brief §3):** the column is **not** added today. Connect
  is currently the **only** writer (Vision reads; Wear has no prod data). Adding a column that is
  always `'connect'` is premature. **The first sibling app to write analytics adds `app_id`**
  (default/backfill `'connect'`, nullable-safe so existing writers are untouched) in the same
  change that introduces its writes.
- **R4.3** Tables in scope when that day comes: `analytics_daily`, `contributor_analytics`,
  `contributor_analytics_snapshots`, `event_impressions`, `event_views`, `search_term_stats`,
  and any new shared analytics table. New shared-analytics tables created **after** that point
  are born with `app_id` from migration 1.
- **R4.4** Vision MUST read its own `vision.*` aggregates/snapshots, **not** run analytical
  queries against Connect's live OLTP tables (brief §3). Consider a read replica before scale.

---

## 5. Cross-app bridges — Unified Profile + Content Labels

These are the two sanctioned mechanisms for an app to "see into" the ecosystem without coupling
to another app's tables. **Both already exist** (Batch 6, migrations 072–077).

### 5.1 Unified Profile columns (`public.profiles`)
Forward-looking, **nullable**, populated only when the user engages that app. No app is required
to fill another app's columns.

| Column | App | Note |
|---|---|---|
| `wear_style_preferences jsonb` | Wear | free-form style bag |
| `wear_wardrobe_visibility text` | Wear | `public`\|`private`\|`friends`, default `private` |
| `learn_enrolled_listings uuid[]` | Learn | enrolled listing ids (no FK; cross-schema) |
| `connect_home_province text` | Connect | user-declared home province |
| `notification_radius_km integer` | Connect | (pre-existing) the canonical radius |
| `timezone text` | Vision | org timezone for snapshot jobs (mig 133) |

**R5.1** New per-app profile fields follow this pattern: nullable, app-prefixed, documented here.
A migration MUST NOT make another app's profile column `NOT NULL` or required for Connect users.

### 5.2 Content labels (`public.content_labels`)
Cross-app tagging substrate. Connect itself does not read these; siblings consume them.

- `(entity_type ∈ event|place|profile, entity_id, label)`, unique per triple, RLS public-read /
  admin+trigger-write.
- Auto-label trigger `trg_apply_event_content_labels` maps event categories → labels
  (`markets-expos`→`market` for Wear; `education-equipping`/`education`/`equip`→`education` for
  Learn). Lifecycle cleanup via `trg_cleanup_content_labels_event`.
- **R5.2** New auto-label rules are added to the trigger (or a sibling Edge Function) and listed
  here + in `MASTER_DIRECTION.md` Part 7. Apparel/NLP labels remain **deferred** (no clean signal).

---

## 6. One identity

- **R6.1** One `auth.users` across the ecosystem (one Supabase project). A Citizen is the same
  identity in Connect, Vision (if ever surfaced to them), Wear, etc.
- **R6.2** Vision is **back-office only** (contributors + organisations, e.g. Wear's clothing
  brands) — **not** citizens (brief D2). Per-eco-app Vision UIs are deferred.
- **R6.3** *(added 2026-07-02, Step 4b)* **Capability tiers on that one identity are governed by
  [`ECOSYSTEM_PROFILE_LEVELS.md`](./ECOSYSTEM_PROFILE_LEVELS.md)** (Citizen → per-app creating
  tier → per-app Admin). Its P-rules are part of this contract; the two files change together
  (§10). Non-negotiables restated: levels are granted **per app** and **never inherited across
  apps** (P1.2); admin is per-app with **no ecosystem super-role** (P2.1); self-escalation must
  be blocked **at the DB layer** (P2.2).
- **R6.4** *(added 2026-07-02)* Per-app identity **mirrors** of `auth.users` (e.g. `wear.users`)
  MUST be display-safe when public-SELECT — no email/PII (P0.3; the mig-143 no-email precedent).

---

## 7. Migration discipline

- **R7.1** All schema changes ship as numbered SQL migrations in `supabase/migrations/` and are
  applied to the **single shared** project. Cross-app tables live in the owning app's schema.
- **R7.2** A migration that touches the **commons** (`public.*`) must consider every consuming
  app: it may not break a `/api/v1` guarantee (Rule 2) and must keep RLS intact (Rule 3).
- **R7.3** Run `get_advisors` (security) after any DDL. Target: **0 ERROR**. New `SECURITY DEFINER`
  functions are expected WARNs only when grants are correctly tightened (R3.3).

---

## 8. Exit ramp (why the boundaries are worth the discipline)

One project = one outage domain + one quota ceiling. That is acceptable at 3 apps pre-scale.
The schema boundaries above are precisely what keep the **exit cheap**: when one app outgrows the
shared project, lifting its `<app>.*` schema (and the `/api/v1` it already consumes) to a
dedicated project is a contained move, not a re-architecture. **Do not** introduce cross-schema
FKs or direct cross-app table reads that would weld the schemas together (Rules R1.2, R4.4).

---

## 9. Verification snapshot (updated 2026-07-16, project `xyiajtrvhlxaeplsiajj`, head = **mig 162**)

> **2026-07-16: mig 162 (`wear` Become-a-Brand applications) APPLIED** (pre-apply tag
> `wear-pre-mig162` @b0a84a9). **Advisor: 0 ERROR / 102 WARN / 3 INFO — the single new WARN
> is the INTENTIONAL `wear.brand_eligibility` SECDEF EXECUTE grant to `authenticated` (the
> mig-157 pattern, which added 9 such documented WARNs): the fn IS the eligibility read API
> and the INSERT `WITH CHECK` requires the caller to hold EXECUTE; it self-guards to
> self-or-moderator and reads nothing but counts. Every other finding is baseline-identical.**
> Rolled-back prod smokes 6/6 PASS (ineligible INSERT 42501; eligibility(other) 42501;
> eligibility(self) live counts; decided-row UPDATE 0 rows; column-grant brand_name rewrite
> 42501; decision UPDATE + trigger notification w/ institutional null actor + brandSlug).
> Adds
> `wear.brand_applications` (immutable once submitted — no owner UPDATE/DELETE; **one open
> application per user** via a partial unique index; re-apply after rejection = a NEW row;
> decided rows immutable for everyone — the admin UPDATE policy's USING requires
> `status='pending'`; **column-scoped UPDATE grant** = only the decision stamp is ever
> writable), the **SECDEF `wear.brand_eligibility(p_user)`** derivation (self-or-moderator
> guard; posted ≥20 / own-concepts-claimed ≥10 / zero ACTIONED user-reports — also called
> inside the INSERT `WITH CHECK`, so eligibility is RLS-hard), **+2 `wear.notification_type`
> values** (`brand_application_approved` / `_rejected`) and the decision-notify trigger
> (institutional: actor null; payload carries the minted brand's slug for the inbox deep
> link). **Approve = mint**: the admin route reuses the mig-160 `brands_admin_insert` path
> with `verified=true` (the mig-157 column guard admits admins). Grill decisions ratified
> 2026-07-16 (locked-once-submitted · immediate re-apply · 20/10/0 RLS-hard · admin direct
> mint stays the below-threshold valve). wear tables 37→**38**, policies 83→**86**,
> fns 32→**34**, enums 22→**23**. Design: roles MD §6.1 + RESUME §3X.
> **Next migration # = 163.**
>
> **2026-07-16: mig 161 (`wear` concept engagement — the community Concepts surface) APPLIED**
> (pre-apply tag `wear-pre-mig161` @de042fa). **Advisor: 0 ERROR / 101 WARN / 3 INFO — signature
> byte-identical to the head-160 baseline (sha 658f66c4), 0 new findings.** Adds 4 tables
> (`wear.concept_comments` — the wear.comments mirror incl. moderator takedown;
> `wear.concept_shares` — distinct-sharer pk (concept,user), INSERT-only social proof;
> `wear.concept_statuses` — the concept-stories bar, **no client write path at all** (rows enter
> only via the SECDEF promotion trigger: Creator badge >10 concepts, else first-100
> bootstrap-grace, self-terminating partial-index counter); `wear.concept_status_views` —
> story_views mirror), 2 enums, **+3 `wear.notification_type` values** (`concept_comment` /
> `concept_upvote` / `concept_share`) and 4 trigger fns (`promote_concept_status` + 3 notify
> triggers — all `revoke … from public`, run-as-owner, so 0 new SECDEF-EXECUTE WARNs). Every new
> FK is indexed. wear policies 75→**83**, tables 33→**37**, fns 28→**32**, enums 20→**22**.
> Rolled-back prod smokes 10/10 PASS (spoofed comment-author denied; duplicate share 23505;
> client status-INSERT denied; grace promotion fires; status-view privacy holds; comment/upvote/
> share each notify the creator). Design ratified in
> [`Citizens_Wear_Roles_and_Concepts_MD §6`](../../../docs/Citizens_Wear_Roles_and_Concepts_MD.md)
> §6.1/§6.2 + RESUME §3W. **Next migration # = 162.**
>
> **2026-07-15: mig 160 (`wear` content-permission model) APPLIED** (pre-apply tag
> `wear-pre-mig160`). **Advisor: 0 ERROR / 101 WARN / 3 INFO — 0 new findings vs head-159.**
> Tighten-only; no functions/tables/grants added. `wear.posts` insert now requires an owned
> **verified** brand + mandatory `brand_id` (base-Citizen self-posts retired — the Home feed is
> brand apparel by construction); `wear.brands` insert is **admin-only** (self-serve creation
> removed at the RLS layer, not just the UI). Owner UPDATE/DELETE preserved; mig-157 verified-column
> guard intact. Net **+2 policies** (the mig-143 `brands_owner_write` FOR-ALL policy split into
> `brands_owner_update` + `brands_owner_delete` + `brands_admin_insert`). Rolled-back prod smokes all
> PASS: verified-brand post OK; null-brand / unverified-brand / non-admin-brand-insert all `42501`;
> admin brand-mint OK; owner tagline update OK; owner self-verify `42501` (guard). Ratified in
> [`ECOSYSTEM_PROFILE_LEVELS §3.2`](./ECOSYSTEM_PROFILE_LEVELS.md) +
> [`Citizens_Wear_Roles_and_Concepts_MD §6`](../../../docs/Citizens_Wear_Roles_and_Concepts_MD.md).
> **Next migration # = 161.**
>
> **2026-07-15: migs 158 + 159 (`wear` media pipeline + notifications) APPLIED**
> (pre-apply tag `connect-pre-mig158`). **Advisor: 0 ERROR / 101 WARN / 3 INFO — byte-for-byte
> the head-157 baseline, 0 new findings.** Neither adds a SECDEF EXECUTE grant: mig-158 is a
> Storage bucket + 3 owner-folder `storage.objects` policies (no functions); mig-159's `wear.notify`
> + 6 lifecycle trigger functions are all `revoke all … from public` (trigger-only, run as owner —
> not granted to `authenticated`/`anon`), so they add 0 `*_security_definer_function_executable`
> WARNs. **`wear.notifications`** is RLS-enabled with 3 recipient-scoped policies (no INSERT policy —
> rows enter only via the SECDEF triggers). Prod smokes PASS: all 4 notification triggers fire with
> correct recipient/actor/payload (concept→propose→award→advance→royalty-proof) with zero residue;
> the `wear-media` storage wall enforces at runtime (own-folder write permitted, foreign-folder
> denied by RLS) with zero residue. **Next migration # = 160.**
>
> **2026-07-14: mig 157 (`wear` Concepts marketplace) APPLIED** (`20260714… /
> 157_wear_concepts_marketplace`; pre-apply tag `connect-pre-mig157`). **Advisor baseline at
> head 157: 0 ERROR / 101 WARN / 3 INFO.** WARN 92→101 = exactly the **9 intentional SECDEF
> EXECUTE grants mig 157 itself makes** (8× `authenticated` on the new marketplace RPCs + 1×
> `anon` on `get_concept_proposal_tags`, the deliberately public tag reader) — the same
> retained-by-design category as Connect's kept fns and Vision's +20. Zero unexpected findings.
> **Correction:** the linter DOES now surface `wear.*` SECDEF fns (the 92 baseline already
> contained 6 pre-existing ones from migs 143–145) — the older "not surfaced" note below is
> obsolete. Rolled-back prod smokes all PASS (verified-column guard 42501; unverified-brand
> proposal denied; full happy path concept→propose→award→advance→released-auto-post→conversion;
> non-creator award 42501; backwards/repeat stage rejected; direct status-log insert denied).
>
> **2026-07-13 lineage reconciliation:** `list_migrations` shows migrations **147–156 (Vision
> DDL)** were applied 2026-07-03/04 from the **standalone `citizens-connect` checkout** while the
> monorepo ran parallel Wear sessions; the ten files were reconciled into this monorepo lineage
> (EOL-only diffs) on 2026-07-13. (WARN 72→92 = +20 `authenticated_security_definer` from
> Vision's intentional SECDEF pattern; `auth_leaked_password_protection` = the known HIBP
> Pro-gate, RESUME §3P). The `vision.*` counts below predate migs 147–156 — re-count when
> convenient.

Confirmed live:
- **Schemas:** `public`, `vision`, **`wear`** present.
- **`wear.*` (migs 143–146 + 157 + 159 + 160):** **75 RLS policies** (live-counted post-160:
  `wear.posts`=3, `wear.brands`=4 after the mig-160 split; **0 tables without RLS**). Table/function/
  enum/trigger counts below are **post-157** (**32 base tables**, **21 functions**, **19 enums**,
  **18 triggers**) — migs 158–160 add the `wear-media` bucket, the `wear.notifications` table + its
  lifecycle triggers, and the brands-policy split; recount when convenient. **Mig-160
  content-permission model:** `wear.posts` insert requires an owned **verified** brand (brand_id
  mandatory); `wear.brands` insert is `wear.is_admin()`-only (self-serve retired), owner keeps
  UPDATE/DELETE. **Mig-157 Concepts marketplace tier:** 9 tables (`concepts`, `concept_media`,
  `concept_upvotes`, `concept_proposals` — party-scoped details, `concept_claims` — one ACTIVE
  claim per concept via partial unique index, `concept_status_log` — append-only by construction
  (no write policy AND no write grant), `royalty_obligations`, `catalogue_conversions`,
  `brand_verifications`), 7 enums (`concept_stage` in lifecycle order → forward-only = native
  enum `<`), 8 SECDEF RPCs (`award_concept_claim`, `advance_concept_status`,
  `propose/respond/cancel_catalogue_conversion`, `submit_royalty_proof`,
  `close_royalty_obligation` — EXECUTE `authenticated`+`service_role`;
  `get_concept_proposal_tags` — the ONLY anon-executable one, returns (brand_id, created_at)
  only), 4 SECDEF/guard trigger fns (verified-column guard, brand-verified sync,
  auto-Completed-Concepts post on `released`, concept re-open on claim revoke),
  `posts.concept_id` (relational attribution), explicit least-priv grants (146 lesson). Also
  closed 3 pre-existing holes: `brands.verified`/`profiles.verified` now admin-managed
  (column-guard trigger); `posts`/`stories` `brand_id` writes now ownership-checked.
  Pre-157 detail: `set_updated_at`; the two READ-path SECURITY DEFINER helpers
  `is_conversation_member` + `is_blocked_either`; the four **mig-144 write-path** helpers
  (`create_direct_conversation`, `create_group_conversation` — SECDEF RPCs, EXECUTE
  `authenticated`+`service_role` only, internal `auth.uid()` actor-guard; `bump_conversation_updated_at`,
  `unfollow_on_block` — SECDEF trigger fns, `postgres`-only, fired by `trg_bump_conversation_updated_at`
  on `messages` insert and `trg_unfollow_on_block` on `blocks` insert); and the two **mig-145 capability
  helpers** `is_moderator()`/`is_admin()` (SECDEF, EXECUTE `authenticated`+`service_role`) — all
  `search_path=''`. **12 enums** (mig 145 adds `platform_role`, `report_status`).
  **Mig-145 admin/moderation tier** (R6.3 assigned-authority): `wear.user_roles` (service_role-managed;
  self-SELECT only; **no write policy AND no write grant for `authenticated` — mig 146 grants are
  deliberately narrower than 143's blanket pattern**: `authenticated` SELECT-only, `anon` nothing),
  `reports` triage lifecycle (`status/handled_by/handled_at`), moderator SELECT/UPDATE on `reports`,
  moderator DELETE on `posts`/`comments`/`stories` — **DMs excluded** (privacy). Smoke-verified
  2026-07-02 (rolled-back transactions against prod): plain user sees 0 reports/0 roles + role
  self-insert denied; moderator sees the queue, triages, `is_admin()` stays false. `wear.users` mirror
  carries **no email column** (display-safe, public-SELECT). **Security advisors: 0 ERROR** and **0 new
  findings** vs the mig-142 baseline (72 WARN / 3 INFO unchanged; all pre-existing `public.*`;
  the "linter does not surface `wear.*` SECDEF fns" observation made then is now OBSOLETE — see
  the 2026-07-14 correction in the blockquote above).
  **PostgREST-exposed** (`wear` added to Exposed schemas, 2026-07-01). Mig 144 rationale: 143's RLS
  cannot express DM/group creation (inserting the *other* member's row), the `conversations.updated_at`
  bump, or block→symmetric-unfollow — the `SupabaseWearStore` port delegates those to these helpers,
  mirroring Connect's `find_or_create_conversation` SECDEF precedent.
- **Unified Profile cols:** `wear_style_preferences`, `wear_wardrobe_visibility`,
  `learn_enrolled_listings`, `connect_home_province`, `notification_radius_km`, `timezone` — all present.
- **content_labels:** table present; triggers `trg_apply_event_content_labels` +
  `trg_cleanup_content_labels_event` present; RLS on.
- **vision.\* (post-consolidation, mig 137–139):** **26 base tables** (all RLS-enabled, 0 without),
  **5 materialized views** (`service_role`-only), **6 views** (`reach_/engagement_/ratings_per_event`,
  `ratings_per_place` + the snapshot helpers), **96 RLS policies**, **28 functions**, **20 triggers**.
  No `cc_*_mirror`/sync tables (obsoleted). Founder bootstrapped as `vision` platform_admin; 2 `vision_*`
  cron refresh jobs registered. **Security advisors: 0 ERROR** (all SECURITY-DEFINER WARNs are pre-existing
  `public.*` Connect functions; the `vision` port added zero new findings).
- **`app_id` attribution:** **not yet present** on any analytics table — correct per R4.2
  (no sibling writes analytics yet).
- **`/api/v1` routes on disk:** contributors, contributors/[slug], contributors/[slug]/stats,
  events, events/[id], categories, places, analytics/community.

---

## 10. How to change this contract

This file is **LOCKED**: changes are deliberate, not incidental.
1. Propose the change against the decision brief's intent (D1–D5).
2. Update the relevant Rule **and** the affected doc (`api-v1.md` for wire changes,
   `MASTER_DIRECTION.md` Part 7 for profile/label changes) in the **same** commit.
3. Re-run the §9 verification and stamp the new date.
4. If a rule is relaxed (e.g. allowing a new direct cross-schema read), record **why** and the
   blast-radius/exit-ramp impact (§8).

*Author: Claude (Opus 4.8) per founder strategy session, 2026-06-17. Grounded in verified
on-disk + live-DB state, not assumptions.*
