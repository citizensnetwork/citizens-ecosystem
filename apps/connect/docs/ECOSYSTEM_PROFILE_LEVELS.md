# Citizens Ecosystem — Profile Levels (capability contract)

> **Status: PROPOSED → normative once the founder ratifies §5.** Created 2026-07-02
> (ecosystem Step 4b, [decision brief §6 row 4b](./strategy/ECOSYSTEM_DECISION_BRIEF.md)).
> Companion to [`SHARED_DB_CONTRACT.md`](./SHARED_DB_CONTRACT.md) (see its §6): the DB contract
> says *where data lives and who may touch it*; **this doc says what a person can BE** across
> the ecosystem, per app, and how each capability is granted, verified, and revoked.
>
> Vision alignment: every believer is first a **Citizen** in God's Kingdom (VISION.md). Levels
> below are *capabilities added to* that identity — never a ranking of worth. The smallest
> contributor and the quietest citizen remain necessary parts of the Body.

---

## 1. The model in one sentence

**One identity (`auth.users`) → everyone is a *Citizen* everywhere → each app grants its own
*creating tier* (Connect Contributor · Wear Brand/Creator · Vision org roles) → each app has its
own *Admin*, and no level is ever inherited across apps.**

```
                    ┌────────────────────────────────────────────────┐
 Level 2 — ADMIN    │ Connect admin ✅ · Vision platform_admin ✅ ·   │  per-app stewardship
                    │ Wear moderator/admin ✅ (mig 145+146, §5)       │
                    ├────────────────────────────────────────────────┤
 Level 1 — CREATING │ Connect: Contributor (approved lifecycle)      │  per-app, app-granted
        TIER        │ Wear:    Creator (default) / Brand (owner)     │
                    │ Vision:  org roles (authority-assigned RBAC)   │
                    ├────────────────────────────────────────────────┤
 Level 0 — CITIZEN  │ One auth.users row + per-app mirrors           │  universal base
                    └────────────────────────────────────────────────┘
```

---

## 2. Level 0 — Citizen (the universal base)

| Property | Implementation (live) |
|---|---|
| Identity | **One `auth.users` row** for the whole ecosystem (SHARED_DB_CONTRACT R6.1). Google OAuth via the shared project `xyiajtrvhlxaeplsiajj`. |
| Connect mirror | `public.profiles` — auto-created by `handle_new_user` trigger at first sign-in; `role='citizen'` default. |
| Wear mirror | `wear.users` — **display-safe** (handle/display_name/avatar, NO email), self-hydrated on first Wear sign-in (`POST /api/me/hydrate`, server-validated session identity) or backfilled via `GET /api/v1/profiles/{id}`. |
| Vision | **No citizen mirror by design** — Vision is back-office only (brief D2); a citizen has no Vision surface until an org grants them a role (§4.3). |

**Rules**
- **P0.1** Every ecosystem app resolves a person by `auth.users.id`. Per-app mirrors are
  display/caching conveniences, never alternative identities.
- **P0.2** A Citizen can *consume* everywhere without any further grant: browse/RSVP/follow in
  Connect, view/follow/post socially in Wear. Baseline participation is never gated on a level.
- **P0.3** Mirrors carry **no cross-app PII** (the `wear.users` no-email rule is the precedent —
  public-SELECT mirrors must be display-safe).

---

## 3. Level 1 — the creating tier (per app, differently shaped ON PURPOSE)

Each app's "can publish under an organisational identity" tier reflects that app's trust model.
They are deliberately **not** unified into one table — the *contract* is the shape below.

### 3.1 Connect — **Contributor** (application + approval lifecycle)
- `public.profiles.role ∈ {citizen, contributor, admin}` (mig 033) +
  `contributor_kind ∈ {ministry, organization, business}` +
  `contributor_status ∈ {not_applied → pending → approved | rejected}` (mig 036).
- Status transitions are **trigger-enforced** (mig 036/038): a user may only move
  `not_applied|rejected → pending` (apply/re-apply); only an **admin** approves/rejects; the
  `role` column is protected against self-escalation (`protect_role_column`).
- Capability gate: `is_approved_contributor()` — events/places/broadcasts creation.

### 3.2 Wear — **Citizen → Creator → Brand** (a lazy, earned ladder)
> **Ratified 2026-07-15 (founder).** Wear's creating tier is a *progression*, not a single
> flag. Each rung is *added to* the Citizen base; roles are **lazily derived** from activity
> (no eager grant) until Brand, which is an admin-approved, stored state. Source of truth:
> [`docs/Citizens_Wear_Roles_and_Concepts_MD.md`](../../../docs/Citizens_Wear_Roles_and_Concepts_MD.md) §6.

