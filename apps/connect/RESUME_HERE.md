# RESUME_HERE — Citizens Connect

> **Read this first. It is the single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.

---

## 1. Project at a glance

- **Citizens Connect** — flagship channel of the Citizens ecosystem. Map-first community discovery (events, places, Contributors) for the Christian community and anyone curious.
- Stack: Next.js 15 App Router (RSC) + TypeScript + Supabase + MapLibre GL JS + MapTiler Cloud vector tiles + Tailwind CSS v4 + Capacitor (iOS/Android wrapper, no RN/Expo).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls, royal/Kingdom polish.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked single source of truth: `.github/MASTER_DIRECTION.md` (Parts 1–12).**

## 2. What just shipped

**Batch 11 — BUG: admin contributor approvals 500 (notifications.url + auth wiring)** — `origin/main` @ `cf9e00b`.

- **Symptom:** `/admin/contributors/[id]` Approve/Reject buttons returned "Review failed". Postgres logs showed `ERROR: column "url" of relation "notifications" does not exist` on every click.
- **Root cause #1 — wrong column.** The two contributor RPCs (`approve_contributor_application` / `reject_contributor_application`, originally migration 036) and the edge function's service-mode fallback (`performReviewAsService`) were both inserting into a top-level `notifications.url` column that has never existed. Canonical pattern in this project: deep links live in the `data` jsonb (`{url: '/some/path'}`) — see schema.sql, migrations 069/070, and every working trigger.
- **Root cause #2 — auth header.** `/api/admin/contributors/review` invoked the edge function via `supabase.functions.invoke(...)` from an SSR cookie client. That path doesn't always forward the session JWT as `Authorization: Bearer`, so the edge function couldn't see `auth.uid()` and silently fell through to the unauthorized branch.
- **Migration 084** rewrites both RPCs to write `data := jsonb_build_object('url', '/profile/contributor')` (approve) / `'/contributor/apply'` (reject); both gain `set search_path = pg_catalog, public` while we're in there.
- **Edge function `review-contributor-application` v3** deployed via MCP. Service-mode fallback now writes `data: { url: ... }`. (Local source uses `../_shared/` which is correct on disk; MCP deploy bundles everything into `source/` so the deploy payload was rewritten to `./_shared/` + an inlined deno.json import_map.)
- **`/api/admin/contributors/review`** explicitly pulls the access token via `supabase.auth.getSession()` and forwards `Authorization: Bearer <jwt>` to `functions.invoke`. Returns 401 if no session.
- **`NotificationPanel.getNotificationLink`** (architect must-fix) extended with a `data.url` branch — accepts only strings starting with `/`. Without this, contributor approval notifications rendered but were unclickable.
- **`supabase` CLI** added to devDependencies for local dev parity.

✅ **Quality gate (Batch 11):** tsc 0 errors · vitest 78 files / **697 tests passing** · `next lint --dir src` clean · advisors **0 ERROR / 82 WARN — no new vs baseline** (the 4 SD-function warnings on these 2 RPCs were pre-existing since migration 036) · Architect run: 1 Must-fix applied inline (NotificationPanel `data.url` branch); 5 Should-fixes deferred with rationale (atomicity of `performReviewAsService`, sign reviewer_id + reason inside HMAC, add replay nonce, restrict RPC EXECUTE to authenticated only — see DECISIONS.md Batch 11).

**How to verify locally:**
1. Sign in as an admin. Open `/admin/contributors/[id]` for a pending application.
2. Click Approve → toast success → recipient's bell shows a new notification ✦ → clicking it routes to `/profile/contributor`.
3. Click Reject (different app) → recipient notification routes to `/contributor/apply`.
4. Test the email-deep-link path: trigger an approval email from a previous run (or via the `?token=…&state=…` query string in the dev console), click — same flow, no 500.

**Batch 10 — Admin batch 2 (8 audit fixes + ConfirmModal a11y + audit-policy defer ask)** — `origin/main` @ `be0cb77`.

