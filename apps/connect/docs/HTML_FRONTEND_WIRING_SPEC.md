# Citizens Connect — HTML Frontend Wiring Specification
### Version 1.0 · June 7, 2026
### Status: Ready to implement — all decisions locked

---

## PURPOSE OF THIS DOCUMENT

This is the single source of truth for replacing the Citizens Connect Next.js frontend with the
HTML/React design prototype. It covers every architectural decision, all feature specifications,
the voting system design, the build order, and the open future-build items. Reference this at
the start of every implementation session.

---

## PART 1 — THE GOAL IN ONE PARAGRAPH

Scrap every Next.js frontend page/component entirely. Keep the Next.js API routes, Supabase
integration, and middleware completely untouched. Replace the frontend with the HTML/React design
prototype from `Citizens Connect Map.zip` (v2), wiring each screen's mock `DATA.*` calls to real
`fetch()` calls against the existing `/api/*` endpoints. Deploy the wired HTML app as the
Capacitor `webDir` so it becomes the iOS and Android mobile app simultaneously.

---

## PART 2 — WHAT EXISTS

### The design (source of truth for UI)
- Location: `Citizens Connect Map.zip` (v2, June 7 2026)
- Entry point: `Citizens Connect.html`
- Tech: Browser React 18 + Babel standalone + Tailwind CDN — no build step required
- Files: 19 JSX files in `app/`, Supabase auth reference in `supabase-auth.js`

### Screens in the design (all complete, all to be wired)

| File | Screen | Maps to backend |
|---|---|---|
| `app/auth.jsx` | Landing + Google sign-in | Supabase OAuth |
| `app/home.jsx` | Discover (map home) | `/api/map`, `/api/v1/events` |
| `app/map.jsx` | Map layer (SVG prototype → replace with MapLibre) | MapLibre GL + MapTiler |
| `app/profiles.jsx` | Event / Place / Contributor profiles | `/api/events/[id]`, `/api/v1/contributors` |
| `app/dashboard.jsx` | Contributor dashboard | `/api/dashboard`, `/api/contributor/[handle]/*` |
| `app/insights.jsx` | Analytics + volunteer manager + admin overview | `/api/contributor/[handle]/analytics`, `/api/admin` |
| `app/admin.jsx` | Admin panel (applications, overview, reports) | `/api/admin/*` |
| `app/apply.jsx` | Contributor application + onboarding | `/api/contributor` |
| `app/create.jsx` | Create event / place sheet | `/api/events`, `/api/manage` |
| `app/messages.jsx` | Messages (list + chat) | `/api/conversations` |
| `app/pages.jsx` | Kingdom Projects, Notifications, Settings | `/api/suggestions`, `/api/notifications`, `/api/account` |
| `app/shell.jsx` | App shell, nav, auth gate | Supabase session |
| `app/store.jsx` | State + actions (all to be wired to API) | All endpoints |

### The existing backend (keep 100% untouched)
- 30+ API route namespaces in `src/app/api/`
- Supabase project: 130 migrations, full RLS, edge functions
- `src/middleware.ts`: auth + session enforcement
- Capacitor: fully scaffolded (`android/`, `ios/`, `capacitor.config.ts`)

---

## PART 3 — ALL DECISIONS LOCKED

### Auth & roles (Section A)

**A1 — Admin assignment**
- `profiles.role` enum: `citizen` (default) | `contributor` | `admin`
- Admin is never self-assigned — set directly in Supabase by Stephen only
- Contributor role is granted only after: apply → admin approval → onboarding flow completes
- The `supabase-auth.js` file in the design is the exact wiring spec — implement as written
- SQL trigger auto-creates a `profiles` row on signup (as specified in `supabase-auth.js`)
- `wants_contributor` boolean captured at sign-up intent, stored on `profiles`, routes user to `/apply` on first login

**Role differences (what each role sees — implement these)**

