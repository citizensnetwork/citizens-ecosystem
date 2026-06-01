# Messaging System — Feature Clarity

> **Status:** Implementation plan finalised 2026-05-27. Work begins on this plan.
> The transport layer already exists (conversations, messages, ChatView, ConversationList, API routes).
> This document captures all product decisions and the 12-step implementation roadmap.

---

## Decision Log

| # | Question | Decision |
|---|----------|----------|
| 1 | Who can message whom? | Citizens → Contributors (event/place owners) freely. Contributors → Citizens only if citizen has RSVP'd or followed their event/place. Citizen → Citizen freely. Privacy rule: no cold outreach to citizens. |
| 2 | Message requests | Contributors initiating with a citizen create a **pending** conversation. Citizen sees: "Organisation [Name] has reached out — Allow / Deny". Allow opens chat; Deny deletes the thread. All cards: Mute · Delete · Report · Block. |
| 3 | Where does Message CTA live? | All three: contributor public profile, event detail page, place detail page. Small icon button — not the dominant CTA. |
| 4 | Content types | Text only for now. |
| 5 | Group messaging | Event page comment/update thread = public group communication for now. Private groups: future stage. |
| 6 | Read receipts | Not now. Feature upgrade later. |
| 7 | Notifications | In-app badge on message icon. Push: app badge count, lock screen banner, pull-down banner. Contributor/admin digests are weekly analytics summaries only, not 5-times-daily notification batches. Mute available on all messages. |
| 8 | Retention & deletion | No message deletion for now. 60-day history auto-delete. Deleted account: username shown with ~~strikethrough~~ greyed; messages auto-deleted 30 days after account deletion. |
| 9 | Blocked users | Blocked users can still see old messages they received. Block option on every message card. |
| 10 | Contributor broadcast | Broadcast from every org/personal/place/event profile. All followers + RSVPers receive notifications. Users can mute a source. Admin flagged if >15 broadcasts/week from one source. |
| 11 | Spam / moderation | No rate limit. Automated flag to admins if >5 messages/minute from one sender. Conversations can be reported; admin can view full conversation history. |
| 12 | Conversation list UX | Floating panel triggered by message icon (next to calendar). Spans from below navbar to ~50vh. Thin-bordered, rounded, glassmorphism (90% white + gold tint, slight backdrop blur). Conversation rows: name bold, preview lighter, thin divider. |
| 13 | Typing / presence | None. |
| 14 | Deep-link behaviour | Messages open in the floating panel (brought to front), not a full page navigation. |
| 15 | API rate limit | No hard limit. Flag >5 messages/minute as potential spam → admin notification. |
| Citizen discovery | How do citizens find each other? | (A) @handle username (citizens set a custom short handle, URL: `/profile/@handle`). (B) Privacy-opted-in "People attending" section on event pages (opt-in toggle in profile settings; shows first name + avatar only for discoverable RSVPers). |

---

## What exists right now

- `conversations` table — DM threads between two users
- `conversation_participants` — many-to-many user ↔ conversation
- `messages` table — up to 2 000 chars, sender FK, created_at
- `GET/POST /api/conversations` — list + create
- `GET/POST /api/conversations/[id]/messages` — fetch + send
- `PATCH /api/conversations/[id]/read` — mark read
- `ConversationList`, `ChatView` components (under `/messages`)
- `MessageButton` component — was on contributor profiles (removed pending clarity)

---

## Implementation Plan (12 Steps)

### Step 1 — DB Schema Migration
One new Supabase migration:

- `conversations.status` — enum `'pending' | 'active' | 'rejected'` (default `'active'`)
- `user_blocks` table — `(id uuid pk, blocker_id uuid FK profiles, blocked_id uuid FK profiles, created_at timestamptz)` with RLS
- `conversation_participants.muted_at` — `TIMESTAMPTZ` nullable
- `messages.deleted_at` — `TIMESTAMPTZ` nullable (soft-delete for account deletion display)
- `profiles.handle` — `TEXT UNIQUE` nullable (for @handle)
- `profiles.discoverable` — `BOOLEAN` default `false` (opt-in attendee list)
- pg_cron job: delete messages older than 60 days; for deleted accounts delete after 30 days
- New notification type values: `'spam_flag'`, `'broadcast_flood'`, `'dm_received'`, `'dm_response'`

