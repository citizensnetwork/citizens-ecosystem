# HTML Frontend Migration Plan
### Citizens Connect — Design-to-Production Analysis
### Produced: June 7, 2026

---

## EXECUTIVE SUMMARY

The HTML design (`Citizens Connect.zip`) is a **complete, production-quality UI** built in React
(no framework, just browser React + Babel + Tailwind CDN). It covers every screen in the app.
It is **100% mock data** — no Supabase calls, no API calls, no auth. It is a pixel-perfect
prototype that needs to be wired to the real Next.js backend.

The plan is clear: **keep the design's JSX files as the frontend, delete all Next.js page files,
and replace every `DATA.*` / local state call with a real `fetch()` to your existing `/api/*`
routes.** The backend (API routes, Supabase, middleware, auth) stays completely untouched.

---

## PART 1 — WHAT THE DESIGN CONTAINS

### Screens (all present, all complete)

| File | Screen | Route equivalent |
|---|---|---|
| `app/home.jsx` | Discover map (full screen, preview panel, category filter) | `/events` |
| `app/map.jsx` | SVG prototype map + markers + bubbles | replaces `EventMap.tsx` |
| `app/profiles.jsx` | Event profile, Place profile, Contributor profile | `/events/[id]`, `/places/[id]`, `/c/[slug]` |
| `app/dashboard.jsx` | Contributor dashboard (stats, events, messages, tools, broadcast) | `/c/[slug]/dashboard` |
| `app/insights.jsx` | Analytics/Insights page | `/c/[slug]/dashboard/analytics` |
| `app/admin.jsx` | Admin panel (applications, users, reports, content) | `/admin` |
| `app/apply.jsx` | Contributor application + onboarding | `/contributor/apply`, `/contributor/setup` |
| `app/create.jsx` | Create event / place sheet | `/events/new`, `/places/new` |
| `app/messages.jsx` | Messages (conversation list + chat view) | `/messages` |
| `app/pages.jsx` | Kingdom Projects (community), Settings, Notifications | `/community`, `/settings`, `/notifications` |
| `app/shell.jsx` | App shell: sidebar, bottom nav, profile panel, router | `AppShell.tsx` |
| `app/store.jsx` | State management (all actions, mock data references) | All API hooks |
| `app/ui.jsx` | Shared UI components (Button, Avatar, Field, Toggle, etc.) | `src/components/ui/` |
| `app/data.jsx` | All mock data (events, places, contributors, etc.) | Supabase tables |
| `app/icons.jsx` | Icon wrapper (Lucide) | Already matches your stack |

### Design system (already matches your codebase)

The design uses **identical tokens** to what's already in your Next.js app:
- Same colour palette: `#F7F4EE` background, `#0A0908` foreground, `#C9A84C` gold
- Same fonts: Playfair Display (serif/display) + Plus Jakarta Sans (body)
- Same glassmorphism system: `.glass`, `.glass-strong`, `backdrop-blur`
- Same animations: `fade-in`, `slide-up`, `scale-in`, `pin-pulse`
- Same icon library: Lucide

**This is not a conflict — it's an advantage.** Your design system is already consistent.

---

## PART 2 — THE ONE BIG DIFFERENCE: THE MAP

### Design map (current)
The `app/map.jsx` uses an **SVG prototype map** — a hand-drawn decorative street grid with
deterministic pseudo-random roads, parks, and a river. It looks great for demos but has no
real geo data, no real tiles, and no MapLibre.

### Production map (what you have)
Your codebase uses **MapLibre GL JS + MapTiler** ("Kingdom Commons" style) with:
- Real GPS coordinates for all events and places
- 130+ database entries with `lat`/`lng`
- Custom markers, prominence tiering, map bubbles
- Geolocation (Capacitor)
- All of that complex marker/deconfliction code in `src/lib/map/`

### Decision required
You need to decide which map you want in the final product:

**Option A — Keep your real MapLibre map (recommended)**
Wire the design's home screen UI (header, category pills, preview panel, filter sheet) around
the existing `EventMap.tsx`. The prototype SVG map is replaced by the real map tile engine.

**Option B — Use the prototype SVG map**
Only viable for inner-city Pretoria demos where exact GPS isn't critical. Loses real-time geo,
real event positions, and all the prominence/clustering work already built.