| Feature | Citizen | Contributor | Admin |
|---|---|---|---|
| Discover map | ✅ Full | ✅ Full | ✅ Full |
| RSVP / Consider | ✅ | ✅ | ✅ |
| Vote on Ideas | ✅ | ✅ | ✅ |
| Submit Idea | ✅ | ✅ | ✅ |
| Messages | ✅ (citizen DMs) | ✅ (org inbox + citizen DMs) | ✅ |
| Notifications | ✅ | ✅ | ✅ |
| Kingdom Projects | ✅ (vote, view) | ✅ (vote, view, own projects) | ✅ (full) |
| Dashboard | ❌ | ✅ (their org only) | ❌ (uses Admin panel) |
| Create event/place | ❌ | ✅ (their org only) | ✅ (any org) |
| Broadcast | ❌ | ✅ (their org) | ✅ (platform) |
| Volunteer manager | ❌ | ✅ (their events) | ✅ (all) |
| Analytics / Insights | ❌ | ✅ (their org) | ✅ (platform-wide) |
| Apply to contribute | ✅ (CTA in sidebar) | ❌ | ❌ |
| Admin panel | ❌ | ❌ | ✅ |
| Assist mode | ❌ | ❌ | ✅ |

### Insights / Vision (Section B)

**B1 — Who sees what**
- Contributors: their own org analytics inside Dashboard → Tools → Analytics tab
- Admins: platform-wide stats (citizen count, contributor count, weekly growth chart, activity feed) in the Admin panel Overview tab
- These are separate views, not the same component

**B2 — City reach map data source**
- Use the location stored on the user's `profile` row at the moment they RSVP — not their home-location setting, not a live GPS reading
- Specifically: when a user RSVPs to an event, snapshot their current `profiles.location` (city/neighbourhood) and store it on the RSVP row
- This requires a migration: add `location_snapshot text` column to the `rsvps` table
- The city reach map then aggregates `rsvps.location_snapshot` per contributor's events

**B3 — Funder report**
- Build a distinct funder-facing PDF (not the existing CSV/XLSX export)
- PDF contains: org name, period, event count, RSVP totals, volunteer totals, reach map, top events by engagement, Kingdom Projects contributed to
- Generated server-side at `/api/contributor/[handle]/funder-report` → returns a downloadable PDF
- Wire to the "Generate funder report" button in the Analytics panel

### Map (confirmed earlier)

- Use the real MapLibre GL + MapTiler map (not the SVG prototype)
- Replace `app/map.jsx`'s `MapBackdrop` + `Marker` SVG components with the existing `EventMap.tsx` logic
- Keep all home screen UI chrome (header, category pills, filter sheet, preview panel) from the design
- Tweaks panel removed — use first/default option of each: `pinStyle = 'teardrop'`, `bubbleStyle = 'speech'`, `creationStyle = 'sheet'`

---

## PART 4 — KINGDOM PROJECTS / IMPACT IDEAS VOTING SYSTEM

### 4.1 Overview

The Kingdom Projects page (currently `app/pages.jsx` → `CommunityPage`) shows community ideas
in three states: Voting → In Process → Confirmed. This is backed by the `suggestions` table
(currently only has basic submission) and requires new voting infrastructure.

### 4.2 Vote threshold tiers (LOCKED)

Submitter chooses their tier at idea submission time. Admin can override from the dashboard.

| Tier | Vote range | Effect on threshold |
|---|---|---|
| Small Volunteer Project | 1–20 votes | Submitter picks exact number in 1–20 |
| Community Project | 20–100 votes | Submitter picks exact number in 20–100 |
| Town Project | 100–1,000 votes | Submitter picks exact number in 100–1,000 |
| Funders Challenge | Fixed: 5,000 | No submitter choice — automatically set |
| Provincial Vision | Fixed: 10,000 | No submitter choice — automatically set |

**Implementation notes / best practices applied:**
- UI shows a segmented control for tier selection, then a slider for exact threshold (where applicable)
- "Funders Challenge" and "Provincial Vision" tiers auto-set the threshold and lock the slider
- Admin can edit the tier + threshold of any idea at any time from the admin panel
- Store `tier` (enum) and `vote_threshold` (integer) on the `suggestions` table
- Suggested addition: store `tier_label` as a display string so UI doesn't need to re-derive it

