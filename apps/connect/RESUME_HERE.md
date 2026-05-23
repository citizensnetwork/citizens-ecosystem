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

**Batch 14c — Audit fix P1 `auth-and-signup` (PostgREST filter-injection + login open-redirect bypass)** — `origin/main` @ `e38fca5`.

- **HIGH — PostgREST filter injection on `/api/indemnity` closed.** `GET /api/indemnity?applies_to=…` was interpolating the raw query param directly into a PostgREST `.or()` filter against `indemnity_templates` (`applies_to.eq.${appliesTo},applies_to.eq.both`). The route now validates against the allowlist `["events", "places", "both"]` (mirrors the DB `applies_to_check` CHECK) and falls back to `"events"` for anything else. No more attacker-controlled filter clauses, no more wildcard / subquery smuggling, no information disclosure on inactive templates.
- **HIGH — `LoginForm` now honours `?redirect=`.** `src/middleware.ts:65` sets `?redirect=${pathname}` when bouncing unauthenticated users off protected routes — but `LoginForm` hard-coded `router.push("/events")`, so the user always landed on the events map after re-authenticating. The form now reads `searchParams.get("redirect")` and routes through a local `safeRedirect()` guard that requires the value to start with a single `/`, reject `\\` and any `:` (blocks `//evil.com`, `\\\\evil.com`, `javascript:`, `data:`, `http:` etc.). Defense-in-depth mirror of the protection already on `auth/callback`'s `next` param. `postLoginPath` is also threaded through to `<OAuthButtons />` (the `redirectTo` prop already existed; the PKCE callback already validates `next`).
- **Architect inline review:** ✅ ship as-is. No Should-fix. One nice-to-have logged: tighten `appliesTo` type from `string` to `(typeof VALID_APPLIES_TO)[number]` at the usage sites. Cosmetic — deferred.
- **Security inline review (OWASP A03 Injection + A10 Open Redirect):** no findings.

✅ **Quality gate (Batch 14c):** tsc 0 errors · vitest 78 files / **703 tests passing** · `next lint --dir src` clean · advisors **83 → 83** (code-only batch, no DB change).

**How to verify locally:**
1. `curl 'http://localhost:3000/api/indemnity?applies_to=both'` → 200 with `both` + `events` templates merged (existing behaviour). Then `?applies_to=)%20or%20(1%3D1` → still 200, falls back silently to `events` (no DB-level error, no filter injection).
2. Sign out, visit `/profile/contributor` → bounced to `/login?redirect=%2Fprofile%2Fcontributor`. Sign in → lands back on `/profile/contributor`, not `/events`.
3. Tamper attempt: `/login?redirect=//evil.com` → after sign-in, ignores the hostile value and lands on `/events`. Same for `/login?redirect=javascript:alert(1)`.

**Next P1:** `edge-functions` (4 staged push fan-out patches: RSVP reminder + event reminder + review prompt attending-only filters + push payload type union). Run `/audit-fix 1`. Surfaces are now batch-safe — no more solo-critical surfaces in the queue.

---

**Batch 14b — Audit fix P1 `storage-and-media-uploads` (SVG-XSS + ProfileEditor avatar RLS)** — `origin/main` @ `bc83f3c`.

