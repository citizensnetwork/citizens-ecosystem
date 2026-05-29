# RESUME_HERE — Citizens Connect

> **Read this first. Single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.
> **Also read [CLAUDE.md](CLAUDE.md) — auto-loaded standing instructions for every session.**

---

## 1. Project at a glance

- **Citizens Connect** — map-first Christian community discovery (events, places, Contributors).
- Stack: Next.js 15 App Router (RSC) + TypeScript + Supabase + MapLibre GL JS + MapTiler Cloud + Tailwind CSS v4 + Capacitor (iOS/Android).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked direction: `.github/MASTER_DIRECTION.md`.**

---

## 2. What just shipped — Optional hardening: `log_search_term` lockdown + real XLSX exports

**Picked up the two non-blocking hardening items from the old §4 backlog** (search-term
poisoning vector + CSV-with-xlsx-MIME fallback). `tsc 0`, lint clean, **790/790 tests**
(88 files, +10 vs Stage L).

### Search-term hardening — Migration 118 ([118_lock_log_search_term_to_service_role.sql](supabase/migrations/118_lock_log_search_term_to_service_role.sql))
- `log_search_term(text)` is now **REVOKEd from anon + authenticated** and **GRANTed to
  `service_role` only**. This removes the documented direct-RPC autocomplete/top-10 poisoning
  vector (anyone with an anon key could previously call it in a loop).
- [ai-search/route.ts](src/app/api/ai-search/route.ts) now invokes it through the
  **service-role admin client** (`createAdminClient`) inside a try/catch fire-and-forget block.
  Because `POST /api/ai-search` is already rate-limited **per-IP and per-user**, that endpoint is
  now the single throttled write path into `search_term_stats`. Search never breaks if the
  service key is absent (logs + continues). Anonymous-search logging behaviour is preserved.
- Read side unchanged: `get_search_autocomplete` stays anon+auth (escaped, read-only),
  `get_top_search_terms` stays authenticated.

### Real XLSX exports — [xlsx.ts](src/lib/analytics/xlsx.ts) (new, zero-dep OOXML writer)
- New `buildXlsx(sheetName, header, rows)` produces a **genuine `.xlsx`** (Content_Types + rels +
  workbook + one worksheet) that Excel/Numbers/Sheets open natively. Replaces the old
  CSV-body-with-xlsx-MIME fallback in **both** export endpoints
  ([analytics export](src/app/api/contributor/[handle]/analytics/export/route.ts) +
  [suggestions export](src/app/api/admin/suggestions/export/route.ts)).
- **Why hand-rolled, not SheetJS:** we only *write*, never parse, so SheetJS's parse-path CVEs
  (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS) don't apply — and the fixed SheetJS
  builds aren't on npm anyway. exceljs would drag a large dep tree for a tiny job. Matches the
  existing zero-dep `csv.ts` philosophy. **(Open to swapping to SheetJS/exceljs if a customer
  needs richer workbooks — flagged for the user.)**
- Implementation: STORED (uncompressed) ZIP + CRC-32 + **inline strings**. Inline strings are
  never evaluated as formulas, so the CSV formula-injection neutraliser is deliberately NOT
  applied on the xlsx path (it would corrupt data); the CSV path keeps `neutraliseFormula`.
  Numbers written as numeric cells via `Number.isFinite` guard.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **790/790 passed** (88 files; +10: 10 xlsx unit tests + 1 ai-search
  admin-log-path test; −1 net from reworking the suggestions xlsx test to assert a real workbook)
- `npx next lint --dir src` → clean
- Sec audit (self): **CLEAN.** Service-role key stays server-side (never shipped to browser);
  xlsx is write-only (no parse-path CVE surface) + XML-escaped + strips illegal control chars;
  export access control/rate-limit/`no-store` unchanged; `workbook.buffer` is full-width
  (`Uint8Array.from`) so no adjacent-memory leak.

### Operator action
None new. (The Stage-L/H backfill below is still the only pending operator step.)

---

## 2-prev. Previously shipped — Stage H follow-ups + Stage L (search term analytics)

**Completed the final two queued items of the contributor-dashboard plan.** This closes out every stage (A–L) plus the deferred Stage H follow-ups. `tsc 0`, lint clean, **780/780 tests** (87 files, +11 vs Stage K).