### 4.3 Who can vote

- All authenticated users (citizens + contributors + admin) can vote
- Unauthenticated visitors can see the voting UI but are prompted to sign in when they try to vote
- One vote per user per idea (enforced at DB level with unique constraint on `idea_votes` table)
- Votes are retractable — user can un-vote. Toggle behaviour matches the design ("Collaborate" ↔ "Voted — click to undo")

### 4.4 Status transitions (LOCKED)

**Voting → In Process (automatic for Small Volunteer + Community tiers)**

When `vote_count >= vote_threshold` AND tier is `small_volunteer` or `community`:
1. Status automatically moves to `in_process`
2. All voters are notified via the notification system (`/api/notifications`)
3. Initial idea submitter is assigned as `project_lead`
4. An Event is auto-created at the idea's map location:
   - Owner: initial idea submitter
   - Title: idea title
   - Category: idea category
   - Description: idea description + "This is a confirmed Kingdom Project."
   - Location: idea location coordinates
   - Visible on map under the Ideas/Projects filter
5. All voters are automatically RSVPd (`connected`) to the new event
6. The project lead now has the full contributor-dashboard feature set for this event:
   - Can broadcast messages to connected users
   - Can receive and respond to comments
   - Can message associated users directly

**Voting → In Process (manual for Town Project, Funders Challenge, Provincial Vision)**

For tiers above `community`, auto-transition is disabled. Threshold hit triggers:
1. Admin notification: "Idea X has reached its vote threshold — review for In Process"
2. Admin manually approves the transition from the admin panel
3. Same downstream effects as automatic transition once admin approves

**In Process → Confirmed**

For all tiers:
- Admin manually marks as Confirmed from the admin panel
- Confirmed status is visible to all users on the Kingdom Projects page
- Confirmed ideas show collaborator count (count of connected users on the associated event)

### 4.5 Database schema additions required

```sql
-- Add to suggestions table
alter table public.suggestions add column if not exists
  tier text not null default 'community'
  check (tier in ('small_volunteer','community','town','funders_challenge','provincial_vision'));

alter table public.suggestions add column if not exists
  vote_threshold integer not null default 50;

alter table public.suggestions add column if not exists
  status text not null default 'voting'
  check (status in ('voting','in_process','confirmed'));

alter table public.suggestions add column if not exists
  project_lead_id uuid references auth.users(id);

alter table public.suggestions add column if not exists
  associated_event_id uuid references public.events(id);

-- New table: idea votes
create table if not exists public.idea_votes (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.suggestions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (idea_id, user_id)  -- one vote per user per idea
);
alter table public.idea_votes enable row level security;
create policy "users can vote" on public.idea_votes
  for insert with check (auth.uid() = user_id);
create policy "users can retract vote" on public.idea_votes
  for delete using (auth.uid() = user_id);
create policy "votes are public" on public.idea_votes
  for select using (true);

-- Add location snapshot to rsvps (for city reach map — B2)
alter table public.rsvps add column if not exists
  location_snapshot text;

-- RPC: vote on idea (handles toggle + auto-transition check)
create or replace function public.vote_on_idea(p_idea_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_existing uuid;
  v_count    integer;
  v_idea     record;
begin
  -- toggle
  select id into v_existing from public.idea_votes
    where idea_id = p_idea_id and user_id = auth.uid();
  if v_existing is not null then
    delete from public.idea_votes where id = v_existing;
    return jsonb_build_object('action','removed');
  else
    insert into public.idea_votes (idea_id, user_id) values (p_idea_id, auth.uid());
    -- check threshold
    select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;
    select * into v_idea from public.suggestions where id = p_idea_id;
    if v_idea.status = 'voting' and v_count >= v_idea.vote_threshold
       and v_idea.tier in ('small_volunteer','community') then
      -- auto-transition (trigger or function call handles event creation + notifications)
      perform public.transition_idea_to_in_process(p_idea_id);
    end if;
    return jsonb_build_object('action','added','vote_count',v_count);
  end if;
end; $$;
```

