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

## 9. Verification snapshot (updated 2026-07-02, project `xyiajtrvhlxaeplsiajj`, head = mig 146)

Confirmed live:
- **Schemas:** `public`, `vision`, **`wear`** present.
- **`wear.*` (mig 143 + 144 + 145 + 146):** **23 base tables** (all RLS-enabled, **0 without RLS**),
  **48 RLS policies**, **9 functions** — `set_updated_at`; the two READ-path SECURITY DEFINER helpers
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
  note the linter does not currently surface `wear.*` SECDEF fns at all).
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