### Stage H follow-ups — Migration 116 ([116_analytics_sources_and_vision_snapshot.sql](supabase/migrations/116_analytics_sources_and_vision_snapshot.sql))
- **`rsvp_cancellations`** + **`shares`** source-of-truth tables (RLS, indexes). Both populated at the **app layer** (no triggers — a `BEFORE DELETE` trigger on `rsvps` can't tell a user un-RSVP from event-teardown CASCADE).
- **Aggregator v2**: `aggregate_contributor_analytics_daily` now also writes `cancellations` (per event) and `shares` (per event / place / contributor), REPLACE-not-increment like the existing metrics.
- **Vision snapshot wired**: the migration-110 NOTICE stub is rewritten into a real materialiser that builds nested per-contributor rollups (`totals` + `places[]` + `events[]`, A17) into a new **`contributor_analytics_snapshots`** table (A21 — Vision pulls from it; no external HTTP). Yearly cron (Jan 1 03:30 UTC). Param gained `p_year` default; old zero-arg dropped.
- `purge_old_analytics()` extended to trim raw cancellation/share logs at 90 days.

### Stage H wiring (app)
- **`DELETE /api/rsvp`** ([rsvp/route.ts](src/app/api/rsvp/route.ts)) logs `rsvp_cancellations` on a genuine un-RSVP (`.select("id")` guard — never on a no-op delete).
- **`POST /api/shares`** ([shares/route.ts](src/app/api/shares/route.ts)) — best-effort, anon-allowed, rate-limited by user/IP, entity_type allowlist + UUID validation.
- **`logShare`** helper ([logShare.ts](src/lib/analytics/logShare.ts)) wired into `ShareButton` (place), `SocialShareButtons` (event), `ConsiderBadge` (event — native/WhatsApp/copy paths). `EventDetailContent` + `PlaceDetailServer` pass entity props.

### Stage L — Search term analytics — Migration 117 ([117_search_term_analytics.sql](supabase/migrations/117_search_term_analytics.sql))
- **`search_term_stats`** — anonymised `(term, day)` rolling aggregate, **no `user_id`** (A65). **No RLS policies** — access is RPC-only.
- **`log_search_term(text)`** SECURITY DEFINER sanitises server-side; `POST /api/ai-search` fires it best-effort for every search (incl. anonymous).
- **`get_top_search_terms`** (authenticated) → dashboard "Top searches this month" panel (A64) in [AnalyticsDashboardClient.tsx](src/components/contributor/dashboard/AnalyticsDashboardClient.tsx).
- **`get_search_autocomplete`** (anon+auth, A66) merges contributor keywords (ranked first) + popular recent terms, LIKE-metachar-escaped prefix.
- **`GET /api/search/autocomplete`** ([autocomplete/route.ts](src/app/api/search/autocomplete/route.ts)) + a debounced combobox dropdown in the global search bar ([EventsView.tsx](src/components/events/EventsView.tsx)).
- 180-day retention via `purge_old_search_terms()` (weekly cron).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **780/780 passed** (87 files, +11: shares, autocomplete, rsvp-cancellation)
- `npx next lint --dir src` → clean
- Sec audit (self): shares anon-allowed but RLS blocks user-id forgery + polymorphic entity_id only aggregates real owned entities; cancellation log gated by `.select("id")` + `user_id=auth.uid()`; all new RPCs SECURITY DEFINER with clamped inputs + LIKE-escaping; snapshot table read-only RLS, function service-only; search-term inputs sanitised in Postgres (non-XSS). **Accepted residual**: anon `log_search_term` direct-RPC poisoning of autocomplete/top-10 (low-severity, sanitised, curated keywords outrank) — hardening path documented in the plan DECISIONS log.

### Operator action (post-deploy)
After applying migrations **116 + 117**: run from psql with service_role to hydrate the last 90 days (now incl. cancellations/shares for already-logged rows):
```sql
SELECT * FROM public.backfill_contributor_analytics(90);
```

---

## 2-prev. Previously shipped — Stage K: Handle change rule (1/30d + admin override)

**Completed Stage K of the contributor-dashboard plan**: contributor `handle` (slug) is now editable from the Settings dashboard with a server-enforced 30-day cooldown, an admin-only override that bypasses the cooldown via SECURITY DEFINER RPC, and warning copy + a two-click confirm gate on the UI.

### Migration 115 ([115_contributor_slug_change.sql](supabase/migrations/115_contributor_slug_change.sql))
- `admin_change_contributor_slug(p_contributor_id uuid, p_new_slug text, p_reason text)` SECURITY DEFINER RPC. Server-side admin role re-check (defence-in-depth — SECURITY DEFINER alone is not enough), server-side regex format guard (`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$`), uniqueness via existing `profiles_contributor_slug_key` partial index translated to a clean `slug_taken` (23505) exception. Writes `admin_actions` (canonical admin trail) AND `activity_log` (admin-on-behalf attribution) atomically with the UPDATE. REVOKE from anon/public; GRANT to authenticated only.

### Backend ([slug/route.ts](src/app/api/contributor/[handle]/slug/route.ts))
- PATCH `/api/contributor/[handle]/slug` with `{ new_slug, reason? }`.
- Owner path: API enforces 30-day cooldown from `profiles.handle_changed_at`; on success, atomically writes new slug + updates timestamp + records activity via `recordContributorMutation`.
- Admin path: requires non-empty `reason`, delegates to the RPC; Postgres exception codes mapped 23505→409, 42501→403, 22023→400.
- Rate-limited via `RATE_LIMITS.mutation`. UUID/format guard at the API matches the regex inside the RPC so a compromised admin session cannot inject arbitrary strings.
- Per A62: no legacy-handle redirect — old handles stop resolving the instant the write commits. Client hard-navigates to `/c/{new}/dashboard/settings`.

### UI ([SettingsDashboardClient.tsx](src/components/contributor/dashboard/SettingsDashboardClient.tsx) + [settings/page.tsx](src/app/c/[slug]/dashboard/settings/page.tsx))
- New **Public handle** section at the top of Settings (owners and admin-with-grant viewers only).
- Server-computed `handleCooldownDaysRemaining` so the disabled state and the cooldown banner are correct on first paint (no client flash).
- Constrained input (`[a-z0-9-]` only, 40-char cap) with `/c/` prefix decoration. Two-click confirm flow with the exact A61 copy: *"This will break any existing links to your profile. Are you sure?"*
- Admin-with-grant viewers see a reason textarea (required); button label switches to "Override handle".

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **769/769 passed** (84 files, +10 tests vs Stage J)
- `npx next lint --dir src` → clean
- Sec audit (self):
  - RPC SECURITY DEFINER but re-checks admin role inside Postgres; format regex enforced both in RPC and API; UNIQUE INDEX still authoritative for collisions.
  - Owner path can never trigger admin behaviour (`isAdminWithAccess && !isOwner` gate).
  - API rate-limited; reason field control-char stripped and length-capped (500).
  - UI confirm gate; input character allowlist defends against client-side experimentation; redirect uses `encodeURIComponent` even though slug is already constrained.
  - `recordContributorMutation` handles admin-on-behalf attribution automatically when the admin (rather than owner) drives the change.

---

## 2-prev. Previously shipped — Stage J: Suggestion polish + admin inbox + CSV-injection hardening

**Completed Stage J of the contributor-dashboard plan**: admin suggestion inbox UI, dedicated `suggestion_response` notification type, CSV/XLSX export, glass-panel composer polish, and a security-driven fix to CSV formula injection (covers both Stage J's new export and the pre-existing Stage H analytics export).

### Migration 114 ([114_suggestion_response_notification.sql](supabase/migrations/114_suggestion_response_notification.sql))
- Extends `notifications_type_check` to include `suggestion_response`. Replaces the prior hack where the PATCH route reused `contributor_approved` to notify submitters.

### Backend ([suggestions/[id]/route.ts](src/app/api/suggestions/[id]/route.ts))
- Notification insert now uses `type: "suggestion_response"` with `data: { suggestion_id, status }`. No `data.url` field — there is no meaningful destination page for the submitter, and the body conveys the outcome.

### Admin inbox UI ([admin/suggestions/page.tsx](src/app/admin/suggestions/page.tsx) + [SuggestionsManager.tsx](src/components/admin/SuggestionsManager.tsx))
- Mirrors `/admin/reported` UX: status tab nav (Open / In review / Actioned / Declined), server-fetched list capped at 100 rows, client manager component for status updates and inline written response.
- **Origin-safe page-URL rendering** — `page_url` is parsed via `new URL(rawUrl, window.location.origin)`; only same-origin URLs render as Next `<Link>` (pathname + search + hash only). External URLs collapse to plain `(external)` text. Raw URL appears only in the `title` attribute. Eliminates phishing risk of clicking an attacker-supplied href on an admin surface. The check runs in a post-mount `useEffect` to avoid SSR/CSR hydration mismatch.
- **CSV / XLSX export buttons** in the tab nav linking to the new export endpoint.

### Export endpoint ([admin/suggestions/export/route.ts](src/app/api/admin/suggestions/export/route.ts))
- GET `/api/admin/suggestions/export?format=csv|xlsx&status=open|in_review|actioned|declined|all`
- Admin-only (role check via `profiles`), rate-limited via `RATE_LIMITS.heavy`, `Cache-Control: no-store`.
- Stage H precedent: CSV body served with xlsx MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) for the `xlsx` format. Zero new deps.
- Hard cap 5000 rows.
- Filename sanitised via `sanitiseExportFilename`.

### CSV formula injection hardening ([admin/suggestions/export/route.ts](src/app/api/admin/suggestions/export/route.ts) + [analytics/csv.ts](src/lib/analytics/csv.ts))
- **Self-audit finding**: a malicious submitter could put `=cmd|'/c calc'!A0` (or `@SUM(...)`, `+...`, `-...`) in a suggestion title; when an admin opens the CSV in Excel/Sheets, the formula would execute.
- Added `neutraliseFormula()` that prefixes values starting with `=`, `+`, `-`, `@`, TAB, or CR with a single quote so spreadsheet apps render the literal text.
- Applied to **both** the new suggestions export (Stage J) **and** the pre-existing analytics export (Stage H, shipped without this protection) — per CLAUDE.md item 3, no broken code left unaddressed.

### Admin home wiring ([admin/page.tsx](src/app/admin/page.tsx))
- New "Open suggestions" stat card with emphasis when count > 0.
- New tools-grid tile linking to `/admin/suggestions`.
- Grid layout bumped `lg:grid-cols-5` → `lg:grid-cols-6` to accommodate the 6th stat card.

### Composer polish ([SuggestionButton.tsx](src/components/ui/SuggestionButton.tsx))
- Glass-panel treatment: `bg-white/90 backdrop-blur-md` + gold inset ring + existing 2xl rounded card.
- **Trigger-context preview**: post-mount effect reads `window.location.pathname + search` and renders a small italic "Submitted from <path>" line above the submit button. Builds submitter trust by confirming the platform knows which page their feedback is about (satisfies A57 "capture surface / URL / page / event / place").

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **759/759 passed** (83 files, +1 file +14 tests vs prior)
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- Sec audit (self):
  - PATCH notification uses dedicated type, no `data.url` injection vector.
  - Admin export role-gated, rate-limited, filename sanitised, formula-injection neutralised.
  - Admin inbox renders submitter-supplied URLs through origin allowlist; external URLs never rendered as `href`.
  - `safeInternalPath` returns null on SSR + before-mount to avoid hydration mismatch.
  - Suggestion POST input still: 10/day rate limit, control-char strip, `^https?://` page_url validation, 3+/10+ length minima.
  - Anonymous submissions still allowed (`user_id IS NULL OR user_id = auth.uid()` RLS from migration 100b).

### Operator action
None required — migration 114 is a pure enum extension; deploy + apply.

---

## 2-prev. Previously shipped — Stage G.2 + Stage H optional + Stage I (commit `847f3b8`)

**Completed three Stages in one batch**: full atomic owner transfer (G.2 follow-up), historic analytics backfill RPC (H optional), and expandable Planning cards with structured fields (I).

### Migration 111 ([111_team_owner_transfer_atomic.sql](supabase/migrations/111_team_owner_transfer_atomic.sql)) — Stage G.2
- `team_owner_transfers` table — proposal record with status (`pending|accepted|declined|cancelled`), one pending per contributor enforced by partial unique index. RLS read-only to contributor/transferee/proposer/admins; **all writes flow through SECURITY DEFINER RPCs**.
- **Backfill**: every approved contributor profile gets a self-owner `team_memberships` row (`member_id=contributor_id, role='owner', status='active'`) via idempotent INSERT … ON CONFLICT DO UPDATE.
- **Trigger** `ensure_contributor_self_owner` on `profiles` — fires when `contributor_status` transitions to `'approved'`. SECURITY DEFINER so admin approval RLS doesn't block. **Guarded against re-promotion** if another active owner already exists (prevents two-owners-after-re-approval edge case).
- `propose_team_owner_transfer(p_contributor_id, p_proposed_owner_id)` RPC — validates `auth.uid()` is the active owner per `team_memberships`; validates transferee is an active non-owner member; cancels any prior pending proposal before insert. Notifies the transferee + writes activity_log.
- `respond_team_owner_transfer(p_transfer_id, p_action)` RPC — `auth.uid()` must equal `proposed_owner_id` and status must be `pending` (FOR UPDATE locks the row). On accept: **atomic demote of prior owner to 'editor' + promotion of acceptor to 'owner'** in a single function body. Notifies both parties + activity_log. Defensive `no_current_owner` raise if no owner row found.
- All RPCs REVOKE from anon/public; GRANT to authenticated only.

### `checkDashboardAccess` refactor ([access.ts](src/lib/dashboard/access.ts))
- `isOwner` now sourced from `team_memberships.role='owner' AND status='active' AND member_id=auth.uid()`.
- Self-id check (`user.id === contributor.id`) retained as a defensive fallback only — should be unreachable in steady state because the trigger covers all future approvals.
- Same refactor applied in [team/page.tsx](src/app/c/[slug]/dashboard/team/page.tsx) and [settings/page.tsx](src/app/c/[slug]/dashboard/settings/page.tsx) for their independent `viewerIsOwner` computations.

### Backend wiring ([team/route.ts](src/app/api/contributor/[handle]/team/route.ts))
- `propose_owner_transfer` action now delegates to the `propose_team_owner_transfer` RPC. Postgres exception codes mapped to 403/400/500. Dead helper `sendOwnerTransferNotification` removed.
- [`team-invites/route.ts`](src/app/api/team-invites/route.ts) — GET returns `{ invites, owner_transfers }`. POST accepts `kind: "invite" | "owner_transfer"` to route to the correct RPC.

### UI ([TeamInvitesClient.tsx](src/components/team/TeamInvitesClient.tsx) + [team-invites/page.tsx](src/app/account/team-invites/page.tsx))
- Renders a dedicated "Ownership transfers" section (gold-tinted border + "Owner transfer" pill) above the regular team invites. Accept/decline buttons POST to `/api/team-invites` with `kind: "owner_transfer"`.
- Empty state copy widened to mention transfers.

### Migration 112 ([112_backfill_contributor_analytics.sql](supabase/migrations/112_backfill_contributor_analytics.sql)) — Stage H optional
- `backfill_contributor_analytics(p_days_back integer DEFAULT 90)` SECURITY DEFINER function — loops `aggregate_contributor_analytics_daily` over the last N days (clamped 1..365). Returns `(target_date, rows_written)` rows so operators see per-date progress when invoked interactively.
- Idempotent: underlying aggregator uses REPLACE-not-increment, so re-runs self-correct.
- REVOKE from anon/authenticated/public. **Invoke via psql with service_role**:
  ```sql
  SELECT * FROM public.backfill_contributor_analytics(90);
  ```
- Skips "today's yesterday" (handled by the existing 02:15 UTC daily cron).

### Migration 113 ([113_planning_card_fields.sql](supabase/migrations/113_planning_card_fields.sql)) — Stage I
- `planning_tasks` AND `planning_ideas` each gain: `checklist jsonb`, `links jsonb`, `assigned_place_ids uuid[]`.
- CHECK constraints cap collection sizes (50 checklist · 20 links · 10 places) + enforce `jsonb_typeof = 'array'` so payloads can't sneak in malformed shapes. All columns default to empty so existing rows + existing inserts continue to work.

### Backend wiring ([cardFields.ts](src/lib/planning/cardFields.ts) + tasks/ideas routes)
- New shared validator module `src/lib/planning/cardFields.ts`:
  - `sanitiseChecklist` — strips control chars, length caps text (200), dedupes by id, mints fresh UUID if client supplies a non-UUID id (blocks injected external refs), caps at 50 items.
  - `sanitiseLinks` — enforces `^https?:\/\/` (blocks `javascript:` / `data:` schemes), length caps url (500) + label (120), dedupes, caps at 20.
  - `sanitiseAssignedPlaceIds` — UUID-validates, dedupes, caps at 10.
  - `filterContributorPlaceIds(supabase, contributorId, ids)` — server filters down to places this contributor owns, blocking cross-contributor assignment.
- `tasks/route.ts` + `ideas/route.ts` accept the new fields in both POST and PATCH. PATCH supports partial updates so a single checkbox toggle ships only `{id, checklist}`.

### UI ([PlanningDashboardClient.tsx](src/components/contributor/dashboard/PlanningDashboardClient.tsx))
- **Replaced the 3-column kanban with a responsive 2-column expandable card grid**. Same tab switcher (Tasks · Ideas) up top, with counts.
- Each card collapsed shows: title + status pill (tasks) or tag chips (ideas) + visible_to_team chip + assigned-places count. Click expands.
- **Top-right control**:
  - Tasks → binary completion checkbox (circle, green when complete). Toggle flips status pending ↔ completed. Legacy `in_progress` renders as "incomplete" but stays valid server-side.
  - Ideas → delete X.
- **Public toggle** (visible_to_team) sits below the top-right control as a small slide switch.
- Expanded body: description textarea (onBlur save), inline checklist editor (add via Enter, toggle, remove), links editor (url + optional label, validates `^https?:\/\/`), multi-place picker (chips, capped at 10), tag editor (ideas only), due-date row (tasks only), delete button (tasks).
- Server-fetched `places` (contributor-owned only) passed once from the page for the picker.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **745/745 passed** (82 files)
- `npx next lint --dir src` → clean (Next 16 lint deprecation banner only)
- Sec audit (self):
  - **G.2** — All ownership writes go through SECURITY DEFINER RPCs; `auth.uid()` checked server-side; FOR UPDATE locks the transfer row before mutating; partial unique index collapses concurrent proposals to 23505; trigger guarded against double-owner edge case; notification text passes through React default escaping.
  - **H** — Backfill RPC REVOKEd from non-service roles; window clamped to [1,365]; idempotent.
  - **I** — JSONB CHECK constraints cap collection size + enforce array shape at the DB; URL regex blocks non-http schemes; `filterContributorPlaceIds` blocks cross-contributor place assignment; checklist client-supplied ids are UUID-validated and minted fresh otherwise; links rendered with `rel="noreferrer noopener"`.

---

## 2-prev. Previously shipped — Stage H: Analytics depth + export (commit `1e74b92`)

**Completed Stage H of the contributor-dashboard plan**: daily aggregation pg_cron job, public-safe RPC per A19, server-side CSV/XLSX export, public-profile Activity (30d) chips, Vision-export stub.

### Migration 110 ([110_analytics_aggregation_public.sql](supabase/migrations/110_analytics_aggregation_public.sql))
- `aggregate_contributor_analytics_daily(p_target_date date)` SECURITY DEFINER — idempotent rebuild of `contributor_analytics` for one calendar date. Pulls counters from `events`, `rsvps` (attending), `consider_joins`, `comments`, `convinces`, `event_views`, `reports`, `broadcast_messages`, `follows`, `place_follows`, `places`. ON CONFLICT REPLACE (not increment) so re-runs self-correct. REVOKE from anon/authenticated/public — service_role / pg_cron only.
- `get_public_contributor_analytics(p_contributor_id uuid, p_days integer)` SECURITY DEFINER — returns aggregated `(metric, total)` rows for the public-safe metric allowlist (`follows`, `joins`) only. `p_days` clamped to [1, 365]. Returns rollups across all `entity_type`s so callers can't enumerate per-event/per-place activity. GRANT EXECUTE to anon + authenticated.
- `snapshot_contributor_analytics_for_vision()` — Stage H plan item 5 stub. RAISE NOTICE only; Vision endpoint wired in a follow-up. REVOKE EXECUTE from non-service roles.
- pg_cron schedules: `contributor-analytics-daily` (`15 2 * * *` UTC = 04:15 SAST), `contributor-analytics-purge` (`0 3 * * 0` UTC — calls existing `purge_old_analytics()` for 1-year retention).
- Metrics omitted from daily aggregator (no source table): `cancellations` (rsvps cancel via DELETE not status), `shares` (no shares table). Counters stay at whatever `increment_contributor_metric` writes from app code.

### Backend ([export/route.ts](src/app/api/contributor/[handle]/analytics/export/route.ts))
- GET `/api/contributor/[handle]/analytics/export?format=csv|xlsx&period=…&entity_type=…&entity_id=…`
- Auth via `checkDashboardAccess` (owner OR admin-with-grant). 401 if no user; 403 if no access.
- Whitelists `format`, `period` (7/14/30/60/90/180/365), `entity_type` (`contributor`/`event`/`place`). `entity_id` validated through `isValidUUID`.
- Rate-limited via `RATE_LIMITS.heavy` (5/min) per user — export is heavier than the standard read endpoint.
- CSV body built via `buildAnalyticsCsv` in [csv.ts](src/lib/analytics/csv.ts) — RFC-4180 escaping (comma/quote/CR/LF wrapped, embedded quotes doubled, CRLF row separator). Filename hardened by `sanitiseExportFilename` (strips path separators, control chars, length-capped 80).
- `xlsx` format reuses the CSV body with the spreadsheet MIME so Excel/Numbers open it natively. Zero new deps — plan doc Stage H item 4 explicitly allows this fallback ("…else CSV with `.xlsx` MIME left as TODO").
- `Cache-Control: no-store` prevents intermediary caching of contributor data.

### Backend ([public/route.ts](src/app/api/contributor/[handle]/analytics/public/route.ts))
- GET `/api/contributor/[handle]/analytics/public?period=…` — anon-readable. Resolves slug → contributor id via existing `resolveContributorSlug` helper, calls `get_public_contributor_analytics`. Folds the RPC's `[{metric,total}]` shape into `{ period, totals: {follows, joins} }`. Rate-limited per `user.id ?? handle` (read bucket = 120/min).

### UI ([AnalyticsDashboardClient.tsx](src/components/contributor/dashboard/AnalyticsDashboardClient.tsx))
- Replaced client-built CSV with two `<a>` buttons pointing at `/api/contributor/[handle]/analytics/export` — one for CSV, one for XLSX. Disabled (`opacity-40 pointer-events-none`) when there's no data. Query string built with `URLSearchParams` so encoding is safe.

### UI ([ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) + [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx))
- New `publicAnalytics` prop on `ContributorPublicProfileProps`. `ProfileDetailServer` fetches 30-day totals via `get_public_contributor_analytics` and passes them down.
- Renders an "Activity (30d)" section between Team and Past events when either follows or joins are non-zero. Two glass-pill chips with the formatted totals.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **745/745 passed** (82 files)
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- Sec audit (self): aggregator + Vision stub revoked from non-service roles; public RPC server-enforces metric allowlist + clamps window + aggregates across entities; export endpoint enforces dashboard access + validates entity_id + RFC-4180 escapes CSV + sanitises filename + sets `Cache-Control: no-store` + heavy rate-limit; public endpoint goes through SECURITY DEFINER RPC, no raw query; numeric values rendered via React-escaped `toLocaleString()`.

---

## 2-prev. Previously shipped — Stage G: Team Management UX (commit `028ba7a`)

**Completed Stage G of the contributor-dashboard plan**: 3-search-bar add-member popup, invite flow with accept/decline notification round-trip, owner-transfer proposal (notification-only — full atomic swap deferred), public team list on contributor profile. Also fixed a latent volunteer-notification bug while in the area.

### Migration 109 ([109_team_invite_owner_transfer.sql](supabase/migrations/109_team_invite_owner_transfer.sql))
- `team_memberships.status` CHECK widened: `pending | active | declined | removed` (was `active | removed`).
- `team_memberships.role` CHECK widened: `owner | editor | viewer` (was `editor | viewer`). Only the propose-transfer flow ever creates 'owner' rows; invites are role-restricted to editor/viewer.
- `team_memberships.responded_at timestamptz` (NULL while status='pending').
- `notifications.type` CHECK extended: `+team_invite, +team_invite_response, +team_owner_transfer, +volunteer_application, +volunteer_application_response`. (Volunteer types added to fix latent 'system' typo — see below.)
- `respond_team_invite(p_membership_id uuid, p_action text)` SECURITY DEFINER RPC — member-side accept/decline. Validates `auth.uid()=member_id` + `status='pending'`, writes notification back to contributor, appends activity_log row. REVOKE/GRANT to authenticated only.
- `get_public_team(p_contributor_id uuid)` SECURITY DEFINER RPC — returns `member_id, full_name, avatar_url, role` for active rows only. Granted to anon+authenticated. Keeps email/invited_by/created_at private while exposing the safe display columns for the public profile.

### Backend ([team/route.ts](src/app/api/contributor/[handle]/team/route.ts))
- **POST `action: "search"`** — accepts `name`, `email`, `user_id` independently (any combination). Each field fires a scoped ILIKE/eq query in parallel; results merged via Map dedupe, capped at 20. `sanitiseLike()` strips `%_\` wildcards + control chars to neutralise LIKE injection. UUID-validated. 3+ char minimum on partial email search.
- **POST `action: "invite"`** — creates `team_memberships` row with `status='pending'`. Pre-flight existence check returns 409 for active/pending; allows re-invite over declined/removed rows via upsert on `(contributor_id, member_id)`. Service-role notification insert (notifications RLS insert is admin-only) with `type='team_invite'` and `data.url='/account/team-invites'`. Best-effort: notification failure logged but doesn't fail invite. `recordContributorMutation` writes activity_log.
- **POST `action: "propose_owner_transfer"`** — gated on `access.isOwner` (excludes admin-with-grant impersonation). Proposed transferee must be an active team member. Notification-only this batch: `type='team_owner_transfer'` to the proposed owner with deep link to `/account/team-invites`. No schema swap — accepting just dismisses the notification. Full atomic ownership swap deferred until a follow-up reworks the `user.id === contributor.id` access model.

### Backend ([team-invites/route.ts](src/app/api/team-invites/route.ts))
- **GET** — lists `auth.uid()`'s pending team_memberships joined to contributor profile.
- **POST** — `{membership_id, action: "accept" | "decline"}` → delegates to `respond_team_invite` RPC. Maps Postgres exceptions to 404/403/400.

### UI ([AddTeamMemberPopup.tsx](src/components/contributor/dashboard/AddTeamMemberPopup.tsx))
- New glass-overlay popup with 3 labelled search fields (name, email, user_id). Auto-focuses name. Escape closes. Results render with avatar + name + email + Invite-as-Editor / Viewer buttons. Inline error band, optimistic add to parent.

### UI ([TeamDashboardClient.tsx](src/components/contributor/dashboard/TeamDashboardClient.tsx))
- Single search input replaced with "+ Add team member" button → popup.
- Members split into **Pending invites** (cancel button) and **Active members** sections.
- "Make owner" button on active member rows, visible only when `viewerIsOwner` (server-computed from `user.id === contributor.id`).
- New `viewerIsOwner` prop wired from [team/page.tsx](src/app/c/[slug]/dashboard/team/page.tsx).

### UI ([account/team-invites/page.tsx](src/app/account/team-invites/page.tsx) + [TeamInvitesClient.tsx](src/components/team/TeamInvitesClient.tsx))
- New `/account/team-invites` route — invitee-side acceptance pane listing pending invites with Accept/Decline. Notifications `type='team_invite'` deep-link here via `data.url`.

### UI ([ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) + [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx))
- New **Team** section on the public contributor profile. Server-fetched via `get_public_team` RPC, rendered as avatar+name chips. Owner chip prefixed with a gold "OWNER" tag.

### Drive-by fix — volunteer notifications
- `volunteers/route.ts` was inserting `type:"system"` (not in CHECK) and `link:null` (column doesn't exist). Silent failures. Migrated both inserts to use the new `volunteer_application` / `volunteer_application_response` types (added in 109) with `data.url` deep-links. Routed through `createAdminClient()` (notifications RLS insert is admin-only).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- `npx vitest run` → **745/745 passed** (82 files)
- Sec audit (self): LIKE-injection neutralised; role enum restricts owner via invite; propose_owner_transfer gated on real owner only; RPCs validate `auth.uid()` server-side; public RPC exposes only safe columns; notification body uses React-escaped text (no XSS); concurrent invite race collapsed by `(contributor_id, member_id)` UNIQUE.

---

## 2-prev2. Previously shipped — Full Messaging System + Vibe-Security Audit

**Completed all 12 steps of the messaging product plan + ran a full vibe-security audit, fixing 2 HIGH and 2 MEDIUM findings.** Multi-session effort. `tsc 0`, lint clean, **745/745 tests**.

### Step 1 — DB Schema ([107_messaging_permission_model.sql](supabase/migrations/107_messaging_permission_model.sql))
- `conversations.status` enum (`pending | active | rejected`, default `active`)
- `user_blocks` table with RLS (own blocks only) + `is_blocked()` SECURITY DEFINER bilateral check
- `conversation_participants.muted_at` (timestamptz, suppresses push)
- `messages.deleted_at` (soft-delete display window for retention purge)
- `profiles.handle` (`^[a-z0-9_]+$`, 3-30 chars, partial unique index)
- `profiles.discoverable` (boolean default false, opt-in attendee visibility)
- `profiles.muted_source_ids` (jsonb array — broadcast source mutes)
- `profiles.deleted_at` (soft-delete; 30-day message retention thereafter)
- Extended `reports.target_type` to include `'conversation'`
- Extended `notifications` type CHECK to include `spam_flag, broadcast_flood, dm_received, dm_response`
- Updated `find_or_create_conversation(user_a, user_b, p_status DEFAULT 'active')` SECURITY DEFINER
- pg_cron `messaging-purge-60d` (03:00 daily): 60d active, 30d soft-deleted account purge

### Step 2 — Permission Rules ([src/app/api/conversations/route.ts](src/app/api/conversations/route.ts))
- Citizen↔Citizen: always `active`
- Citizen→Contributor: always `active`
- Contributor→Citizen with prior RSVP/follow/place_follow: `pending` (request)
- Contributor→Citizen with NO prior interaction: 403 blocked
- Either party blocked: 400 (via `is_blocked` RPC)
- All gating via Promise.all for parallelism

### Step 3 — Request UX ([MessageRequestCard.tsx](src/components/messaging/MessageRequestCard.tsx))
Pending-state card with Allow/Deny → PATCH `/api/conversations/[id]` with `action: 'accept' | 'reject'`. Per-button loading state.

### Step 4 — Floating panel ([MessagesPanel.tsx](src/components/messaging/MessagesPanel.tsx))
- Anchored `top-14 right-4 z-[9999]`, w-360px, max-h 50vh
- `bg-white/90 backdrop-blur-sm` + gold inset shadow tint
- Sort: pending first, then by `updated_at`
- Inline ChatView when row selected (back arrow returns to list)
- Hover-revealed ConversationCardActions on each row
- Realtime: subscribes to messages INSERT + conversations UPDATE
- Backdrop click closes panel

### Step 5 — Navbar badge ([Navbar.tsx](src/components/ui/Navbar.tsx))
Wraps message icon with unread count badge (same pattern as NotificationBell). Click toggles MessagesPanel.

### Step 6 — MessageButton placements (small `variant="icon"`)
- [EventDetailContent](src/components/events/EventDetailContent.tsx) — near organiser card
- [PlaceDetailServer](src/components/places/PlaceDetailServer.tsx) — owner block
- [ContributorPublicProfile](src/components/contributor/ContributorPublicProfile.tsx) — restored

### Step 7 — [ConversationCardActions](src/components/messaging/ConversationCardActions.tsx)
Mute/unmute · Delete (confirm) · Report (reason picker) · Block (confirm + auto-delete). Browser `confirm()` for destructive (acceptable MVP).

### Step 8 — Spam detection ([api/conversations/[id]/messages/route.ts](src/app/api/conversations/[id]/messages/route.ts))
On message POST: count sender's messages in last 60s; if ≥5, **allow send** but fire-and-forget upsert into `reports` with `onConflict: 'reporter_id,target_type,target_id', ignoreDuplicates: true`. Never blocks legit traffic.

### Step 9 — Broadcast flood detection ([notify-broadcast/index.ts](supabase/functions/notify-broadcast/index.ts))
On each broadcast: count broadcasts from source in last 7d; if >15, insert admin `broadcast_flood` notification. Uses service client (correct for fan-out).

### Step 10 — Contributor digest ([send-contributor-digest/](supabase/functions/send-contributor-digest/index.ts) + [108_contributor_digest_cron.sql](supabase/migrations/108_contributor_digest_cron.sql))
- Counts new RSVPs, followers, place_follows, volunteer_applications, DMs in last 3 hours per approved contributor
- pg_cron schedule `0 7,10,13,16,19 * * *` UTC = 09/12/15/18/21 SAST
- Skip if no activity. Reuses `event_update` notification type (`data.digest=true`) to avoid CHECK constraint expansion.
- Bearer auth guard at function entry.

### Step 11 — Citizen discovery
- @handle opt-in in [ProfileDiscoverySettings](src/components/profile/ProfileDiscoverySettings.tsx). Resolves `/profile/[handle]` or fallback to UUID.
- "Copy profile link" on profile pages.
- "People attending" chips on event detail (only `discoverable=true` RSVPers; only visible to fellow RSVPers).

### Step 12 — Deleted-account display
`profiles.deleted_at IS NOT NULL` → sender name rendered as ~~strikethrough~~ in [ChatView](src/components/messaging/ChatView.tsx) + MessagesPanel. Message body retained 30 days per pg_cron retention.

### Vibe-Security Audit — 4 findings, all fixed
1. **HIGH** — PATCH `accept`/`reject` had no recipient verification: contributor could auto-approve their own pending request via direct API call.
   **Fix** ([conversations/[id]/route.ts](src/app/api/conversations/[id]/route.ts)): Two parallel counts (total messages, user's own messages). If user has sent any message in this conversation OR there are 0 messages total → 403. Works because in pending state only the initiator sends. No schema change.

2. **HIGH** — `send-contributor-digest` used nested `.in("conversation_id", supabase.from(...).select(...))` — Supabase JS doesn't support nested subqueries; silently returned 0 DM counts.
   **Fix**: Pre-fetch `convIds` as array BEFORE Promise.all, then `.in("conversation_id", convIds)` properly.

3. **MEDIUM** — Digest missing `.is("deleted_at", null)` on contributors query.
   **Fix**: Added the filter so soft-deleted accounts don't get digests.

4. **MEDIUM** — Digest had no auth guard.
   **Fix**: `Authorization: Bearer ...` required at function entry. pg_cron path (migration 108 passes anon key) keeps working.

### Standing instructions persisted
[CLAUDE.md](CLAUDE.md) created at project root — auto-loaded every session. Contains the 7-point operating ruleset (start with RESUME_HERE, compact often, no broken code left alone, ask questions, A+ quality, vibe-security check, push+update+report).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx next lint --dir src` → **clean** (only the Next 16 deprecation notice for the lint command itself)
- `npx vitest run` → **745/745 passed** (82 files)

---

## 2a. Previous batch — Quality Gate Fixes (commit `d116ea5`)

**Committed + pushed 2026-05-28.** Resolved TS build errors introduced by stage-f.

Files changed:

- `src/lib/quickPanelOptions.ts` — added `specialFilter?: "volunteer"` to `QuickAccessItem` type (was missing from HEAD; `EventsView.tsx` referenced it)
- `src/lib/quickPanelPrefs.ts` — default quick-panel IDs updated; count 4→5; replaced `"outreaches"` with `"where-to-serve"`
- `src/lib/categoryIcons.ts` — added `"where-to-serve": "heart-handshake"` to `QUICK_ACCESS_ICON_IDS`

**Quality gate on `d116ea5`:**

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **82 files, 745 tests, all passing**
- `npx next lint --dir src` → **Exit 0, clean**

---

## 2b. Previous batch — Stage F: Volunteers UX (commit `e3c401d`)

**Completed Stage F of the contributor-dashboard plan**: citizen volunteer apply/withdraw flow + contributor approve/decline with reason.

### New component: `VolunteerApplyButton`
- Citizen CTA rendered on event/place detail pages when `volunteer_openings=true` and `organiserHandle` is available.
- States: none (CTA) → form (optional message, 500-char, char counter + aria-live) → submitting → status badge.
- Status badges: pending=amber, approved=green, declined=gray ("Not selected"), withdrawn=silent.
- Withdraw: POST `action=withdraw` → `status=withdrawn`; gated by `applicant_id=user.id` + status in `[pending, approved]`.
- Login gate: Link to /login when `userId=null`. Owner guard: returns null when `isOwner=true`.

### API changes (`volunteers/route.ts`)
- `withdrawn` added to `ALLOWED_STATUSES`.
- New `withdraw` action: UUID validation + ownership check (`applicant_id = user.id`) + status gate + DB update.
- `update_status`: reads + sanitizes `response_message` from body; includes it in `.update()` when present.

### EventDetailServer + EventDetailContent
- `EventDetailServer` fetches user's volunteer application (`maybeSingle`) when `volunteer_openings && user`.
- Passes `volunteerStatus`, `volunteerApplicationId`, and `organiserHandle` (contributor_slug) to `EventDetailContent`.
- `EventDetailContent` renders `VolunteerApplyButton` after LocationSharingToggle when `volunteer_openings && organiserHandle`.

### PlaceDetailServer
- Added `volunteerAppRes` to the parallel `Promise.all` queries (conditional on `user && volunteer_openings`).
- Replaced static "Volunteer" gold pill with interactive `VolunteerApplyButton`.
- `volunteerStatus` and `volunteerApplicationId` extracted from result.

### TeamDashboardClient
- `Volunteer` interface gains `response_message: string | null`.
- Controlled volunteer list (`volunteerList` state) replaces prop-direct rendering.
- Inline respond form: appears on pending rows; confirm action (approve/decline) + optional message textarea (2 rows, 500-char, `maxLength`).
- Optimistic update: `setVolunteers(prev => prev.map(...))` on success; error displayed via `role="alert"`.
- `response_message` shown on declined rows.
- `STATUS_CLASSES` map for consistent status badge styling.

### team/page.tsx
- Volunteer query changed `.in("status", ["pending", "approved", "declined"])` — includes declined for private contributor view.
- `VolunteerRow` type gains `response_message: string | null`.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (82 files)
- `npx next lint --dir src` → clean
- Architect review: security clean — UUID validation on all IDs, `applicant_id` double-gated in both SELECT and UPDATE for withdraw, `sanitize()` on all user text input.
- Advisors: **86 WARN unchanged**

---

## 2c. Previous batch — Stage D: specialised services + keyword bank (commit `04c3118`)

Migration 106: RLS on `specialised_services` + `contributor_keywords`, length 100→40, allowlist `[A-Za-z0-9 ._-]`, unique constraints. Services API: `sanitiseService()`, NFC-normalize. Keywords API: `sanitiseKeyword()`. `PlacesDashboardClient`: inline chip editor. `SettingsDashboardClient`: corrected filter. 744 tests, tsc 0, lint clean.

---

## 2d. Previous batch — Stage E.2+E.3: broadcast public banners + edge function (commit `c189620`)

`OrgBroadcastList` renders "From the Organiser" banners on event/place detail pages. `notify-broadcast` edge function v2 with correct `_shared/` bundling. `_shared/push.ts`: `broadcast_sent` type + `skipInApp` flag. Migration 105: widens `notifications_type_check`. 744 tests, tsc 0, lint clean.

---

## 3. Current platform state

- 88 test files, **790 tests**, all passing.
- 118 migrations — **all now APPLIED to the live `Citizens-Connect` Supabase project**
  (`xyiajtrvhlxaeplsiajj`). Note: the live DB was silently stuck at 106; this session applied
  the full **107→118** gap via the Supabase MCP (see §2 of this file's batch notes below).
- Analytics **backfill executed** (`backfill_contributor_analytics(90)`, 2026-02-28→05-28).
- Security advisor: **0 errors** (105 informational/by-design lints).
- Latest pushed commit on `main`: optional hardening (search-term lockdown + real XLSX) on top of Stage L.

---

## 4. Next batches queued

**The entire contributor-dashboard plan (Stages A–L + Stage H follow-ups) is now complete.** No further stages are queued from `docs/plans/contributor-dashboard.md`.

~~Outstanding operator action (backfill)~~ — **DONE this session.** All migrations 107→118 are
applied to the live Citizens-Connect DB and `backfill_contributor_analytics(90)` has been run.
No operator DB actions are pending.

> **DB migration discovery (this session):** the live DB's migration tracker was at `106` while
> the repo had files through `118`. Object-level probing showed **107→118 were ALL unapplied**
> (not just 116–118). Applied them in order via Supabase MCP, one at a time, halting-on-error.
> Found + fixed a real bug: migration **108** nested `$$` inside `DO $$` (invalid dollar-quoting)
> — corrected to `$cron$` in the DB and the file. Also hardened file **111**'s policy create with
> a `pg_policies` guard. All verified present; 118 grants confirmed (anon/authenticated can't
> execute `log_search_term`, service_role can).

**Optional hardening — two of three now DONE** (`log_search_term` lockdown ✅, real XLSX ✅). Remaining:

### Citizens Vision + ecosystem (active strategy — NEXT SESSION)
The founder reframed the goal (2026-05-29): an **ecosystem of apps sharing data**, with **Vision as
the back-office analytics/intelligence app** for contributors + organisations to glean analytics,
map activity across **all** ecosystem apps (source-selectable), and receive recommendations/trends.
Connect must stay lightweight + scale (phones via Capacitor + browser). Monorepo (Turborepo) is
the founder's lean but to be confirmed.

**Inspected this session:** Vision (`../citizens-vision`) is **largely feature-complete** — Next 16 /
React 19, Phases **0–21b** done (incl. Connect integration + incremental sync, advisory, federation),
separate Supabase project `Citizens-Vision` (`ijdmcudcrncmaprmzgfk`, currently INACTIVE). Its
`README.md` is boilerplate; real docs are `ARCHITECTURE.md`, `.github/VISION.md`, `PROJECT_STATUS.md`.

**→ Full context + open questions captured in
[docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md](docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md).**
That doc is the agenda for the dedicated strategy session: ecosystem intent, data architecture
(linchpin), Vision scope, audiences, monorepo vs polyrepo, React/Next version reconciliation
(founder Q2 — needs a Capacitor compatibility audit I still owe), and first-deliverable sequencing.
**No monorepo/integration code until those decisions are made.**

### Other non-blocking
- `docs/design/FIGMA_PROMPT.md` remains **untracked** in the Connect repo per founder instruction
  (leave uncommitted).

---

## 5. Open questions

None blocking.

---

## 6. How to verify locally

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
npx vitest run
npx next lint --dir src
npm run dev
```

**Messaging system verification** (12 steps):

1. **Permission gate**: as contributor, try messaging a citizen who has not RSVP'd → API returns 403.
2. **Request flow**: contributor messages a citizen who has RSVP'd → conversation created `status='pending'`; citizen sees MessageRequestCard in MessagesPanel with Allow/Deny.
3. **Recipient-only gate (HIGH fix)**: as contributor, PATCH `/api/conversations/[id]` with `action:accept` on your own pending request → 403 "Only the recipient can respond to a message request".
4. **Floating panel**: click message icon in Navbar → glassmorphism panel opens top-right; click conversation row → inline ChatView; back arrow returns to list.
5. **Badge**: send message to test account → badge appears on Navbar message icon.
6. **MessageButton placements**: visible on event detail, place detail, contributor profile.
7. **Block flow**: block a user → existing conversation hidden, future POST returns 400.
8. **Spam flag**: send 6 messages in 60s → row appears in `reports` table with `reason='spam'`.
9. **Broadcast flood**: create 16 broadcasts from one source in 7d → admin notification with `type='broadcast_flood'`.
10. **Deleted-account display**: soft-delete a profile (`UPDATE profiles SET deleted_at = now() WHERE id = ...`) → their name renders ~~strikethrough~~ in ChatView header + MessagesPanel row.
11. **Discoverable opt-in**: enable in profile settings → name+avatar chip appears on event detail "People attending" for fellow RSVPers.
12. **Digest dry-run**: `curl -H "Authorization: Bearer <ANON_KEY>" https://<project>.functions.supabase.co/send-contributor-digest` → returns `{digests: N}`. Without header → 401.

**Volunteers (Stage F)**:

- Dashboard → Team → Volunteers tab: pending applications show Approve/Decline buttons.
- Decline click reveals inline textarea for reason; Confirm sends POST `update_status`.
- `/e/[id]` or `/places/[id]` when `volunteer_openings=true`: VolunteerApplyButton CTA appears.
- Citizen can apply with optional message, see status badge, or withdraw pending/approved apps.

---

## 7. Memory pointers

- `/memories/repo/coding-patterns.md` — Connect patterns.
- `/memories/repo/outstanding-items.md` — running backlog.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating.
- **`VolunteerApplyButton`** is a client component at `src/components/volunteer/VolunteerApplyButton.tsx`. It takes `entityType/entityId/contributorHandle/userId/initialStatus/initialApplicationId/isOwner` and handles the full apply/withdraw lifecycle client-side.
- **`withdraw` in volunteers API** is gated by `applicant_id = user.id` in BOTH the SELECT ownership check and the UPDATE WHERE clause — no dashboard access needed (citizen self-action).
- **Messaging recipient identification** (no `created_by` column): in `pending` state only the initiator has sent messages, so PATCH accept/reject blocks any user with `messages.sender_id = user.id` count > 0 OR conversations with 0 messages total. See [conversations/[id]/route.ts](src/app/api/conversations/[id]/route.ts).
- **Conversation creation** goes through `find_or_create_conversation(user_a, user_b, p_status)` SECURITY DEFINER — `user_a` is the initiator. The RPC validates `p_status IN ('pending', 'active')`; `rejected` cannot be created, only set via PATCH (currently the PATCH deletes the conversation instead of setting `rejected`).
- **Supabase JS `.in()` limitation**: nested subqueries (`.in("col", supabase.from(...).select(...))`) silently return 0 results. ALWAYS pre-fetch the array first. Caught in vibe-security audit on `send-contributor-digest`.
- **Edge function auth pattern**: cron-triggered functions should reject requests without `Authorization: Bearer ...` header. pg_cron (migration 108) passes `Bearer ${anon_key}`.
