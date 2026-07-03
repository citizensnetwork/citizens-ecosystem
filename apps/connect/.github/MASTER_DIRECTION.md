# CITIZENS CONNECT — MASTER DIRECTION DOCUMENT
### Single Source of Truth · Replaces scattered planning · May 2026
### Drop this into `.github/MASTER_DIRECTION.md`

---

> *"You are no longer strangers and foreigners, but fellow citizens."*
> — Ephesians 2:19
>
> **Platform:** Citizens (ecosystem) → Citizens Connect (this app)
> **Slogan:** Connecting the Kingdom
> **Stack:** Next.js 15 App Router · TypeScript · Supabase · MapLibre GL JS · MapTiler Cloud · Tailwind CSS v4 · Capacitor (iOS + Android)
> **Deployed:** citizens-connect.vercel.app (no custom domain yet)
> **Supabase Project:** xyiajtrvhlxaeplsiajj · Default map centre: Pretoria `[-25.7479, 28.2293]`
> **Current commit:** `3a5ed28` · Tests: 656 passed / 0 failures

---

## HOW TO USE THIS DOCUMENT

This is the **locked product + engineering direction** for Citizens Connect. Every AI session, every batch, every fix must reference this document first. It answers:
- What are we building and why
- What is broken and must be fixed
- What must be removed
- What must be built next, in what order
- What decisions have been made and are final
- What is deferred and why

Do not add features. Do not refactor speculatively. Fix what is broken. Build what is next. Ship in small, verified batches.

---

## PART 1 — LOCKED DECISIONS (DO NOT REVISIT)

These decisions are final. No agent, no session, no suggestion overrides them.

| # | Decision | Detail |
|---|---|---|
| D1 | **Brand name** | Consumer-facing brand is **CITIZENS**. App is **Citizens Connect**. Ecosystem is **Citizens**. Legal entity may remain CitizensNetworkPBO. |
| D2 | **Overarching slogan** | *Connecting the Kingdom* |
| D3 | **Colour palette** | Gold `#D4AF37`, Near-black `#111111`, White `#FAFAF7`. 60/30/10 rule. No other primary colours. |
| D4 | **Map engine** | **MapLibre GL JS + MapTiler Cloud**. No migration to Mapbox. Leaflet is fully removed (see Legacy Cleanup). |
| D5 | **Calendar view** | The FullCalendar dual-view is **cut**. Replaced with a glass-overlay full-screen simple calendar (see Feature Spec below). FullCalendar dependency is removed. |
| D6 | **Featured Panel** | **Removed entirely**. It was a legacy/paid feature concept that no longer fits the vision. All `FeaturedPanel` components, routes, and DB tables are deleted. |
| D7 | **11-Agent AI system** | **Discarded**. `.github/AGENTS.md` is archived to `docs/archive/AGENTS_LEGACY.md`. All agent-specific review steps are removed from the session workflow. Replace with: one Architect review + one Security review per batch, both done inline, no separate agent files. |
| D8 | **Mobile strategy** | **Capacitor** for both iOS and Android. The existing `android/` and `ios/` scaffold folders are kept. No migration to React Native/Expo. |
| D9 | **Frontend framework (all apps)** | **Next.js 15 App Router + TypeScript**. All apps (Connect, Wear, Learn, etc.) use the same stack. |
| D10 | **Database** | **Supabase (PostgreSQL)**. Single shared Supabase project across all Citizens apps. |
| D11 | **Payments** | **PayFast** for all billing. Implementation is deferred (see Phase Order). |
| D12 | **SOS Integration** | **CASI** (casi-app.com · Pretoria · R35/month · 3–5 min armed response). Implementation is deferred. |
| D13 | **Languages** | **English only** at launch. Afrikaans and other SA languages added in a future phase. |
| D14 | **Right-side panel pattern** | All content views (event detail, organisation profiles, search results, organisation search) emerge as a **panel from the right side of the screen**. This is the universal UI pattern. Nothing opens as a new page unless it is a full workflow (event creation, profile edit). |
| D15 | **Burger bar** | Left side only. Contains: filters, Consider/Convince system, friend activity. Admin functions are **NOT** in the burger bar — they live at `/admin`. |
| D16 | **Simplicity principle** | When in doubt, do less. Do not add complexity. The platform should feel effortless. |