---

### Step 2 — Messaging Permission Rules
**File:** `src/app/api/conversations/route.ts`

| Initiator | Target | Rule |
|-----------|--------|------|
| Citizen | Contributor (event/place owner) | Always allowed → `status = 'active'` |
| Contributor | Citizen who RSVP'd/followed their event/place | Allowed → `status = 'pending'` (request) |
| Contributor | Citizen with no prior interaction | Blocked (400) |
| Citizen | Citizen | Allowed → `status = 'active'` |
| Any | Blocked user | Blocked (silently for blocker, 400 for blocked) |

Check `user_blocks` before creating any conversation.

---

### Step 3 — Message Request UX
**New file:** `src/components/messaging/MessageRequestCard.tsx`

- Renders when `conversation.status === 'pending'`
- Overlay: *"[Org Name] has reached out — Allow / Deny"* with org name + details
- **Allow** → PATCH conversation `status = 'active'`; overlay removed; card shows:
  - Org name **bold, large, top-left**
  - Message preview below, lighter, full-width
- **Deny** → DELETE conversation; card removed entirely
- All cards (pending + active): **Mute · Delete · Report · Block** at end of card

---

### Step 4 — Floating Messages Panel
**New file:** `src/components/messaging/MessagesPanel.tsx`

- `position: fixed`, below navbar, spanning to ~50vh
- Width ~360px, right-aligned under message icon
- Style: `backdrop-blur-sm`, `bg-white/90` + gold tint, thin black border, `rounded-xl`
- **Performance:** implement without blur first; add `backdrop-blur-sm` after mobile testing. Fallback = solid white.
- Content: scrollable conversation list
  - Each row: name **bold**, preview lighter, thin `border-b`
  - Clicking row → ChatView opens inline (replaces list in panel); back arrow returns to list
- Pending (request) conversations shown with request badge; unread shown at top

---

### Step 5 — Navbar Message Badge
**File:** `src/components/ui/Navbar.tsx`

- Message icon already present → wrap with unread count badge (same pattern as `NotificationBell`)
- Count: messages where sender ≠ current user AND `created_at > participant.last_read_at`
- Badge hidden at 0; clicking icon toggles `MessagesPanel`

---

### Step 6 — MessageButton on All Touchpoints
Restore/add `variant="icon"` `MessageButton` (component already exists):

- `src/components/events/EventDetailContent.tsx` — near organiser card
- Place detail page — near owner info
- Contributor public profile — restore (was removed pending this plan)

All: small, subtle. Not the dominant CTA.

---

### Step 7 — Conversation Card Actions
**Files:** `src/components/messaging/ChatView.tsx`, `MessagesPanel.tsx`

| Action | Behaviour |
|--------|-----------|
| Mute | Toggle `conversation_participants.muted_at`; suppresses push for this thread |
| Delete | Soft-delete conversation for this participant only |
| Report | POST `/api/reports` with `type = 'conversation'`; admin can view full history |
| Block | INSERT `user_blocks`; auto-mute + hide thread; show sender as `[Blocked User]` |

---

### Step 8 — Spam Detection
**File:** `src/app/api/conversations/[id]/messages/route.ts`

On each POST:
1. Count messages from sender in last 60 seconds
2. If ≥ 5: send proceeds, but INSERT spam flag into `reports` (`type = 'spam_flag'`) + INSERT admin notification
3. Admin notification includes: sender profile, conversation ID, message rate

---

### Step 9 — Broadcast Flood Detection
**File:** `supabase/functions/notify-broadcast/index.ts`

On each broadcast trigger:
1. Count broadcasts from this source (event/place/org) in last 7 days
2. If > 15: proceed with broadcast + INSERT admin notification (`type = 'broadcast_flood'`)
3. Admin notification: source name, count, link to contributor dashboard

Muting a broadcast source stored as `muted_sources` on `profiles` (jsonb array of source references).

---

### Step 10 — Notification Enhancements

**Contributor digest (weekly analytics):**
- New edge function: `supabase/functions/send-contributor-digest/`
- Scheduled weekly once product scheduling is approved
- Content: RSVP/connect counts, cancellations, considers, consider-to-connect conversions, messages, comments, volunteer applications, and other citizen activity for the contributor's own events/places