- **HIGH — SVG dropped from upload allowlist (XSS on public buckets closed).** `image/svg+xml` removed from `ALLOWED_IMAGE_TYPES` and `SAFE_IMAGE_EXTENSIONS` (`src/lib/validation.ts`), from the unreachable `SKIP_TYPES` branch (`src/lib/imageCompression.ts`), and from every `accept=` attribute (events × 2 forms, places × 2 forms, media gallery). Public `event-images` / `place-images` objects served `Content-Type: image/svg+xml` were live XSS on the storage origin; no further inline SVGs can be uploaded.
- **CRITICAL — ProfileEditor avatar upload was RLS-rejected and extension-unsafe.** `handleAvatarUpload` used path `avatars/<uid>/<ts>.<ext>` which violates the storage RLS predicate `(storage.foldername(name))[1] = auth.uid()::text` (position [1] was the literal "avatars"); the feature has been silently broken for all users. Path now `${profile.id}/avatars/${ts}.${ext}`. Hand-rolled 4-MIME + 2 MB check replaced with the canonical `validateImageFile` + `compressImageIfNeeded` pipeline; `safeImageExtension(file.name)` replaces the raw `split(".").pop()` fallback so hostile filenames can't smuggle a `.php` / `.svg` into the storage key. Legacy `profile.avatar_url` values continue to resolve via the public-SELECT policy — no migration needed.
- **Architect SE: ✅ ship as-is.** No Should-fix. 4 nice-to-haves folded into the deferred storage-hygiene line in `.audit/QUEUE.md` / Polish Queue row 10: legacy SVG purge, shared `IMAGE_ACCEPT` constant export, dedicated `avatars` bucket migration, ProfileEditor `accept=` attribute ordering cosmetic.

✅ **Quality gate (Batch 14b):** tsc 0 errors · vitest 78 files / **703 tests passing** (−1: SVG-skip test removed) · `next lint --dir src` clean · advisors **83 → 83** (code-only batch, no DB change).

---

**Batch 14a — Audit fix P1 `rsvp-and-comments` (CRITICAL `safe_rsvp` IDOR closed)** — `origin/main` @ `fa1ac6b` (carryover `0c6f0b5` shipped immediately before).

- **CRITICAL — `safe_rsvp` IDOR closed (migration 086).** `public.safe_rsvp(p_user_id, p_event_id)` was `SECURITY DEFINER` without an `auth.uid() = p_user_id` guard. A signed-in attacker could `supabase.rpc('safe_rsvp', { p_user_id: '<victim>', p_event_id })` and force a victim to "attend" any event — `notify_friends_on_rsvp_attending` then fanned the action out to the victim's mutual friends as if they had attended. Migration 086 adds the `auth.uid() = p_user_id` guard (raises `unauthorized` / SQLSTATE `42501`), sets `search_path = pg_catalog, public`, revokes EXECUTE from public, grants EXECUTE to authenticated. Mirrors the `toggle_consider` precedent from migration 070. `supabase/schema.sql` canonical block updated.
- **`comments.body` server-enforced length cap (migration 087).** Closed the client-only `maxLength={1000}` bypass: `comments_body_length_chk CHECK (char_length(body) between 1 and 2000)` applied via `NOT VALID + VALIDATE` (lock-friendly). Also adds `comments_user_id_idx` so moderation / profile lookups stop sequential-scanning.
- **`RSVPButton.tsx` surfaces failures.** Previously swallowed 409 (capacity full), 429 (rate-limited), 500 silently; the button label disagreed with reality. Now renders `<p role="alert" className="mt-2 text-xs text-red-600">` below the button, mapping 429 → "Too many requests, please wait a moment.", falling back to the server `error` field or "Couldn't RSVP. Please try again." / "Couldn't cancel RSVP. Please try again." 401 still redirects to `/login`. +3 regression tests (capacity-full, rate-limited, DELETE failure).
- **Architect SE: ✅ ship as-is.** 6 Nice-to-haves logged in the surface checkpoint (map RPC `42501` → 403 in route, render alert region always, clear `showProfileHint` on error, mirror header rationale in schema.sql) — no Must-fix / Should-fix.

✅ **Quality gate (Batch 14a):** tsc 0 errors · vitest 78 files / **704 tests passing** (+3) · `next lint --dir src` clean · advisors **84 → 83 WARN** (`function_search_path_mutable` on `safe_rsvp` closed; no new warnings). The remaining anon/authenticated `_security_definer_function_executable` listings on `safe_rsvp` are PostgREST-exposure informational — the IDOR escalation path is closed inside the function by the `auth.uid()` guard.

**Carryover commit `0c6f0b5`** rolled up 8 orphaned `.single() → .maybeSingle()` Fix-clean edits (events-browse / event-detail / profile-and-interests / places-browse-and-follow) + deleted dead `QuickActionPopup.tsx` (206 LOC) + refreshed audit prompts/agent (`audit.prompt.md`, `audit-fix.prompt.md`, `audit-polish.prompt.md`, `connect-auditor.agent.md`, deleted `audit-apply.prompt.md`).