- **Citizen** (the base here): submit **Concepts**, post **Stories**, comment, save-to-boards,
  follow, purchase. Concepts are the base creation and are **never level-gated** (mig 157
  `concepts_creator_insert`; P0.2 holds — the social floor is Concepts + Stories, not Posts).
- **Creator** — an **earned badge**, derived (no application) once the user has posted **>10
  Concepts**. Unlocks the Concepts-page **stories bar** ("concept-statuses"). The community
  Concepts surface (like/comment/share) is where a design earns the attention that attracts
  Brands. *[DESIGNED — derivation + concept-stories/comments/shares build DEFERRED.]*
- **Brand** — the organisational tier: a `wear.brands` row the user **owns** (mig 143) **and**
  `verified = true` (mig 157 `brand_verifications`, admin-reviewed). A Brand may create **Posts**
  (the Home apparel feed) and, being verified, **propose/claim/produce** Concepts. Brand status
  is **assigned, never self-created**: eligibility is progression-gated (≈20 Concepts posted +
  10 Concepts claimed + a customer-support email/contact + no sustained report history), after
  which a **Become-a-Brand application** (in settings) is submitted to admins, who approve and
  mint the brand row. Launch/partner brands are **admin-minted directly** (the bootstrap that
  lets the first Concepts ever be claimed).
  *[ENFORCED as of **mig 160**: Posts require an owned **verified** brand (UI + API + RLS);
  brand-row INSERT is **admin-only** at RLS. Application UI + eligibility-derivation DEFERRED.]*
- Optional Connect link: `wear.brands.connect_contributor_id` — value-ref to
  `public.profiles.id`, **ownership-verified** (resolve `/api/v1/contributors/{slug}` → require
  `profile.id == auth.uid`), no cross-schema FK. A Wear Brand may *point at* a Connect
  Contributor; it never *inherits* its capabilities (P1.2).

### 3.3 Vision — **authority-assigned org roles** (RBAC, no self-service)
- `vision.user_org_roles` (mig 137): `platform_admin → org_admin → org_manager → org_member →
  org_viewer` (VISION_BACKEND_WIRING_SPEC §0.4), helpers `is_platform_admin()`,
  `is_org_admin(org_id)`, `is_org_member(org_id)`, `get_user_org_role(org_id)`,
  `is_org_or_ancestor_member(org_id)`.
- Roles are granted by an org's admin (or platform_admin) — **there is no application flow**;
  Vision's tier is assigned authority, org-scoped, and hierarchical (departments inherit via
  `is_org_or_ancestor_member`).
- Org ↔ Connect identity bridge: `vision.organisations.connect_contributor_id` (mig 142),
  ownership-verified via `POST /api/connect/link`.
- Universal org model: orgs are **any** organisation type with a Christian lean (churches,
  businesses, nonprofits, training orgs…) — role semantics must stay org-type-neutral.

**Rules**
- **P1.1** The creating tier is **granted by the app that owns the surface**: Connect by admin
  approval, Wear by **admin-approved Brand assignment** (a progression-gated *Become-a-Brand*
  application; brand-row INSERT is admin-only at RLS — mig 160 — with `verified` as the
  marketplace-claim gate), Vision by org authority. No app may auto-grant another app's tier,
  and no app's creating tier is ever self-service (Wear's earlier self-service brand creation
  was retired 2026-07-15).
- **P1.2** **No cross-app inheritance.** A Connect Contributor is NOT automatically a Wear Brand
  or a Vision org_admin (and vice versa). Cross-app links (`connect_contributor_id` in both
  `wear.brands` and `vision.organisations`) are *references with ownership proof*, never
  capability imports.
- **P1.3** Creating-tier state lives in the owning app's schema and is read by siblings only via
  `/api/v1` (SHARED_DB_CONTRACT R1.2/R2) — e.g. Wear renders a linked brand's Connect stats via
  `/api/v1/contributors/{slug}/stats`, never by reading `public.profiles`.

---

## 4. Level 2 — Admin (per-app stewardship; never global)

| App | Mechanism (live) | Scope |
|---|---|---|
| Connect | `public.profiles.role='admin'`, gate `is_admin()`, self-escalation blocked by `protect_role_column` (mig 038); admin RPCs are SECDEF + `authenticated`-granted with internal `is_admin()` checks. | Approvals, moderation/reports, dashboards for the commons. |
| Vision | `vision.user_org_roles.role='platform_admin'` (Citizens Network staff; sees all orgs). Founder bootstrapped (mig 137). | All Vision orgs (back-office). |
| **Wear** | ✅ **LIVE (mig 145+146, 2026-07-02).** `wear.user_roles` (`moderator`/`admin`, service_role-managed, self-SELECT only), gates `wear.is_moderator()`/`wear.is_admin()` (SECDEF), reports triage lifecycle, moderator takedown on posts/comments/stories (DMs excluded). Role grants issued by founder via MCP/SQL until an admin UI exists. | Reports queue + public-content takedown. |

