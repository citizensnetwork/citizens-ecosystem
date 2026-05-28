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

## 2. What just shipped — Full Messaging System + Vibe-Security Audit (next commit)

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

- 82 test files, **745 tests**, all passing.
- 108 migrations applied (107 messaging permission model + 108 contributor digest cron added this batch).
- Latest commit on `origin/main`: **`d116ea5`** (about to be superseded by messaging commit).

---

## 4. Next batches queued

From `docs/plans/contributor-dashboard.md`:

- **Stage G — Team management UX**: "+ Add team member" popup (3 search bars: name/user_id/email), invite flow → `team_memberships` row + in-app notification, accept/decline, owner transfer, public team list on contributor profile.
- **Stage H — Analytics depth + export**: daily aggregation via pg_cron → `contributor_analytics`, time-window selector (7/14/30/60/90d, 6mo, 1yr), CSV export endpoint, 1-year retention.
- **Stage I — Planning cards**: card open/close UI for tasks + ideas, completion checkbox, idea delete, public toggle.
- **Stage J — Suggestion button polish**: glass-panel composer with server-side validation, admin suggestion inbox, XLSX export, 10/day rate limit.
- **Stage K — Handle change rule**: warning copy on slug edit, 1-change-per-month enforcement, admin override endpoint.
- **Stage L — Search term analytics**: capture sanitised queries in rolling table, top-10 display, feed keywords into autocomplete (A66).

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