**How to verify locally:**
1. As a signed-in user, open devtools and run:
   ```js
   const { data, error } = await supabase.rpc('safe_rsvp', { p_user_id: '<some other user id>', p_event_id: '<event id>' });
   console.log(error); // expect: code 42501 / "unauthorized"
   ```
2. RSVP the same event normally → succeeds. RSVP again → 409 with **error message visible under the button**.
3. Fire 7+ rapid POSTs to `/api/rsvp` → 429 surfaces "Too many requests, please wait a moment.".
4. Try inserting a 3000-char comment via supabase-js directly → constraint violation; UI 1000-char cap still in place.

**Next P1:** `auth-and-signup` (PostgREST filter injection on `indemnity_applies_to` + post-login redirect bypass). Run `/audit-fix 1`.

---

**Batch 13 — Map perf: basemap layer pruning + DOM marker culling + MapTiler "Lite" checklist** — `origin/main` @ `f3b7e48`.

- **Symptom:** Map noticeably laggy at province/city zooms — confirmed at multiple zoom bands.
- **Three-pronged fix, all surgical, no rewrites:**
  1. **Runtime basemap pruner** — `pruneBasemapLayers(map)` + `attachBasemapPruner(map)` in `src/lib/map/config.ts`. Walks `map.getStyle().layers` after `style.load` and strips POIs, buildings, transit, ferry/aeroway, housenumbers, hillshade, contours. Toggle: `NEXT_PUBLIC_MAP_PRUNE` (defaults `"on"`; set `"off"` to A/B). Wired into `EventMap`, `MiniMap`, `MapBackdrop`, `LocationPicker`. Per-layer try/catch.
  2. **MapTiler "Lite" style checklist** — `docs/MAP_TILER_LITE_CHECKLIST.md`. Durable Studio recipe (layers to drop / keep, font/glyph trims, palette, env-var swap, rollback). User has the new Lite UUID in `.env.local`; **must update `NEXT_PUBLIC_MAPTILER_STYLE` in Vercel Production + Preview env vars by hand** for the deployed site to switch.
  3. **DOM marker culling** — `cullMarkers()` in `EventMap.tsx`. Toggles `display:none` on event/place markers whose `lngLat` is outside `map.getBounds()` (+10% margin). Runs via existing rAF on `move` + on `moveend` + after initial marker spawn. `.cc-marker` and `.cc-geo-cluster` gain `will-change: transform; contain: layout style` so each marker gets its own GPU layer. `data-cculled` flag de-dupes redundant style writes. Marker objects stay in `markersRef`/`placeMarkersRef` so deconfliction, leader-lines and bubble expansions remain intact.
- **Full DOM-markers → symbol-layer rewrite intentionally deferred** to a dedicated batch — see `.github/DECISIONS.md` Batch 13. Current marker stack is load-bearing for clustering tiers, click-to-expand, SVG leader lines, per-marker temporal opacity. Not appropriate to bundle with a perf hotfix.
- **+4 new tests** for the pruner (layer removal, off-toggle respected, raster safety, `getStyle` throw safety).

✅ **Quality gate (Batch 13):** tsc 0 errors · vitest 78 files / **701 tests passing** · `next lint --dir src` clean.

**Out-of-band action required from user:** update `NEXT_PUBLIC_MAPTILER_STYLE` in Vercel → Settings → Environment Variables for **Production** and **Preview** to the new "Lite" style UUID once you're happy with the local Lite style. `.env.local` already updated.

**How to verify locally:**
1. `npm run dev`, open the map. Markers should pop in/out only at the viewport edge (+10% margin) during panning — never inside the visible area.
2. Set `NEXT_PUBLIC_MAP_PRUNE=off` in `.env.local`, restart dev. Map now shows POIs / buildings / transit again → easy A/B comparison.
3. Devtools → Performance panel during a pan: composite layers count for `.cc-marker` should match visible-marker count, not total-marker count.