---

## PART 2 — WHAT LAUNCH-READY MEANS

Citizens Connect is launch-ready when the following journeys work end-to-end for real users on the live deployed site.

### Citizen Journey (must work completely)
1. Land on the homepage → understand what the platform is → sign up
2. Verify email → complete basic onboarding (interests, location/province)
3. See the map with real event markers visible near them
4. Tap a marker → see event quick-action popup → tap View → see full event detail in right panel
5. Tap Connect (RSVP) → be registered as attending
6. Tap Consider → event appears in their Considerations in the burger bar
7. Tap Visit on a place marker → see place detail in right panel
8. Tap an organisation name → see organisation profile in right panel
9. Tap a Website link → navigate to external site
10. Receive a notification when a contributor posts a broadcast update on an event they RSVPed to
11. View their notifications without any payment or subscription requirement

### Contributor Journey (must work completely)
1. Sign up → apply for Contributor status → receive confirmation that application was submitted
2. Admin approves application → Contributor receives notification and accesses contributor features
3. Complete organisation profile (name, logo, description, category, location, website, social links)
4. Upload profile images and a cover image
5. Create an event → event appears on the map → event count increments in their dashboard
6. View event metrics (attendee count, consider count, view count)
7. Edit event details after creation
8. Post a broadcast update to their event → attending citizens receive a notification
9. See past events in their organisation profile with a basic history list
10. View a simple bill summary showing events posted this month and calculated cost

### Admin Journey (must work completely)
1. Log in → navigate to `/admin` (not the burger bar)
2. See pending contributor applications with full submitted details
3. Approve or reject an application → contributor receives notification of outcome
4. Elevate a Citizen account to Contributor manually
5. View and manage all users with role controls
6. Manage categories and tags
7. Remove reported content with a private message to the contributor

---

## PART 3 — CURRENT KNOWN BROKEN ITEMS

Fix these before building anything new. Each is a blocker for real user testing.

### 🔴 P0 — Blocks everything

**BUG-01: Admin cannot approve contributor applications**
- Symptom: Contributor applies, admin cannot see or process the application
- Location: `/admin/contributors` or `/admin/users` contributor application section
- What's needed: The application list must load, display full submitted details, and the Approve/Reject buttons must work and trigger a profile update + email notification to the contributor
- Note: Batch P and Batch Q worked on this — the RLS policy for admin profile updates was fixed in migration 063. Verify whether the issue is the policy (now fixed) or the UI/API call. Test with a fresh application submission.

**BUG-02: MapTiler custom style not loading on deployed site**
- Symptom: Map shows generic tiles, not the custom branded Kingdom Commons style
- Root cause: `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` environment variables are almost certainly NOT set in Vercel dashboard (they exist only in local `.env.local`)
- Fix: Go to Vercel dashboard → Project → Settings → Environment Variables → add both keys for Production, Preview, and Development environments → redeploy
- Style UUID to use: `019e5525-61a4-7791-82f2-2222fb440592` (from Batch M)
- Verify the MapTiler key is still valid and not expired in MapTiler Cloud dashboard

### 🟠 P1 — Blocks contributor value proposition

**BUG-03: Consider system not functional in UI**
- The DB schema (`consider` RSVP status, `consider_count`) is built (Phase 15B)
- The `ConsiderBadge` in navbar is built
- The `QuickActionPopup` has a Consider button
- What is NOT built: the Considerations view inside the burger bar (My Considerations + Friends sections), the Convince mechanic, and friend-to-friend notification on Connect/Consider
- See Feature Spec: FEAT-04 for full implementation detail

**BUG-04: Organisation profiles not browsable**
- `/c/<slug>` routes exist from Batch N with basic contributor profile data
- What is missing: these profiles are not linked from event detail (the organiser name link exists but may not route correctly), there is no organisation search/discovery, and the profile content needs the full spec (upcoming events, past events list, gallery, follow button, broadcast updates)
- See Feature Spec: FEAT-03