**Recommendation: Option A.** The design's map UI elements (header, pills, preview panels,
filter sheet) are all separable from the SVG map backdrop. Replace the SVG with MapLibre,
keep everything else.

---

## PART 3 — FEATURE GAP ANALYSIS

### Features in the design that exist in your backend ✅ (wire up)

| Design feature | Backend route/table | Notes |
|---|---|---|
| RSVP (Connect/Consider) | `POST /api/rsvp` | Already implemented |
| Event profiles | `GET /api/events/[id]` | Full detail endpoint exists |
| Place profiles | `GET /api/events` (places table) | Full detail exists |
| Contributor profiles | `GET /api/contributors` | `/api/v1/contributors` |
| Messages / DMs | `GET/POST /api/conversations` | Full messaging system exists |
| Notifications | `GET /api/notifications` | Full notification system |
| Admin panel (applications) | `GET /api/admin` | Full admin routes |
| Contributor dashboard | `GET /api/dashboard` | Stats endpoints exist |
| Analytics/Insights | `GET /api/contributor/[handle]/analytics` | Full analytics + export |
| Create event | `POST /api/events` | Full CRUD exists |
| Create place | `POST /api/places` (via manage routes) | Full CRUD exists |
| Broadcast tool | `POST /api/contributor/[handle]/broadcasts` | Full broadcast system |
| Contributor application | `POST /api/contributor` | Application flow exists |
| Search | `POST /api/ai-search` + `GET /api/search/autocomplete` | AI-powered search |
| Share / Consider / Convince | `/api/shares`, `/api/consider`, `/api/convince` | All exist |
| Volunteer apply | `POST /api/events/[id]/volunteers` | Full volunteer system |
| Follow / unfollow | `POST /api/follow`, `POST /api/place-follow` | Exists |
| Push notifications | `POST /api/push-token` | Infrastructure wired |
| Map bubbles | `GET /api/map/bubbles` | Live event update bubbles |
| Kingdom Projects (community) | `POST /api/suggestions` | Community idea submission |
| Reports | `POST /api/reports` | Reporting system exists |
| Settings | `PATCH /api/account` | Account settings endpoint |

### Features in the design that DON'T exist yet ⚠️ (flag for build)

| Design feature | Gap | Effort |
|---|---|---|
| **Insights "Vision" dashboard** (`app/insights.jsx`) | The analytics exist but the Vision-style dashboard (org reach, city map, funder report) is Citizens Vision, not Connect. Connect has analytics but not this full intelligence layer | Medium — the data exists, it's a UI build |
| **Impact Ideas voting** (thumbs up / vote % bar) | The `suggestions` table exists and idea submission works, but voting mechanics (vote counts, thresholds, status transitions) are Phase 6 — not yet built | Medium — needs DB schema + RPC |
| **"Confirmed Kingdom Project" collaborator count** | Same — voting/confirmation flow not yet built | Depends on above |
| **Assist mode banner** (admin acting as contributor) | The admin-on-behalf system exists in code, but the "Assist mode" UI banner in the design isn't wired | Small — UI only |
| **Role switcher in profile panel** (Citizen / Contributor / Admin toggle) | This is a demo/dev tool in the design. In production, roles come from Supabase `profiles.role` — no toggle needed | Remove from production build |
| **Tweaks panel** (`app/tweaks.jsx`, `app/tweaks-panel.jsx`) | Pin style / bubble style / creation style switcher — this is a design prototype tool, not a production feature | Remove from production build |

### Features in your backend that aren't in the design yet 📋 (keep, add to design)

| Backend feature | Status | Action |
|---|---|---|
| **Convince mechanic** (friend nudging) | Fully built in backend | Add to design's Consider flow |
| **Map prominence tiering** (dot → mid → full → photo) | Fully built | Needs to connect to MapLibre map, not SVG |
| **Map bubbles** (event update speech bubbles) | Fully built | Add to real map layer |
| **Weekly contributor digest** (email/notification) | Fully built in edge functions | No UI needed |
| **Push notification preferences** | Fully built | Add toggle to Settings screen |
| **Broadcast reactions** (5 emoji, anonymous) | Fully built | Add to broadcast cards in design |
| **Per-event notify opt-out** | Fully built | Add to RSVP flow |
| **Team management** (invite, transfer ownership) | Fully built | Add to dashboard Tools tab |
| **Volunteer manager** (approve/decline with reason) | Fully built | Add to dashboard Tools tab |
| **Handle change** (30-day cooldown) | Fully built | Add to Settings |
| **Contributor keyword bank** | Fully built | Add to Settings / onboarding |
| **AI search** | Fully built | Wire to search bar in design |
| **Capacitor geolocation** | Wired | Connect to "Near me" filter |