### 4.6 Future development notes (build later, not now)

The following are noted here for future in-depth planning sessions:

- **Town Project, Funders Challenge, Provincial Vision flows** — detailed admin review workflow, funder matching, provincial authority engagement, multi-org collaboration tools
- **Project lead transferability** — ability for a project lead to hand off leadership to another user
- **Collaborator roles on projects** — sub-roles within an In Process project (coordinator, volunteer, sponsor)
- **Project milestones and progress tracking** — percentage complete, milestone dates
- **External funder matching** — automated matching of Funders Challenge ideas to registered funders
- **Cross-org collaboration** — multiple contributor orgs formally co-owning a project
- **Idea expiry** — what happens if an idea sits in Voting with no threshold hit after X months
- **Duplicate idea detection** — AI-powered duplicate flagging before submission

### 4.7 Impact Ideas on the map

- Ideas appear as pins on the Discover map **under the Ideas filter** (off by default)
- Pin icon: lightbulb SVG (as designed in `app/map.jsx` — keep as-is)
- Selecting the Ideas filter shows idea pins alongside (or instead of, based on filter state) event and place pins
- Clicking an idea pin opens the same preview panel pattern as events/places

---

## PART 5 — BUILD ORDER

### Phase 0 — Pre-build (before any code)
1. Apply the Supabase migrations in Part 4.5
2. Verify MapTiler env vars are set on Vercel: `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_MAPTILER_STYLE`
3. Add CORS headers to `next.config.ts` for the HTML frontend origin
4. Copy `app/` directory from zip into `src/frontend/app/`
5. Copy `Citizens Connect.html` into `src/frontend/`

### Phase 1 — Auth wiring (enables everything else)
Wire `app/auth.jsx` → Supabase Google OAuth using `supabase-auth.js` as the exact spec.
Replace `store.jsx`'s mock `signIn`/`signOut` with real Supabase calls.
Session persistence stays as-is (localStorage). Role comes from `profiles.role`.

### Phase 2 — Map + home screen (first visible win)
Replace `app/map.jsx` SVG map with MapLibre GL + MapTiler.
Wire event/place/idea pins to real data from `/api/map/bubbles` and `/api/v1/events`.
Wire category filter pills to real category data.
Wire preview panel to real event/place data.
**This is the June 9 target — real map + real seeded data.**

### Phase 3 — Core screens (screen by screen)
Priority order:
1. Event profile → `GET /api/events/[id]`
2. RSVP / Consider → `POST /api/rsvp`
3. Contributor profile → `GET /api/v1/contributors`
4. Notifications → `GET /api/notifications`
5. Messages → `GET/POST /api/conversations`
6. Kingdom Projects → `GET/POST /api/suggestions` + new voting RPC
7. Contributor dashboard → `GET /api/dashboard` + analytics
8. Create event/place → `POST /api/events`
9. Admin panel → `GET/POST /api/admin/*`
10. Settings → `PATCH /api/account`

### Phase 4 — Advanced features
> ⚠️ **Read [PHASE_4_5_ADDENDUM.md](./PHASE_4_5_ADDENDUM.md) § A before starting this phase** —
> adds the data-access policy, shared rate-limit store, ecosystem data-plane decisions,
> and the deferred schema/product decisions (idea→event date, location_snapshot source,
> event↔place FK, schema.sql drift).
1. Funder report PDF generation (`/api/contributor/[handle]/funder-report`)
2. City reach map (RSVP location snapshot aggregation)
3. Impact Ideas auto-transition + event creation on threshold hit
4. Volunteer manager wiring
5. Broadcast reactions
6. Convince mechanic