- **`src/components/ui/ConfirmModal.tsx`** — reusable destructive/primary glass confirm modal. ESC dismisses (when not busy). Backdrop click intentionally NOT dismissive. Default focus lands on **Cancel** for `tone="destructive"` (avoids stray Enter re-firing destructive action) and on **Confirm** for `tone="primary"`. Auto-focus is deferred via `requestAnimationFrame` so SR announces title first.
- **`/api/admin/categories` POST + `/api/admin/categories/[id]` PATCH+DELETE** — admin-only categories CRUD. Pipeline: `requireAdmin` → `isValidUUID(id)` → `checkRateLimit(per-actor, RATE_LIMITS.mutation)` → validate (name 1–80, slug `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, applies_to ∈ events|places|both, sort_order 0–10000, optional emoji ≤8 chars, optional `#hex` color) → DB op → `logAdminAction`. 23505 → 409.
- **`CategoryManager.tsx`** — refactored to fetch the new API (no direct Supabase client). Delete uses `ConfirmModal` with copy warning about ON DELETE SET NULL FK detach.
- **`ApiKeyManager.tsx`** — replaces native `confirm()`/`alert()` with `ConfirmModal` + inline error state.
- **`/api/admin/api-keys`** — GET on `RATE_LIMITS.read`; DELETE adds mutation rate-limit + UUID validation before the RPC call.
- **`/api/admin/reports/[id]` PATCH** — adds `RATE_LIMITS.mutation`.
- **`/api/admin/contributors/review`** — removes dead branch from `getClientIp` (Next.js 15 removed `NextRequest.ip`).
- **`/api/admin/users`** — search escapes LIKE wildcards `\ % _` after the allowlist regex.
- **5 admin pages `.single()` → `.maybeSingle()`** on the profile role lookup: `admin/{categories,reported,tags,api-keys,contributors/[id]}/page.tsx` — defends against the rare race where the auth user exists but `handle_new_user` hasn't yet populated `profiles`.
- **Audit policy update** — `.github/agents/connect-auditor.agent.md` Phase 2 now has a new step 6 that `askQuestions`s the user (apply now / apply selected / defer all) before leaving Report-only items unfixed. Default recommendation rules: suggest "apply now" only for ≤3 single-line edits with no behaviour change; suggest "defer" when context is light or items need design input. Choice is recorded in the checkpoint to prevent re-asking.
- **Tests +14, suite 697 passing**: new `src/__tests__/api/admin/categories.test.ts` (POST 401/403/400×3/201, PATCH 400-uuid/400-empty/200, DELETE 400-uuid/404/200); extended `api-keys.test.ts` (DELETE rejects non-UUID id); extended `reports/route.test.ts` (rate-limit mock + 429).

✅ **Quality gate (Batch 10):** tsc 0 errors · vitest 78 files / **697 tests passing** · `next lint --dir src` clean · advisors **0 ERROR / 84 WARN — unchanged from Batch 9 baseline** · Architect subagent: no Must-fix; both Should-fixes (`.maybeSingle()` parity on `contributors/[id]/page.tsx` + ConfirmModal focuses Cancel for destructive tone) applied inline before commit; Nice-to-haves routed via the new audit-policy ask path.

**Batch 9 — Admin Tier B (audit log + rate limits + glass scaffold)** — `origin/main` @ `e6c1df6`.

- **Migration `083_audit_log.sql`** — `public.audit_log(id, actor_id, action, target_type, target_id, metadata, created_at)` + RLS (admin-only read, service-role write) + indexes.
- **`src/lib/adminGuard.ts`** — `requireAdmin(supabase)` returns discriminated `{ok:true, user} | {ok:false, deny:NextResponse}`; `logAdminAction(supabase, entry)` inserts a row into `audit_log`.
- Rate-limits added to every admin write endpoint (`RATE_LIMITS.mutation`/`read`). CategoryManager glass-modal scaffold landed (refactored into API-driven form in Batch 10). ApiKeyManager UUID guard scaffold landed (rate-limit + Confirm modal landed in Batch 10).

✅ **Quality gate (Batch 9):** tsc 0 errors · vitest 683 tests · lint clean · advisors 0 ERROR / 84 WARN unchanged.

**Batch 8 — FEAT-06 contributor billing foundation (no PayFast)** — combined commit `ec74032` with Batch 7b.

- **Migration `081_contributor_billing.sql`** — adds `profiles.billing_tier` (`individual` / `medium` / `large`, default `individual`) + `profiles.billing_trial_started_at` (nullable). Creates `public.contributor_billing(profile_id, month YYYY-MM regex CHECK, event_count, place_count, calculated_total numeric, updated_at)` PK `(profile_id, month)` with index on `(month)`. RLS SELECT owner-or-admin; explicit `REVOKE INSERT, UPDATE, DELETE FROM anon, authenticated`. Two `SECURITY DEFINER` tally triggers (`tally_contributor_event` / `tally_contributor_place`) fire AFTER INSERT on `events` / `places`, gated on `role='contributor'`, upserting the current-month row with `ON CONFLICT … DO UPDATE` (race-safe). IMMUTABLE helper `contributor_event_rate(text)` returns R250 / R150 / R30 per FEAT-06.
- **Migration `082_billing_privacy_and_trial_stamp.sql`** (Architect Should-fixes):
  - Column-level `REVOKE SELECT (billing_tier, billing_trial_started_at) ON profiles FROM anon, authenticated` — closes leak via the public profiles `using (true)` policy.
  - New `STABLE SECURITY DEFINER` RPC `get_my_billing_context()` returns ONLY the caller's own `(billing_tier, billing_trial_started_at, created_at)` keyed on `auth.uid()`.
  - New `BEFORE UPDATE OF contributor_status` trigger `trg_stamp_billing_trial_on_approval` stamps `billing_trial_started_at = now()` on the `non-approved → approved` transition (never clobbers a pre-set value). Closes the trial-anchor copy-vs-reality mismatch.
- **`BillPreviewCard` server component** — self-auth via `supabase.auth.getUser()`, calls the new RPC for tier+trial, fetches current-month tally via the RLS-scoped client. Renders glass-panel with amber trial banner + 4 dl tiles (events / places / tier+rate / due-this-month with "(R… after trial)" hint). No `profileId` prop — closes Architect Should-fix #3.
- **`/profile/contributor/billing/setup` page** — auth+role-gated "Coming soon" stub (PayFast deferred per D11 / T5).
- **`/profile/contributor/dashboard`** wired to render `<BillPreviewCard />` after `<ManageEventsView/>`.
- **`src/types/db.ts`** — new `BillingTier`, `BILLING_TIER_LABELS`, `BILLING_TIER_EVENT_RATE_ZAR`, `ContributorBilling` exports; `Profile.billing_tier?`, `Profile.billing_trial_started_at?`.

**Batch 7b — Closing deferred DECISIONS (DB-only)** — same commit `ec74032`.

- **Migration `079_provinces_lookup.sql`** — `public.provinces(name text PK, display_order int, created_at)` seeded with 9 SA provinces, RLS SELECT to anon+authenticated. FK `profiles.connect_home_province → provinces(name) ON UPDATE CASCADE ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE`.
- **Migration `080_learn_enrolled_listings_no_dupes.sql`** — IMMUTABLE helper `uuid_array_has_no_duplicates(uuid[])` + CHECK on `profiles.learn_enrolled_listings` (helper wraps the predicate because Postgres forbids subqueries inside CHECK).
- `notifications.type 'friend_invite'` — confirmed already absent from CHECK; no migration needed. Closed-as-noop.

✅ **Quality gate (Batch 7b + 8 combined):** tsc 0 errors · vitest 77 files / 683 tests passing · `next lint --dir src` clean · advisors **0 ERROR / 84 WARN** (+1 expected `authenticated_security_definer_function_executable` on `get_my_billing_context`, matches established baseline pattern) · Architect **A−** with no Must-fix; all 3 Should-fixes applied inline.

**Batch 7a — Staged audit fixes** — `origin/main` @ `4053d71`.

- `redirectWithCookies()` helper ensures `auth.signOut()` Set-Cookie headers actually reach the browser on redirect (otherwise stale session cookies survived and the next request re-authenticated silently).
- `/api/admin/contributors/review` hardened: `requireAdmin()` on in-app path, IP rate limit with trusted-IP gating (`request.ip` first, XFF/X-Real-IP only when `VERCEL` is set, fail-closed with 400 `client_identity_required` when null) on deep-link path. UUID + enum validation up front in both modes.
- Rate limits added to consider PUT, follow DELETE, event-updates POST, conversations GET, indemnity POST, contributor/profile POST, preferences POST, push-token DELETE.
- Event-updates POST: RLS denial → 403 via `error.code === '42501'` (locale-independent), error message no longer surfaced to clients.

✅ **Quality gate (Batch 7a):** 683 tests · advisors 0 ERROR / 83 WARN unchanged.

**Batch 6 — Citizens ecosystem foundation: profile schema extensions + content labels + monorepo prep + deferred polish.**

- **Migration `072_extended_profile_schema.sql`** — adds four nullable-with-defaults columns to `public.profiles`: `wear_style_preferences jsonb default '{}'`, `wear_wardrobe_visibility text default 'private' check in (public|private|friends)`, `learn_enrolled_listings uuid[] default '{}'`, `connect_home_province text`. Intentional no-op on `connect_notification_radius` — existing `notification_radius_km int default 50` stays the source of truth (logged in DECISIONS.md).
- **Migration `073_content_labels.sql`** — new `public.content_labels(id, entity_type in event|place|profile, entity_id, label 1-64 chars, created_at, UNIQUE(entity_type, entity_id, label))` with indexes on `(entity_type, entity_id)` and `(label)`. RLS: public read for events + places only (tightened by 077), admin writes only. Trigger `apply_event_content_labels()` SECURITY DEFINER, `search_path = pg_catalog, public`, fires AFTER INSERT OR UPDATE OF category on events; rules: `markets-expos` → `'market'`, `education-equipping|education|equip` → `'education'`. Backfill on apply: **22 education labels seeded, 0 markets** (no markets-expos events exist yet).
- **Migration `074_event_updates_replica_identity_full.sql`** — `alter table public.event_updates replica identity full;` activates the existing `event_id=eq.${eventId}` filter on the JS DELETE realtime subscription in `EventUpdatesList.tsx`. Architect Nice-to-have from Batch 5 closed.
- **Migration `075_search_contributors_bio_truncation.sql` + `078_search_contributors_bio_word_boundary.sql`** — `search_contributors` RPC now truncates bios at 160 chars on the **last word boundary** (`regexp_replace(substr(p.bio,1,160), '\s+\S*$', '')`) so we never split mid-grapheme / mid-emoji. Preserves migration 068's metacharacter escapes and `word_similarity >= 0.3` gate.
- **Migration `076_tighten_apply_event_content_labels_grants.sql`** — fix-up after 073 caused 2 new advisor warnings; revokes EXECUTE from public/anon/authenticated and grants only to service_role. Triggers run as the trigger owner (postgres), so caller EXECUTE grants are unnecessary.
- **Migration `077_content_labels_lifecycle_and_tighten_rls.sql`** — Architect Must-fixes:
  - The apply trigger now deletes rule-managed labels for the row before reinserting, so moving an event from `markets-expos` → `youth` correctly clears the stale `'market'` label.
  - New `cleanup_content_labels_on_entity_delete()` helper + AFTER DELETE triggers on `events`, `places`, `profiles` prevent orphan label rows.
  - SELECT policy tightened from `using (true)` to `using (entity_type in ('event','place'))`, closing a future profile-label leak before any code starts writing them.
- **TypeScript types** (`src/types/db.ts`) — added 4 optional Wear/Learn/Connect fields to `Profile` and a new `ContentLabel` type.
- **Canonical schema** (`supabase/schema.sql`) — Batch 6 block appended; idempotent.
- **BUG-09 — `/admin/reports` → `/admin/reported`** — folder renamed via `git mv`; internal hrefs in the page + the admin dashboard updated. **API stays at `/api/admin/reports/[id]`** (intentional split, documented in route header — the page URL is user-facing vocab, the API is admin-client-only).
- **Monorepo prep** (per MASTER_DIRECTION Part 7) — `docs/MONOREPO_PLAN.md` describes the target `citizens/` Turborepo + pnpm workspace layout (apps/connect|wear|vision|learn|impact|social|play; packages/ui|auth|database|config|utils), cutover steps, risks, gating criteria. `monorepo-prep/` holds README-only placeholders so a future agent doesn't try to wire them up.

✅ **Quality gate (Batch 6):** tsc 0 errors · vitest 77 files / **682 tests passing** · `next lint --dir src` clean · Architect 2 Must-fixes + 2 Should-fixes applied inline, Nice-to-haves logged · advisors **0 ERROR / 83 WARN — unchanged from Batch 5 baseline** (briefly went to 85 after 073, fixed by 076 → back to 83).

**Batch 5 — FEAT-05 Broadcast Updates polish + retroactive infrastructure fix** — `origin/main` @ `a198be7`.

- **Critical finding:** migration `030_event_updates.sql` was authored locally on the Phase E ship date but never applied to the remote project. Every FEAT-05 surface (composer, viewer, GET/POST API, edge function) had been silently 500'ing in production since Phase E shipped. Applied retroactively via MCP.
- **New migration `071_event_updates_realtime.sql`** adds `event_updates` to the `supabase_realtime` publication (idempotent), applied.
- **New `DELETE /api/events/:id/updates/:updateId`** — RLS-gated (author or admin), UUID-validated, scoped by both `event_id` and `id` so a caller can't reach across events. Maps 42501/RLS → 403, missing row → 404, success → 200. 5 new tests.
- **`EventUpdatesList` rewritten** — resolves current viewer + admin role on mount; subscribes to `postgres_changes` INSERT and DELETE filtered by `event_id`; renders inline Delete button when `viewer.id === author_id` or `viewer.isAdmin`; optimistic local removal; cleans up channel on unmount. Initial snapshot uses merge-not-replace dedupe to avoid a sub-second race against the realtime channel (Architect Should-fix).
- **`OrgSearchPanel` kind-label dedupe** — triple ternary replaced with a local `KIND_BADGE_LABEL` record at file scope; commented why the short "Org" label intentionally diverges from canonical `CONTRIBUTOR_KIND_LABELS`.
- **`leaflet-maps.instructions.md` renamed to `maplibre-maps.instructions.md`** via `git mv`; refs updated in `copilot-instructions.md`, `RESUME_HERE.md`, `docs/STATUS_REPORT_2026-05.md`.
- **`.github/MASTER_DIRECTION.md` FEAT-05 doc reconciled** — `event_broadcasts` is the spec name; `event_updates` (1000 chars, not 500) is the shipped name. Future readers won't re-debate this.

✅ **Quality gate (Batch 5):** tsc 0 errors · vitest 77 files / 682 tests · lint clean · Architect 1 Should-fix applied inline (race), 2 Nice-to-haves logged · advisors **0 ERROR / 83 WARN — unchanged from Batch 4 baseline**.

**Batch 4 — FEAT-04 Consider → Convince + friend-activity notifications** — `origin/main` @ `a99366d`.

- **`convinces` table** (id, from_user_id, to_user_id, event_id, created_at) + RLS: participants read; mutual-friend + target-is-considering insert; sender-only delete. `UNIQUE (from_user_id, to_user_id, event_id)` makes Convinced a one-time act per recipient/event — duplicate INSERT returns 23505 → API maps to 409 → UI flips to "Convinced ✓".
- **`/api/convince` (POST + DELETE)** — rate-limited, UUID-validated, self-block, error-code mapping (23505 → 409, 42501 → 403, 201 on success). 9 new tests.
- **Two new SECURITY DEFINER triggers** (both `search_path = pg_catalog, public`, per project hardening standard from migration 051):
  - `notify_on_convince` — fires on `convinces` INSERT, respects `notification_prefs.friends_activity` (default ON), writes `friend_convince` notification.
  - `notify_friends_on_rsvp_attending` — fires on `rsvps` INSERT or UPDATE when `status=attending` (first-time transition only), fans out `friend_attending` notifications to every mutual follower with the pref on, **with 24h dedup `not exists` guard** so rapid attending↔considering toggles don't re-fan-out.
- **Notifications type allow-list widened** for `friend_convince` and `friend_attending`.
- **`useBurgerMenuData` rewritten** — 6 parallel queries: trending, favourite orgs, friends, friend-considerings (grouped mutuals per event), userConsidering, incomingConvinceEventIds (`Set<event_id>` of events convinced TO me), outgoingConvinceKeys (`Set<event_id|to_user_id>`). Returns a `refetch()` callable.
- **BurgerMenu refactored** into unified **Considerations** section: segmented My/Friends toggle; combined badge `userConsidering.length + friendConsiderings.length`; new `FriendConsideringCard` renders event card + mutual avatars + Convince button (treats 201 || 409 as success → flips to "Convinced" pill via `localSent` || `outgoingConvinceKeys.has(...)`). Old Friends accordion + `BurgerConsiderSection` + `FriendAccordion` helpers removed.
- **EventsView wired**: passes new hook fields to BurgerMenu; quick-action `consider` calls `refetchBurgerData()` after `setConsiderVersion`; both horizontal-card grids (trending + quick-panel) render a small "✦ Convinced" overlay on events present in `incomingConvinceEventIds`.
- **NotificationPanel** `TYPE_ICONS` extended with `friend_convince: "✦"`, `friend_attending: "♥"`, `new_message: "✉"`. Existing `data.event_id` deep-link already navigates.
- **Migrations**: `022` source updated on-disk to match deployed hardened state (auth.uid() check + revoke/grant). `069` created (table + RLS + widened CHECK + 2 triggers). `070` created (search_path hardening on all 3 functions + dedup guard) — both applied to remote via MCP and verified.
- **`supabase/schema.sql`** canonical FEAT-04 block appended.

✅ **Quality gate (Batch 4):** tsc 0 errors · vitest 76 files / 677 tests (+9 new for /api/convince) · lint clean · Architect B→A after applying both Must-fixes + one Should-fix inline (see DECISIONS.md) · advisors **0 ERROR / 83 WARN** (baseline 77 + 4 expected for new SECURITY DEFINER triggers + 2 scan variability; no new ERROR-level findings).

**Batch 3 — FEAT-03 Organisation Profiles & Discovery + N1/N3/N5 + place owner link** — `origin/main` @ `ef7fac6`.

- **Typo-tolerant contributor search** (`pg_trgm` in the `extensions` schema). RPC `public.search_contributors(q, kinds, location_query, category_slug, sort_by, result_limit)` — SECURITY INVOKER, STABLE, `search_path = public, extensions, pg_temp`, `word_similarity(qn, full_name) >= 0.3`. "evry naton" → "Every Nation Mooikloof" (sim 0.43). ILIKE branches escape `\ % _` to prevent wildcard injection.
- **API:** `GET /api/contributors/search` — anon-allowed, rate-limited per IP (120/min), bare `@supabase/supabase-js` client singleton (no cookie, CDN-cacheable). `Cache-Control: public, s-maxage=15, stale-while-revalidate=60`.
- **UI:** `OrgSearchPanel` (debounced 220ms, AbortController) mounted as an "Organisations" tab in the events bottom search bar (segmented Everything / Organisations toggle). Results → `/c/<slug>`.
- **N1:** removed dead `isVendor` prop from EventsView + deduped router declaration.
- **N3:** simplified profile select on `/events` page.
- **N5:** GlassCalendar autofocuses its close button on open.
- **URL hygiene:** single `closeCalendar()` callback routes every dismiss path (Escape, GlassCalendar onClose, event/place select, brand click, focus-event) so `?view=calendar` is always stripped.
- **Place owner link:** `/places/[id]` now shows "Owned by <full_name>" linked to `/c/<slug>` when role=contributor + status=approved + slug.
- **Migrations:** 066 (RPC + pg_trgm), 067 (pg_trgm relocated to `extensions`), 068 (ILIKE escaping). `supabase/schema.sql` canonical block appended.

✅ **Quality gate (Batch 3):** tsc 0 errors · vitest 75 files / 668 tests (+12 new) · lint clean · Architect B→A after applying all three Should-fixes inline · advisors **0 ERROR / 77 WARN — unchanged from Batch 2 baseline**.

**Batch 2 — Events surface simplification + RLS hardening (FEAT-02 + BUG-06)** — `origin/main` @ `ffd8133`.

- **Removed:** FullCalendar (5 packages), `EventCalendar.tsx`, `FeaturedPanel.tsx`, `/api/featured` route, `featured_listings` table (migration 065), trending modal in EventsView, `leaflet.markercluster.d.ts`, ~150 LOC of `.fc-*` CSS overrides, calendar province filter.
- **Added:** `src/components/events/GlassCalendar.tsx` (~280 LOC, zero-dep frosted month-grid overlay rendered above the persistent map). Category-coloured left border, gold tint for RSVPed events, max 3 events/day + "+N more", Escape closes, arrow-key month nav (guarded against INPUT/TEXTAREA/contentEditable).
- **EventsView refactor:** `view: "map"|"calendar"` state replaced with `calendarOpen: boolean` overlay; `?view=calendar` deep-link still works.
- **Migration 065 applied:** dropped `featured_listings`; `directory_contributors` recreated `WITH (security_invoker = on)`; `app_settings` RLS enabled (admin-only). Supabase advisors **2 ERROR → 0 ERROR**.

✅ **Quality gate (Batch 2):** tsc 0 errors · vitest 73 files / 656 tests · lint clean · Architect (no Must-fix; S1 + S2 applied inline; N1–N5 deferred) · advisors 2 ERROR cleared, no NEW warnings.

**Batch 1b — Re-file** — `origin/main` @ `6d43e06`.

- Root `MASTER_DIRECTION.md` deleted — `.github/MASTER_DIRECTION.md` is now the only copy.
- `.github/AGENTS.md` + 11 `.github/agents/*.agent.md` files archived to `docs/archive/` (D7: 11-agent workflow discarded; replaced by Architect subagent + inline Security review per batch).
- `.github/copilot-instructions.md` rewritten: correct role names (`citizen`/`contributor`+`contributor_kind`/`admin`), removed Agents section, updated roadmap (656 tests, no FullCalendar), session workflow updated.
- `.github/VISION.md` updated: Contributors/Citizens terminology, Pretoria default map centre, Citizens Learn channel added.
- `README.md` rewritten: drops Leaflet, adds MapLibre GL JS + MapTiler Cloud + TypeScript, adds Windows PATH note, MASTER_DIRECTION link.
- `docs/FUTURE_IDEAS.md` created — seeded with AI search, multilingual, CASI, analytics, Citizens Social, ecosystem channels (Wear/Learn/Central/Impact), architecture ideas.
- `.env.example` created — SUPABASE + MAPTILER keys documented; locked style UUID pre-filled.
- `docs/RUNBOOK.md` created — local setup, env vars, Vercel T4 owner task steps, quality gate, Supabase ops, Capacitor builds, git convention, common issues.

✅ **Quality gate (Batch 1b):** tsc 0 errors · vitest 656/656 · lint clean · Architect A (6 Should-fixes applied).

**Batch 1 — Admin panel restructure (FEAT-01 + D15)** — `origin/main` @ `375e7f2`.

- Admin dashboard at `/admin`, contributor applications inbox at `/admin/applications`.
- Burger menu: single "Admin panel →" link (not 6 separate links).
- Profile page: admin management tile.

✅ **Quality gate (Batch 1):** tsc 0 errors · vitest 656/656 · lint clean · advisors baseline unchanged.

## 3. Current platform state

- All Phase 1 → 11 work plus prior batches A–R, S1–S3, post-S3 1–3 remain shipped.
- MASTER_DIRECTION execution: Batches 1, 1b, 2, 3, 4, 5, 6, 7a, 7b, 8, **9 (Admin Tier B)**, **10 (Admin batch 2)** shipped. FEAT-01 → FEAT-06 schema + UI surfaces all landed; PayFast wire-up still deferred.
- Test suite: **697 / 697**. TS: 0 errors. Lint: clean.
- Supabase advisors security: 0 ERROR, 84 WARN (all baseline — no new warnings vs Batch 9).
- Git: `origin/main` at `be0cb77` (Batch 10 — admin audit fixes).
- **Admin surface posture:** every admin mutation route now goes through `requireAdmin` → UUID guard → per-actor rate-limit → validate → DB → `logAdminAction`. Native `confirm()`/`alert()` are banned on admin surfaces (use `ConfirmModal`).

## 4. Next batches queued (in priority order)

1. **PayFast wire-up batch** — D11 / T5 / MASTER_DIRECTION Part 6. Deploy `payfast-webhook` edge function, wire `/profile/contributor/billing/setup` to the PayFast hosted checkout, record `payments` ledger rows, mark months as paid/unpaid, surface "Pay R… now" CTA on the BillPreviewCard when the trial expires.
2. **Next audit surface (from `.audit/QUEUE.md`)** — pick the next highest-risk surface; the auditor will now ask before deferring Report-only items.
3. **Wear feature spec** — separate planning session per MASTER_DIRECTION Part 12.
4. **Monorepo cutover** — once gating criteria in `docs/MONOREPO_PLAN.md` §5 are met.
5. **Batch 8.1 nice-to-haves** — DELETE-decrement triggers on events/places, month-as-date conversion, setup-page flash-message.
6. **Batch 10 Nice-to-haves (deferred via audit-policy ask)** — `ConfirmModal` focus-trap + `aria-describedby` for Citizen-facing reuse; test-helper that distinguishes between consecutive `.single()` / `.maybeSingle()` calls; grapheme-aware emoji slice; tighter `#hex` regex; `categories.is_system` flag; `logAdminAction` error handling.
7. **Apply remaining BUG-01..BUG-08, BUG-10** and **T-tasks** from `.github/MASTER_DIRECTION.md` Parts 6–8.

## 5. Open questions / deferred items

- **T4 (owner task):** `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` are missing on Vercel. Map renders OSM raster fallback until set. See `docs/RUNBOOK.md` section 2 for Vercel setup steps. Style UUID locked: `019dba0f-b49b-73bb-bf6a-f9d820f43be8`.
- **Doc-vs-code discrepancy logged in DECISIONS.md:** approval keeps `role='contributor'` + `contributor_kind` sub-type (per migration 033), not the literal "role to match contributor_kind" wording in MASTER_DIRECTION FEAT-01.
- **Batch 6 Architect nice-to-haves (deferred):** SA-province CHECK on `connect_home_province`; consider per-app `profiles_wear` / `profiles_learn` sub-tables once a 3rd Wear-only column needs custom RLS; toast infra on optimistic DELETE failure across the app; `unique`-on-read or CHECK no-dupes on `learn_enrolled_listings`.
- **Batch 3 Architect nice-to-haves (deferred):** `word_similarity` is not directly indexable (revisit beyond ~5k contributors); add trgm index on `bio` if bios grow long.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 697 pass / 0 fail
npx next lint --dir src     # expect clean (deprecation warning is non-blocking)
```

Smoke test the admin restructure:

1. Sign in as an admin user → visit `/admin` → confirm 5 stat tiles render and `/admin/applications` opens from the tools grid.
2. Visit `/admin/contributors` → confirm 302 to `/admin/applications`.
3. Open the burger menu as admin → confirm a single "Admin panel →" entry (not six links).
4. Visit `/profile` as admin → confirm the "Admin Panel" management tile appears.
5. Visit `/admin` as a non-admin → confirm redirect to `/events`.

## Audit queue

- ✅ **middleware-and-session** — clean (patch applied Batch 7a, audited 2026-05-15)
- ✅ **api-surface** — clean (patches applied Batch 7a, audited 2026-05-15)
- 🟡 **auth-and-signup** — 2 staged fixes, run `/audit-apply auth-and-signup`. Checkpoint: `.audit/surfaces/auth-and-signup.md`. Patches: `auth-and-signup--indemnity-applies-to-injection.diff` (PostgREST filter injection), `auth-and-signup--redirect-after-login.diff` (redirect param ignored after login).
- ✅ **admin** — Gate 1 fix applied (categories admin write RLS, migration 083, Studio-applied + committed fbafb60). 8 Report-only observations remain in checkpoint. Next: verify with `mcp_supabase_execute_sql` + `mcp_supabase_get_advisors` in a session where MCP is connected. Checkpoint: `.audit/surfaces/admin.md`.
- pending: edge-functions, event-create-edit, rsvp-and-comments, messaging-dm, place-create-edit-media, notifications, onboarding, events-browse, event-detail, profile-and-interests, places-browse-and-follow, map-core, storage-and-media-uploads.
- Full queue: `.audit/QUEUE.md`.

## 7. Memory pointers

- Locked direction: `.github/MASTER_DIRECTION.md` (sole canonical copy since Batch 1b).
- Batch shipping notes: `/memories/repo/batch-*.md`.
- Standing user workflow: `/memories/quality-pipeline.md` (user-scope).
- Ecosystem vision + slogan: `/memories/repo/citizens-ecosystem-vision.md`, `/memories/repo/citizens-slogan.md`.
- Coding conventions: `/memories/repo/coding-patterns.md`.
- Deferred features: `docs/FUTURE_IDEAS.md`.
- Operations runbook: `docs/RUNBOOK.md`.

## 8. Architecture quick-orient

- Full directory map + data flow + key relationships: `.github/instructions/project-architecture.instructions.md`.
- UI rules (60/30/10, floating controls): `.github/instructions/connect-ui-system.instructions.md`.
- MapLibre + MapTiler patterns: `.github/instructions/maplibre-maps.instructions.md`.
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`.
- Project ID: `xyiajtrvhlxaeplsiajj`. Default map centre: Pretoria, South Africa `[-25.7479, 28.2293]`.
- Roles: `citizen` / `contributor` / `admin` with `contributor_kind` sub-type (`ministry` / `organization` / `business`) per migration 033.