**Admin digest (weekly analytics):**
- Content: reports, applications, new entries, new users, total new events/places, total deleted events, average attendance overall where available from cheap/precomputed aggregates
- Instant admin notifications still apply for operationally important events such as `spam_flag`, `broadcast_flood`, `security_flag`, `contributor_application`, `dm_received`, and `dm_response`

**Push notification payloads (Citizens + Contributors):**
- `badge` count (app icon)
- `alert` title + body (lock screen banner + pull-down banner)
- APNs/FCM standard fields already supported via Capacitor Push + `_shared/push.ts`
- Triggers: new message, event update, org broadcast, interested/RSVP'd events

**Mute granularity:** muting a conversation, event, org, or place suppresses push for that source.

---

### Step 11 — Citizen Discovery

**A — @handle + profile link:**
- `profiles.handle` — set in profile settings; validated: lowercase, alphanumeric + underscores, 3–30 chars
- URL: `/profile/@[handle]` (falls back to `/profile/[user_id]`)
- "Copy profile link" button on every profile — copies cleanest URL to clipboard

**B — Privacy-opted-in event attendee list:**
- `profiles.discoverable` — toggle in profile settings ("Let others at my events find me")
- Event detail page: "People attending" section (below RSVP count)
- Shows first name + avatar for RSVPers with `discoverable = true`
- Message icon on each chip → MessageButton flow (citizen → citizen, `status = 'active'`)
- Max 20 shown; paginated "See all"; only visible to logged-in RSVPers of the same event

---

### Step 12 — Deleted-User Message Display
**File:** `src/components/messaging/ChatView.tsx`

When sender's `profiles.deleted_at IS NOT NULL`:
- Display as ~~[username]~~ (strikethrough, greyed text)
- Message content visible until 30-day auto-delete window

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration (all schema additions above) |
| `src/app/api/conversations/route.ts` | Permission rules + block check |
| `src/app/api/conversations/[id]/messages/route.ts` | Spam flag detection |
| `src/app/api/reports/route.ts` | Add `conversation` + `spam_flag` report types |
| `src/components/messaging/MessageRequestCard.tsx` | **New** — request overlay |
| `src/components/messaging/MessagesPanel.tsx` | **New** — floating panel |
| `src/components/messaging/ConversationList.tsx` | Request state; used inside MessagesPanel |
| `src/components/messaging/ChatView.tsx` | Action buttons; deleted-user display |
| `src/components/messaging/MessageButton.tsx` | Restore on profile/event/place |
| `src/components/ui/Navbar.tsx` | Message badge + panel toggle |
| `src/components/events/EventDetailContent.tsx` | MessageButton + "People attending" section |
| `src/app/places/[id]/page.tsx` | MessageButton touchpoint |
| `src/app/profile/page.tsx` + `[id]/page.tsx` | @handle setting + copy profile link |
| `supabase/functions/notify-broadcast/index.ts` | Broadcast flood detection |
| `supabase/functions/send-contributor-digest/` | **New** — weekly contributor analytics digest function |

---

## Verification Checklist

1. **Message request**: Contributor messages citizen → citizen sees Allow/Deny overlay → Allow opens chat, Deny removes card
2. **Permission block**: Contributor messages citizen with no prior interaction → API 400
3. **Spam flag**: Send 6 messages in 60s → `reports` table has `spam_flag` + admin notification created
4. **Broadcast flood**: 16 broadcasts from one org in 7 days → admin notification created
5. **Floating panel**: Message icon → panel opens → conversations listed → click → ChatView inline → back arrow → list
6. **Badge**: Unread message → badge number appears on message icon
7. **MessageButton touchpoints**: Visible (small) on event detail, place detail, contributor profile
8. **Block**: Block a user → cannot initiate new conversation → thread hidden
9. **Retention display**: Deleted account → sender shown as ~~username~~ greyed
10. **Push notifications**: New message → badge + lock screen banner + pull-down banner on device
11. **Contributor digest**: Invoke edge function manually → weekly analytics digest created for contributor
12. **@handle**: Set handle in profile → URL `/profile/@handle` resolves → copy link button copies it
13. **Attendee list**: RSVP to event + set discoverable → appear on "People attending" with message icon