### Phase 5 — Capacitor mobile build
> ⚠️ **Read [PHASE_4_5_ADDENDUM.md](./PHASE_4_5_ADDENDUM.md) § B before starting this phase** —
> the commands below are NOT the whole phase. Missing prerequisites documented there:
> frontend build step (kill Babel-standalone), OAuth deep links, multi-origin CORS for
> `capacitor://localhost`, push wiring (F1/F2), native geolocation, store compliance.
Once Phase 3 is complete:
```bash
npm run build          # builds HTML frontend into out/
npm run cap:sync       # syncs to Android + iOS
npm run cap:open:android
# test → wire FCM push → submit to Play Store
# test iOS → wire APNs → submit to App Store
```

---

## PART 6 — WHAT TO DELETE FROM THE NEXT.JS CODEBASE

When Phase 1 begins, delete these directories and files:

```
src/app/(all page.tsx files)   ← every route page
src/app/layout.tsx             ← Next.js root layout
src/app/globals.css            ← Next.js global styles (HTML has its own)
src/app/page.tsx               ← landing page
src/app/default.tsx
src/components/                ← all React components
src/hooks/                     ← all hooks (logic moves to store.jsx)
```

**Keep everything in:**
```
src/app/api/         ← ALL API routes — do not touch
src/middleware.ts    ← auth enforcement — do not touch
src/lib/             ← all business logic — do not touch
src/types/           ← TypeScript types — do not touch
supabase/            ← migrations, edge functions — do not touch
```

---

## PART 7 — WHERE TO IMPLEMENT

**Recommendation: Claude Code (not Cowork)**

Reasons:
- The work is primarily file operations: deleting Next.js pages, copying HTML app files, editing `next.config.ts`, running Supabase migrations, wiring `fetch()` calls screen by screen
- Claude Code has direct filesystem access, can run `npm` and `supabase` CLI commands, and can execute the migration SQL
- Cowork is better suited for non-developer automation tasks — this is deep codebase surgery
- The session can reference this MD file directly as context at the start of each session

**How to start a session in Claude Code:**
```
"Read docs/HTML_FRONTEND_WIRING_SPEC.md and docs/ARCHITECTURE_AND_MIGRATION_STRATEGY.md, 
then continue from Phase [X] of the build order."
```

---

## PART 8 — DESIGN TOKENS (reference)

The HTML design's colour system — use these when building any new UI components:

| Token | Value | Usage |
|---|---|---|
| `background` | `#F7F4EE` | App background |
| `foreground` | `#0A0908` | Primary text |
| `card` | `rgba(255,255,255,0.82)` | Card surfaces |
| `primary` | `#0A0908` | Primary buttons |
| `secondary` / `gold` | `#C9A84C` | Gold accent |
| `gold-light` | `#E8D48B` | Gold highlight |
| `gold-dark` | `#8B6914` | Gold text/icon |
| `muted` | `#EDE8DC` | Muted backgrounds |
| `muted-foreground` | `#7A7060` | Muted text |
| `accent` | `#F2E8CC` | Accent fills |
| `border` | `rgba(201,168,76,0.22)` | Borders |
| Font (sans) | Plus Jakarta Sans | Body text |
| Font (display) | Playfair Display | Headings |

---

## PART 9 — OPEN QUESTIONS / FUTURE SESSIONS

These do not block Phase 1–2 but need answers before their respective phases:

| # | Question | Blocks |
|---|---|---|
| F1 | Is there a Firebase project for FCM push (Android)? | Phase 5 |
| F2 | Is Apple Developer Program enrolled? | Phase 5 |
| F3 | What is the production domain for the HTML frontend? (needed for CORS + Supabase redirect URL) | Phase 1 |
| F4 | Should the "Community Covenant & Privacy Policy" link on the auth screen point to `/terms`? | Phase 1 |

---

*Document version: 1.0 · June 7, 2026*
*Authors: Stephen (Citizens Network PBO) + Claude*
*Reference alongside: `docs/ARCHITECTURE_AND_MIGRATION_STRATEGY.md`*
*Next session: Open Claude Code, read this file, begin Phase 0.*