**Rules**
- **P2.1** Admin is **per-app**. There is deliberately no ecosystem-wide super-role: a person
  stewarding all apps holds each app's admin grant separately. (One super-role would weld the
  schemas together and break the exit ramp — SHARED_DB_CONTRACT §8.)
- **P2.2** Admin grants are **never self-service** and never granted by a sibling app. Each app
  must block self-escalation at the DB layer (Connect: trigger; Vision: RBAC policies; Wear:
  §5's service_role-managed table).
- **P2.3** Every admin-only read/write path must be enforceable in SQL (RLS policy or SECDEF
  internal check), not just in route code.

---

## 5. The Wear gap — **migration 145 ✅ APPLIED (2026-07-02, founder-confirmed)**

**Was:** Wear shipped reports intake (mig 143) but no one except `service_role` could read or act
on them; there was no moderator/admin concept in `wear.*`.

**Shipped** (now [`supabase/migrations/145_wear_admin_moderation.sql`](../supabase/migrations/145_wear_admin_moderation.sql)
+ [`146_wear_user_roles_grants.sql`](../supabase/migrations/146_wear_user_roles_grants.sql) — the
145 smoke test found `wear.user_roles` had NO table-level grants (mig 143 grants are explicit
per-table, not default privileges); 146 adds `authenticated` SELECT-only + `service_role` full,
deliberately narrower than 143's blanket pattern — no anon, no authenticated writes):
1. **`wear.user_roles`** (`user_id`, `role wear.platform_role ∈ {moderator, admin}`,
   `granted_by`, `created_at`) — **service_role-managed** (no INSERT/UPDATE/DELETE policy at
   all → P2.2 satisfied structurally; self-SELECT only). Mirrors Vision's assigned-authority
   pattern, NOT Connect's role-column pattern (a role column on the self-updatable `wear.users`
   would need Connect's protection-trigger machinery — a separate no-write-policy table is the
   same guarantee with less mechanism).
2. **Helpers** `wear.is_moderator()` (any role) + `wear.is_admin()` (admin only) — SECDEF,
   `search_path=''`, EXECUTE `authenticated`+`service_role` only (mig 143/144 conventions).
3. **Reports triage lifecycle:** `wear.reports.status ∈ {open → reviewed → actioned | dismissed}`
   (+ `handled_by`, `handled_at`) with moderator SELECT/UPDATE policies.
4. **Takedown policies:** moderator DELETE on `wear.posts` / `wear.comments` / `wear.stories`
   (media/likes/views cascade via FK). **DMs (`wear.messages`) are deliberately excluded** —
   private-content takedowns stay `service_role`-only (privacy: moderators must not gain read or
   delete reach into conversations they aren't members of).
5. Follow-up (app-side, after apply): Wear `/api/admin/*` routes gated on `wear.is_moderator()`
   + a minimal triage screen; grants issued by founder via MCP/SQL until an admin UI exists.

**Applied per protocol** (SHARED_DB_CONTRACT R7): pre-apply tag `connect-pre-mig145` →
`apply_migration` (145, then 146 grants fix) → advisors **0 ERROR / 0 new findings** (72 WARN /
3 INFO = mig-144 baseline byte-for-byte) → smoke-verified via rolled-back prod transactions
(plain user: 0 reports / 0 roles visible, self-escalation INSERT denied; moderator: queue
visible, triage UPDATE works, `is_admin()` correctly false) → contract §9 re-stamped (head 146).
**Remaining app-side follow-up:** item 5 above (Wear `/api/admin/*` + triage screen).

---

## 6. Change discipline

- This doc is the **normative registry** of ecosystem capability levels. Adding a level, a new
  app's tier, or any cross-app capability rule happens HERE first (docs-first, like Step 4b),
  then in SQL.
- Per-app implementation details (enum values, lifecycle transitions) may evolve inside the
  owning app **as long as the §1 model and P-rules hold**; breaking those requires re-ratifying
  this doc with the founder.
- SHARED_DB_CONTRACT §6 (One identity) delegates capability-tier semantics to this doc; keep the
  two in sync in the same commit (its §10 procedure).

*Author: Claude (Fable 5) per ecosystem Step 4b, 2026-07-02. Grounded in live schema (migs 033,
036, 038, 137, 142, 143, 144) — see SHARED_DB_CONTRACT §9 for the verification snapshot.*