**BUG-05: Broadcast updates have no posting interface**
- The notification infrastructure exists
- There is no UI for a contributor to write and post a broadcast update from their event management view
- Citizens attending that event have no feed to read updates in the event detail panel
- See Feature Spec: FEAT-05

**BUG-06: Supabase security advisor ERRORs (2 known)**
- `directory_contributors` — security_definer_view error
- `app_settings` — RLS not enabled
- These have been carried as "baseline unchanged" for multiple batches and must be resolved in the next available batch

### 🟡 P2 — Important for quality but not blocking

**BUG-07: Leaflet references still in codebase**
- README references Leaflet, there may be residual imports or comments
- Full audit and removal required (see Legacy Cleanup)

**BUG-08: FullCalendar still in codebase**
- Decision D5 cuts the FullCalendar dual-view
- All FullCalendar imports, components, routes, and related CSS must be removed
- Replaced with the simple glass-overlay calendar (see Feature Spec: FEAT-02)

**BUG-09: Featured Panel still in codebase**
- Decision D6 removes the Featured Panel
- `FeaturedPanel.tsx`, `/api/featured` route, `featured_listings` table references, and all related state in `EventsView` must be removed
- The panel slot in `EventsView` that was previously the Glance panel → Featured Panel is repurposed for the Considerations panel (burger bar content)

**BUG-10: Admin functions in burger bar**
- All admin-specific links and actions must be removed from the burger bar
- They belong exclusively in the `/admin` dashboard

---

## PART 4 — WHAT IS REMOVED (LEGACY CLEANUP)

Execute this cleanup as a dedicated batch before or alongside the first fix batch.