---

## PART 4 — THE MIGRATION PLAN

### Phase 1 — Foundation (do first, enables everything else)

1. **Copy the design's `app/` directory into your repo** as `src/frontend/`
2. **Copy `Citizens Connect.html`** as the entry point for static serving
3. **Delete all `src/app/(page files)`** — keep only `src/app/api/` and `src/middleware.ts`
4. **Wire Supabase auth** — replace the design's `role` state + mock user with real Supabase session
5. **Add CORS headers** to `next.config.ts` for cross-origin calls from the HTML frontend
6. **Update `capacitor.config.ts`** to point `webDir` at the built HTML output

### Phase 2 — Data wiring (screen by screen)

Replace each `DATA.*` call and local state action in `store.jsx` with a real `fetch()` to the API.

**Priority order:**
1. Auth (login/logout/session) → Supabase client
2. Home / map (events + places) → `GET /api/map` or `GET /api/v1/events`
3. Event profile → `GET /events/[id]` data
4. RSVP / Consider → `POST /api/rsvp`
5. Contributor profile → `GET /api/v1/contributors`
6. Notifications → `GET /api/notifications`
7. Messages → `GET/POST /api/conversations`
8. Dashboard → `GET /api/dashboard` + analytics
9. Admin → `GET /api/admin/*`
10. Create event/place → `POST /api/events`

### Phase 3 — Map replacement

Replace the SVG `MapBackdrop` + `Marker` components in `app/map.jsx` with the real MapLibre
map, wiring the existing `EventMap.tsx` logic into the design's home screen shell.

### Phase 4 — Capacitor mobile build

Once Phase 1–2 are done and the app is running as a static HTML app:
```bash
npm run build        # or: copy built files to out/
npm run cap:sync     # sync to Android + iOS
npm run cap:open:android
```

---

## PART 5 — WHAT TO DO WITH THE DESIGN FILES RIGHT NOW

### Can you open and run the design as-is?

**Yes.** Open `Citizens Connect.html` in any browser. It runs completely standalone. You'll see
the full UI with mock data. Use this for demos — it works today, right now, without a server.

### For the June 9 WCI presentation

The design HTML file is **immediately usable as a demo tool**. Open it on a phone or laptop
and walk through the full UI flow. It looks and works exactly like the production app will.

> **Founder action:** Open `Citizens Connect.html` from the zip. Navigate through all screens.
> Note any screens that need changes for the presentation. This can be your demo on June 9.

---

## PART 6 — QUESTIONS FOR THE FOUNDER

Before starting the wiring work, confirm:

| # | Question | Impact |
|---|---|---|
| Q1 | Keep the real MapLibre map (recommended) or use the SVG prototype map? | Determines Phase 3 scope |
| Q2 | Should the Tweaks panel (pin style / bubble style switcher) be included in production, or removed? | It's a dev tool — recommend removing |
| Q3 | Should the role-switcher (Citizen/Contributor/Admin toggle) be in production? | It's a demo tool — in production, roles come from Supabase |
| Q4 | Is the Insights/Vision dashboard in scope for Connect, or is it Citizens Vision only? | Medium build scope |
| Q5 | Should Impact Ideas voting be built before or after June 9? | Medium build scope |

---

## PART 7 — BOTTOM LINE

| Question | Answer |
|---|---|
| Will this HTML design work? | **Yes, completely.** It's a full production-quality UI. |
| Does it cover all your screens? | **Yes** — map, profiles, dashboard, admin, messages, notifications, settings, apply, create, community. |
| Is anything missing vs your backend? | **Some features** (voting, full Vision insights) — all flagged above. |
| How much work to wire it to your backend? | **Significant but clear** — every API route already exists. It's data wiring, not feature building. |
| Can you demo it on June 9? | **Right now, today** — open the HTML file. No server needed. |
| Does scrapping the Next.js UI require any backend changes? | **Zero** — the API routes, Supabase, middleware, auth are completely untouched. |

---

*Document version: 1.0 · June 7, 2026*
*Next action: Founder reviews this doc, answers Q1–Q5, then wiring begins.*