---



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

> **Priority order is now canonical in `.audit/QUEUE.md` (Priority Order table, P1–P8).** Use `/audit-fix N` to apply the next N surfaces in that order, `/audit-fix <surface>` for a single row, or `/audit-fix all`. P1–P2 are flagged "Solo" — apply one at a time so each `get_advisors` delta is inspectable. Report-only (no-patch) findings live in the Polish Queue → `/audit-polish N`.

- ✅ **middleware-and-session** — clean (patch applied Batch 7a, audited 2026-05-15)
- ✅ **api-surface** — clean (patches applied Batch 7a, audited 2026-05-15)
- ✅ **auth-and-signup** — shipped `e38fca5` (2026-05-23). PostgREST filter-injection on `/api/indemnity?applies_to=` closed (allowlist guard validates against `events|places|both` before reaching `.or()` filter); `LoginForm` now honours middleware's `?redirect=` param via `safeRedirect()` (rejects `//`, `\\`, `:`) threaded through to `<OAuthButtons />`. Advisors 83 → 83 (code-only). Architect/security inline ✅ ship as-is. 4 Report-only items deferred to a future polish batch (indemnity full_name 200-char cap, password minimum to 8+, PhoneAuthForm shadcn parity, test coverage for callback/forgot/reset pages).
- ✅ **admin** — Gate 1 fix applied (categories admin write RLS, migration 083, Studio-applied + committed fbafb60). 8 Report-only observations remain in checkpoint. Next: verify with `mcp_supabase_execute_sql` + `mcp_supabase_get_advisors` in a session where MCP is connected. Checkpoint: `.audit/surfaces/admin.md`.
- 🟡 **[P1] edge-functions** — 4 staged fixes (audited 2026-05-22), run `/audit-fix edge-functions`. Checkpoint: `.audit/surfaces/edge-functions.md`. Patches: rsvp-reminders attending-only filter, event-reminder attending+pref filter, review-prompt attending-only, push payload type union widening.
- 🟡 **[P2] event-create-edit** — 2 staged fixes (audited 2026-05-22), run `/audit-fix event-create-edit`. Checkpoint: `.audit/surfaces/event-create-edit.md`. Patches: boundary validation (title/coords/end-after-start), surface delete errors in EditEventForm.
- 🟡 **[P4] messaging-dm** — 3 staged fixes (audited 2026-05-22), run `/audit-fix messaging-dm`. Checkpoint: `.audit/surfaces/messaging-dm.md`. Patches: `.maybeSingle()` parity for participant/recipient/cursor lookups, PATCH /read rate-limit, GET /messages `limit` NaN guard. All low-risk; RLS posture clean.
- ✅ **rsvp-and-comments** — shipped `fa1ac6b` (2026-05-23). CRITICAL `safe_rsvp` IDOR closed (migration 086 — auth.uid() guard + search_path + REVOKE/GRANT); `comments.body` 1..2000 CHECK + user_id index (migration 087); RSVPButton surfaces 409/429/500 via `role="alert"`. Advisors 84 → 83. Architect SE ✅ ship as-is. 6 nice-to-haves logged in checkpoint.
- 🟡 **[P3] place-create-edit-media** — 3 staged fixes (audited 2026-05-16), run `/audit-fix place-create-edit-media`. Checkpoint: `.audit/surfaces/place-create-edit-media.md`. Patches: migration 088 length CHECKs for `places` free-text columns (storage-DoS), migration 089 enforces the 6-month delete window in a BEFORE DELETE trigger (currently client-only and bypassable), shared native-confirm → `ConfirmModal` refactor for EditPlaceForm gallery + CommentSection delete. 6 Report-only items deferred.
- 🟡 **[P5] notifications** — 2 staged fixes (audited 2026-05-22), run `/audit-fix notifications`. Checkpoint: `.audit/surfaces/notifications.md`. Patches: `notifications--bell-revert-on-error.diff` (revert optimistic mark-read/delete on 429/500), `notifications--channel-name-per-user.diff` (per-user realtime channel). 7 Fix-clean already applied inline (4 missing rate-limits across GET/PATCH/DELETE + preferences PATCH, 2 body type guards, `NotificationType` union widened to match DB CHECK).
- ✅ **events-browse** — clean (audited 2026-05-16). 2 Fix-clean applied inline (deleted dead `QuickActionPopup.tsx` — 190 LOC, 0 imports; `.single()` → `.maybeSingle()` on profile preferences). 4 Report-only deferred (1822-LOC `EventsView` split, duplicated detail panel, unbounded reviews/places queries, sequential prefs fetch). Checkpoint: `.audit/surfaces/events-browse.md`.
- ✅ **event-detail** — clean (audited 2026-05-16). 1 Fix-clean applied inline (`.single()` → `.maybeSingle()` on `generateMetadata` event fetch). 3 Report-only deferred (MessageButton hard-codes "Organizer" recipientName, attendee fanout unbounded, `generateMetadata` not sharing `cache(getEventById)`). Checkpoint: `.audit/surfaces/event-detail.md`.
- ✅ **onboarding** — clean / surface obsolete (audited 2026-05-16). Feature was removed; no components, no API route. Residual `profiles.onboarding_completed` column is dead state — recommend Option A (drop column + reads) in a future profile/migration batch. Checkpoint: `.audit/surfaces/onboarding.md`.
- ✅ **profile-and-interests** — clean (audited 2026-05-22). 3 Fix-clean applied inline (`.single()` → `.maybeSingle()` parity on `/profile`, `/profile/[id]` `generateMetadata`, `/api/preferences` profile read). 4 Report-only deferred (regex dedup with `isValidUUID`, early UUID guard on `/profile/[id]`, contributor-locations waterfall, prefs response payload). Checkpoint: `.audit/surfaces/profile-and-interests.md`.
- ✅ **places-browse-and-follow** — clean (audited 2026-05-22). 4 Fix-clean applied inline (`.single()` → `.maybeSingle()` parity on `/places/[id]`, `/places/[id]/edit`, `/places/new` for place + profile-role lookups). 5 Report-only deferred for a future "places polish" batch (`/api/manage/places` rate-limit + FollowPlaceButton error surfacing + ManagePlacesView fetch error state + manage-places SQL aggregate + cross-surface regex dedup). Checkpoint: `.audit/surfaces/places-browse-and-follow.md`.
- 🟡 **[P6] map-core** — 1 staged fix (audited 2026-05-17), run `/audit-fix map-core`. Checkpoint: `.audit/surfaces/map-core.md`. Patch: `map-core--location-picker-abort-and-disclosure.diff` (AbortController on Nominatim reverse-geocode + privacy disclosure copy). EventMap.tsx (1788 LOC) only spot-traced — Tier C Playwright follow-up recommended. 4 Report-only deferred.
- ✅ **storage-and-media-uploads** — shipped `bc83f3c` (2026-05-23). SVG dropped from upload allowlist (XSS on public buckets closed across 8 files); ProfileEditor avatar upload now uses canonical `validateImageFile` + `compressImageIfNeeded` + `safeImageExtension` and writes to `${profile.id}/avatars/${ts}.${ext}` (was RLS-rejected). 703 tests, advisors 83 → 83 (code-only). Architect SE ✅ ship as-is. 4 nice-to-haves folded into Polish Queue row 10 deferred storage-hygiene line: legacy `.svg` purge, shared `IMAGE_ACCEPT` constant, dedicated avatars bucket, `accept=` ordering cosmetic.
- pending: (none — all 17 surfaces audited at least once).
- Tip: P1 → P2 should each be applied **solo** (`/audit-fix 1` twice) so each `get_advisors` delta is attributable. P3–P8 can be batched 2–3 at a time (`/audit-fix 2` or `/audit-fix 3`). Report-only items live in the Polish Queue → `/audit-polish 1` for next surface.
- Full queue + priority table + Polish Queue: `.audit/QUEUE.md`.

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