### Remove completely
- `FullCalendar` npm package and all imports (`@fullcalendar/*`)
- `EventCalendar.tsx` component and all references
- Calendar dual-view toggle logic in `EventsView.tsx` (the map/calendar toggle button changes function — see FEAT-02)
- `FeaturedPanel.tsx` and all imports
- `/api/featured` API route
- `featured_listings` table (migration to drop it, or leave table orphaned with no code references)
- All Leaflet imports, references, comments, and README mentions
- `.github/AGENTS.md` → move to `docs/archive/AGENTS_LEGACY.md`
- All agent-specific instruction files that reference the 11-agent system
- Admin links from burger bar (`BurgerMenu.tsx`)
- Any UI references to old role names `vendor` / `client` (they should read `Citizen` / `Contributor` in all user-facing strings)
- `MapStyleDebugBadge` (dev-only debug overlay from Batch M — fine to keep in dev, but confirm it's tree-shaken in prod)

### Archive (move to `docs/archive/`, do not delete)
- `AGENTS.md`
- Any batch-specific queued spec files in `.github/` that have been completed

### Update
- `README.md` — remove Leaflet reference, update stack description, update quick-start
- `VISION.md` — full rewrite to reflect all decisions in this document
- `.github/copilot-instructions.md` — remove 11-agent workflow, replace with simplified 2-review pattern (Architect + Security inline)

### Create
- `docs/FUTURE_IDEAS.md` — a running list of deferred features and ideas (replaces the "nice-to-haves" scattered across batch notes). Seed it with: AI search/recommendations, multilingual support (Afrikaans first), CASI SOS integration, Citizens Vision analytics, Citizens Wear launch, Citizens Learn launch, Citizens Impact, Citizens Social, Mapbox migration consideration, AI-flagging for content moderation.

---

## PART 5 — FEATURE SPECIFICATIONS (BUILD THESE, IN ORDER)

### FEAT-01: Admin Panel Overhaul
**Priority:** Batch 1 · Blocks launch

**Goal:** A clean, functional `/admin` dashboard that works correctly and is completely separate from the burger bar.

**Pages to build/fix:**
- `/admin` — Dashboard home. Shows: pending contributor applications count, flagged content count, total users, total events, total places. Simple stat cards, no charts yet.
- `/admin/applications` — Contributor application list. Each application shows: org name, type, submitted by, date, description, website. Two action buttons: **Approve** and **Reject**. Approve: sets `contributor_status = approved` on profile, sets `role` to match `contributor_kind`, sends in-app notification + email. Reject: sends notification with a text field for reason. Both actions must work and persist correctly.
- `/admin/users` — Existing user management (already built, polish only). Remove pagination when total pages = 1.
- `/admin/categories` — Already built. Keep.
- `/admin/tags` — Already built. Keep.
- `/admin/reported` — Future phase. Stub page with "Coming soon" for now.

**Navigation:** Admin users see an "Admin Panel" link in their profile menu (not burger bar). The `/admin` routes are middleware-protected to `role = admin` only.

**Remove from burger bar:** All admin links.

---

### FEAT-02: Simple Glass-Overlay Calendar
**Priority:** Batch 2 · Replaces FullCalendar

**Goal:** A lightweight, beautiful full-screen calendar overlay that Citizens can open to see their upcoming events visually. Not a second view of the entire app — an overlay on top of the map.

**Trigger:** The existing calendar toggle button (currently switches between map and calendar views) now opens a glass-overlay calendar that blurs the map behind it. Pressing the same button, tapping outside, or pressing Escape closes it.

**Design:**
- Full-screen frosted glass overlay (backdrop-filter: blur, dark semi-transparent background)
- Simple month view only (no week/day tabs)
- Current month visible, arrow navigation for previous/next month
- Events shown as date tiles: gold-highlighted tiles for RSVPed events, muted/semi-opaque tiles for non-joined events the user hasn't RSVPed to
- Tapping an event tile opens the event detail right-side panel (same panel as the map)
- No external dependencies — build with plain CSS grid and the existing event data already in state

**Implementation notes:**
- Use the existing `events` data already fetched in `EventsView` — no new API calls needed
- RSVP status already available via `rsvpEventIds` set
- This can be ~150 lines of clean TypeScript — do not over-engineer it
- Remove all `@fullcalendar/*` packages from `package.json` after this is built

---

### FEAT-03: Organisation Profiles & Discovery
**Priority:** Batch 3 · Core citizen + contributor need

**Goal:** Citizens can discover and explore any contributor organisation from anywhere in the app. Organisation profiles open as a right-side panel, consistent with all other content views.

**Entry points (all open the same right-panel):**
- Tapping organiser name on any event detail panel
- Tapping a Place marker's organisation name
- Searching from the organisation search button (see below)
- Any future cross-app link

**Organisation Profile Panel content:**
- Cover image + logo
- Organisation name + category badge
- Faith statement / short bio
- Location(s) — primary + any additional `contributor_locations`
- Website link + social links (Instagram, Facebook, TikTok)
- Follow button (already built — wire it here)
- **Upcoming Events** — scrollable card list of their future events (tap → event detail panel, stacked)
- **Past Events** — simple chronological list with event name, date, and category badge (no elaborate timeline at this stage)
- **Gallery** — media strip using existing `MediaStrip` component
- **Broadcast Updates** — read-only list of their broadcast messages (newest first)

**Organisation Search:**
- A search icon button fixed in the right side of the map view (not in burger bar)
- Tapping opens a search panel from the right
- Search input filters by organisation name, category, and location
- Results shown as compact cards (logo + name + category + follow count)
- Tapping a result opens the Organisation Profile panel (stacked on top)

**Route:** `/c/[slug]` already exists — adapt it to use the right-panel pattern consistently rather than a separate page, or keep the page for direct URL access while ensuring the in-app experience uses the panel.

---

### FEAT-04: Consider → Convince (Complete Implementation)
**Priority:** Batch 4 · Platform differentiator

**Goal:** The full Consider/Convince social loop. This is Citizens Connect's most unique feature.

**Consider (already partly built — complete it):**
- Citizen taps Consider on an event → `consider` RSVP status set → `consider_count` incremented
- Event appears in their "My Considerations" section in burger bar
- The quick-action popup Consider button shows correct state (considered vs not)

**Burger Bar — Considerations Section (build this):**

The burger bar has a new **Considerations** accordion section containing two sub-tabs:

*My Considerations tab:*
- Lists all events the current user has Considered
- Each event shown as a compact card: event name, date, category, organisation name
- Tap card → event detail panel opens
- "Remove" option to un-Consider

*Friends tab:*
- Lists events that mutual friends (people who follow each other) are Considering
- Each event card shows: event name, date, a small avatar strip of which friends are Considering it
- A **Convince** button on each card — tapping sends a Convince notification to the friend(s) considering that event
- Convince is rate-limited: once per friend per event per 24 hours

**Convince mechanic (build this):**
- When Citizen A taps Convince on an event that Friend B is Considering:
  - Friend B receives an in-app notification: "[Name] thinks you should go to [Event Name] — are you in?"
  - The notification links to the event detail panel
  - Friend B's event card in the Friends Considerations tab shows a "convinced by [Name]" pill under it

**Connect notifications (build this):**
- When any citizen RSVPs (Connect) to an event, their mutual friends receive a notification: "[Name] is going to [Event Name]"
- This is the social proof loop that drives organic attendance

**Convince count on event strips:**
- Event cards in the horizontal filter results strip show a small gold convince badge when the user has been convinced about that event by a friend

**DB additions needed:**
- `convinces` table: `id, from_user_id, to_user_id, event_id, created_at` — unique constraint on `(from_user_id, to_user_id, event_id)`
- RLS: users insert their own convinces; users read convinces targeting them; rate limit enforced at API layer

---

### FEAT-05: Broadcast Updates (Contributor One-Way Event Feed)
**Priority:** Batch 5 · Completes contributor communication loop

**Goal:** Contributors can post timestamped messages to their events. Citizens who are attending (RSVPed) receive notifications and can read all updates in the event detail panel.

**Contributor interface (build this):**
- Inside the event management view (`/events/manage` → expand a specific event):
  - "Post Update" section with a text area (max 500 chars) and a Post button
  - List of previously posted updates for that event, shown chronologically
  - Option to delete a previous update (contributor or admin only)

**Citizen interface (already partly scaffolded — complete it):**
- Event detail panel has a "Updates" section below the description
- Updates shown in reverse chronological order (newest first): timestamp + contributor logo + update text
- Real-time: new updates appear without page refresh (Supabase real-time subscription)

**Notifications:**
- When a broadcast update is posted, all users with `attending` RSVP status for that event receive an in-app notification
- Notification text: "[Organisation Name] posted an update about [Event Name]"
- Links to event detail panel with Updates section scrolled into view

**DB additions needed:**
- `event_updates` table (shipped name; the spec's earlier `event_broadcasts` label was harmonised with the actual implementation in Batch 5): `id, event_id, author_id, body (text, 1–1000 chars), created_at`
- The 1000-char ceiling was chosen over the original 500 once we saw real organiser drafts — sub-paragraph venue directions and last-minute schedule rewrites consistently brushed the 500 limit. The composer warns at 50 remaining and stops at 1000.
- RLS: event creator or admin inserts; authenticated users read; author or admin deletes
- Realtime: table is in the `supabase_realtime` publication (migration 071) so the viewer updates without refresh
- Index on `(event_id, created_at DESC)`

---

### FEAT-06: Billing Foundation
**Priority:** Batch 6 · Enables monetisation (deferred until PayFast setup complete)

**Goal:** Track event posting activity per contributor and show them a transparent bill preview. PayFast recurring billing integrated when credentials are ready.

**Event count tracking (build now):**
- When a contributor creates an event, increment their monthly event counter
- Store: `contributor_billing` table with `profile_id, month (YYYY-MM), event_count, place_count, calculated_total`
- Pricing tiers from plan:
  - Individual / Small Brand: R30 per event
  - Medium Organisation (50–500 members): R150 per event
  - Large Ministry / Corporate (500+): R250 per event
  - Place markers: flat rate TBD per month

**Contributor dashboard — Bill Preview (build now):**
- In the contributor section of their profile/dashboard:
  - Current month event count
  - Calculated total for the month
  - "First 3 months free" banner during trial period
  - "Billing starts [date]" when trial ends

**PayFast integration (defer until credentials ready):**
- Stub the billing flow — show the preview, but the "Set up billing" button links to a "Coming soon" page
- When PayFast credentials are available, wire the recurring subscription API

---

## PART 6 — UI / UX SYSTEM (LOCKED PATTERNS)

Every screen, panel, and interaction must follow these rules. No exceptions.

### The Right-Panel Pattern
All content views open as a panel sliding in from the right side of the screen. This includes:
- Event detail
- Place detail
- Organisation profile
- Organisation search results
- Notifications panel (already uses this — keep)

Panels stack: opening a second panel (e.g., organisation profile from inside an event detail) slides a new panel in over the first. The back arrow returns to the previous panel.

### The Burger Bar (Left Side)
Contains only:
- Map filters (categories, date, distance, proximity)
- Considerations (My Considerations + Friends tabs)
- "Past Events" toggle
- User's own profile quick-link
- Sign out

Does NOT contain: admin links, featured content, navigation to other pages.

### The Glass Overlay
Used for: Calendar view, any full-screen modal, consent/indemnity gates.
Style: `backdrop-filter: blur(12px)`, dark semi-transparent background `rgba(0,0,0,0.6)`, frosted card content with gold accent borders.

### Marker Design (locked)
- Events: Gold `#D4AF37` SVG category icon, white circle, 2px black `#111` outline
- Places: Black `#111` SVG category icon, gold `#D4AF37` rounded square, 2px black outline
- Live/Today events: Pulse animation gold ring (`cc-marker-today` CSS class)
- Temporal opacity: progressive decay from 100% (today) to 40% (31+ days), never stepped

### Typography
- Display / headings: Playfair Display or Cormorant Garamond (serif)
- Body / UI: Inter or DM Sans (sans-serif)
- Gold text `#D4AF37` used for: brand name, active state labels, key call-to-action text
- All caps used sparingly and meaningfully (category badges, navigation labels)

---

## PART 7 — CROSS-APP ARCHITECTURE (PLAN AHEAD, BUILD INCREMENTALLY)

### Unified Profile Schema
The `profiles` table must be designed to support all future Citizens apps. Before building Wear, audit and extend the schema with:

```sql
-- Add to profiles table (if not exists):
-- App-specific preference columns (nullable, populated when user engages that app)
wear_style_preferences    jsonb      -- Citizens Wear
wear_wardrobe_visibility  text       -- 'public' | 'private' | 'friends'
learn_enrolled_listings   uuid[]     -- Citizens Learn
connect_home_province     text       -- Citizens Connect
connect_notification_radius integer  -- km
```

These columns are nullable and only populated when the user engages the relevant app. No app is required to fill another app's columns.

### Global Content Label System
Every piece of content (event, place, contributor profile) should be assignable to multiple platform contexts via labels. This is the cross-app data bridge.

```sql
-- content_labels table (build before Wear)
CREATE TABLE content_labels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,  -- 'event' | 'place' | 'profile'
  entity_id    uuid NOT NULL,
  label        text NOT NULL,  -- 'apparel' | 'education' | 'market' | 'impact-project'
  created_at   timestamptz DEFAULT now()
);
-- Index on (entity_type, entity_id)
-- Index on (label)
```

**Auto-label rules (implement as DB trigger or Edge Function):**
- Event category `markets-expos` → auto-label `market` → surfaces in Citizens Wear Collaboration tab
- Event category `education-equipping` → auto-label `education` → surfaces in Citizens Learn
- Contributor type `educational` → auto-label `education` → auto-invited to Learn listing
- Contributor with apparel-related posts → auto-label `apparel` → appears in Citizens Wear brand directory

### Monorepo Migration (before building Wear)
**Current state:** Three separate repos (citizens-connect, citizens-wear, citizens-vision)
**Target state:** One Turborepo monorepo with shared packages

**Migration plan:**
```
citizens/ (new monorepo root)
├── apps/
│   ├── connect/     ← citizens-connect repo moves here
│   ├── wear/        ← citizens-wear repo moves here (or restart fresh here)
│   └── vision/      ← citizens-vision repo moves here
├── packages/
│   ├── ui/          ← shared components (design system)
│   ├── auth/        ← shared Supabase auth logic
│   ├── database/    ← shared TypeScript types from Supabase
│   ├── config/      ← shared ESLint, TypeScript, Tailwind configs
│   └── utils/       ← shared helpers, formatters, validators
└── turbo.json
```

**When to do it:** Before writing a single line of Citizens Wear code. The shared auth, shared profile types, and shared UI package must exist before Wear starts — otherwise you rebuild everything Connect already worked through.

**How to do it:** Create a new `citizens` repo, copy `citizens-connect` into `apps/connect/`, adjust `package.json` paths, set up Turborepo. Citizens Wear starts fresh inside `apps/wear/` using shared packages from day one.

---

## PART 8 — DEFERRED ITEMS (DO NOT BUILD YET)

These are confirmed future features. They are not forgotten. They are not in scope until the launch checklist (Part 2) is complete.

| Feature | Why Deferred |
|---|---|
| CASI SOS Integration | Requires direct relationship with CASI team + API access |
| PayFast Recurring Billing | PayFast setup in progress; stub the UI, wire when ready |
| AI Content Recommendations | Cost; requires sufficient data; future phase |
| AI Content Moderation Flagging | Cost; community reporting + human mods covers launch |
| Live Car Run / Convoy Mode | Live location foundation exists; convoy UX is a separate feature |
| Multilingual (Afrikaans, Zulu, etc.) | English-first at launch; i18n infrastructure can be added later |
| Citizens Vision (analytics) | Phase 3; needs its own planning session |
| Citizens Wear (fashion platform) | Phase 1b; needs monorepo migration first |
| Citizens Learn (education directory) | Phase 5 |
| Citizens Impact (community projects) | Phase 5 |
| Citizens Social (relationship building) | Phase 6; needs its own planning session |
| Citizens Play (event tools) | Phase 4 |
| Citizens Central function | Implemented as the Kingdom Commons global search on the landing page; not a separate app |
| Push notifications (FCM/APNs) | FCM/APNs credentials not yet set up; in-app notifications work |
| Mapbox migration | Not needed — MapLibre + MapTiler is the correct stack |
| Calendar (FullCalendar) improvements | FullCalendar is removed; simple glass overlay replaces it |

---

## PART 9 — BRAND & DESIGN TO-DOS (OWNER ACTION REQUIRED)

These cannot be done in code — they require decisions or assets from you.

| # | Action | Priority |
|---|---|---|
| T1 | **Logo design** — Crown icon (regal, slight tilt, geometric, minimal). Suggested AI tools: Midjourney (best for concept exploration), then Figma or Illustrator for final SVG. Need: full wordmark, icon only, favicon. | High |
| T2 | **Domain registration** — Register `kingdomcommons.co.za` and `kingdomcommons.com` via Domains.co.za (local, ZARC+ICANN accredited). Register now before the name is taken. | High |
| T3 | **Vercel custom domain** — Once domain is registered, point it to the Vercel deployment and add SSL. | High |
| T4 | **MapTiler environment variables** — Add `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` to Vercel dashboard (Production + Preview + Development). This fixes BUG-02. | Urgent |
| T5 | **PayFast account setup** — Complete PayFast merchant registration and obtain API keys (sandbox first). | Medium |
| T6 | **CASI contact** — Reach out to CASI (info@casi-app.com · 010 001 4458 · Loftus Park, Arcadia) to discuss API/partnership for the SOS integration. | Medium |
| T7 | **Supabase admin role** — Confirm your own Supabase profile has `role = admin` in the `profiles` table. Run: `select role from profiles where id = auth.uid();` | Urgent |
| T8 | **First real user test** — Invite one ministry contact (e.g., Every Nation Mooikloof — already seeded) to visit the live site, create an account, and explore. Watch and record what breaks or confuses them. | High |
| T9 | **Contributor Agreement draft** — Write the faith-aligned content standard that contributors agree to at signup. Brief, plain language. Needed before real contributor onboarding begins. | Medium |

---

## PART 10 — BATCH EXECUTION ORDER

Execute in this exact order. Do not start a new batch until the previous one is verified (tsc 0 errors, all tests pass, lint clean).

### Batch 1 — Fix Admin Approval + Admin Panel Restructure
**Fixes:** BUG-01, BUG-10
**Removes:** Admin links from burger bar
**Builds:** Clean `/admin` dashboard with working contributor approval flow
**Verify:** Submit a test contributor application → admin can see it → approve it → applicant profile updates correctly

### Batch 2 — Legacy Cleanup + Map Style Fix + Remove Calendar/Featured Panel
**Fixes:** BUG-02, BUG-07, BUG-08, BUG-09, BUG-06 (Supabase security ERRORs)
**Removes:** Leaflet, FullCalendar, FeaturedPanel, admin items from burger bar (if not done in Batch 1), old role name strings
**Builds:** Simple glass-overlay calendar (FEAT-02)
**Updates:** README, VISION.md, copilot-instructions.md
**Creates:** `docs/FUTURE_IDEAS.md`, `docs/archive/AGENTS_LEGACY.md`
**Verify:** Map shows custom MapTiler style on deployed site; calendar opens as glass overlay; no Leaflet/FullCalendar imports remain

### Batch 3 — Organisation Profiles & Discovery
**Fixes:** BUG-04
**Builds:** FEAT-03 (Organisation Profile Panel + Organisation Search)
**Verify:** Tap organiser name on any event → organisation profile opens in right panel with upcoming events, past events, gallery, social links, follow button

### Batch 4 — Consider → Convince Complete Implementation
**Fixes:** BUG-03
**Builds:** FEAT-04 (full Convince mechanic, Considerations burger bar section, friend notifications)
**Verify:** Consider an event → it appears in burger bar; open friends tab → see friends' considerations; tap Convince → friend receives notification

### Batch 5 — Broadcast Updates
**Fixes:** BUG-05
**Builds:** FEAT-05 (contributor posting interface + citizen read feed + notifications)
**Verify:** Contributor posts an update from event manage view → attending citizens receive notification → update appears in event detail panel

### Batch 6 — Profile Schema + Global Label System + Monorepo Prep
**Builds:** Extended `profiles` schema, `content_labels` table, auto-label trigger, monorepo folder structure (without migrating yet)
**Note:** This is architecture work, not a user-facing feature. It is the foundation for Citizens Wear.

### Batch 7 — Citizens Wear Setup (after monorepo migration)
**Note:** Full Wear planning session needed before this batch begins. Wear has its own feature set and design vision.

### Batch 8 — PayFast Billing Foundation
**Builds:** FEAT-06 (event count tracking, bill preview, PayFast integration when ready)
**Note:** Can be executed in parallel with Batch 7 if PayFast credentials are ready

---

## PART 11 — SIMPLIFIED SESSION WORKFLOW

Replace the 11-agent system with this simpler workflow for every development session.

```
1. READ this document (MASTER_DIRECTION.md) — confirm which batch you're on
2. READ RESUME_HERE.md — confirm current test count, last commit, open blockers
3. EXECUTE the current batch spec (from Part 10 above)
4. RUN quality gate:
   npx tsc --noEmit          → expect 0 errors
   npx vitest run            → expect 0 failures
   npx next lint --dir src   → expect clean
5. ARCHITECT REVIEW (inline, not a separate agent):
   - Does this change introduce any security risk? (auth bypass, data leak, injection)
   - Does this change break any existing user journey?
   - Is there a simpler way to achieve the same result?
6. If all pass → push to origin/main
7. UPDATE RESUME_HERE.md with: what shipped, test count, next batch
8. Done.
```

---

## PART 12 — VISION STATEMENT (for VISION.md)

> Citizens Connect is the map-first community discovery platform for the Body of Christ in South Africa — and eventually, the world.
>
> We exist because the Kingdom is alive and active every day in thousands of events, communities, churches, businesses, and acts of service — and most people never find them. We change that.
>
> Every believer is relevant. Every ministry matters. Every gathering deserves to be found. This platform is the place where the Kingdom makes itself visible — where what God is doing becomes discoverable, connectable, and participable by anyone who wants to be part of it.
>
> We build with excellence. We charge as little as possible — especially for small, emerging voices. We collaborate before we compete. We connect before we market.
>
> *"You are no longer strangers and foreigners, but fellow citizens."* — Ephesians 2:19

---

*Document version: 1.0 · May 2026 · Prepared from planning session with full codebase audit*
*Next review: After Batch 3 is complete*
*Owner: Citizens Network PBO*
