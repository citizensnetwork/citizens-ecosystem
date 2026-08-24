# V1 Scope — Citizens Connect

> Companion to `RESUME_HERE.md` and `VISION.md`. This document defines what ships as v1 of Citizens Connect's core discovery loop, separate from the ecosystem's fuller Contributor/Vision/Wear ambitions. Open items are tracked explicitly at the end, not resolved here.
>
> **2026-08-24 update (RESUME_HERE.md §3AE):** the core loop below shipped — self-serve
> Contributor go-live (no admin wait), the list view renamed **Kingdom Discovery**
> (`kingdom-discovery.jsx`), and Contributors now actually appear on the map (they never did
> before, even once approved — see §3AE's root-cause note). Sections below are left as the
> session-1 record; §7/§8 status columns are updated in place rather than rewritten.

---

## 1. Current project state

- Citizens Connect is one of three live apps (Connect, Vision, Wear) in the `citizens-ecosystem` monorepo, sharing one Supabase project (`xyiajtrvhlxaeplsiajj`) under a locked cross-app data contract (`docs/SHARED_DB_CONTRACT.md`).
- The backend is mature: RLS on every table, SECURITY DEFINER hardening, audited admin impersonation, CI security scanning (OSV-Scanner), custom SMTP via Resend, 160+ disciplined migrations.
- The frontend is a standalone HTML/React app (`src/frontend/`) with Next.js serving as API-only. Screens are IIFE modules registered on `window`, routed by a single `nav.page` switch in `shell.jsx`.
- The map (`map.jsx`) is a working MapLibre GL + MapTiler implementation, centered on Pretoria by default, rendering category-colored pins with live/broadcast bubble states.
- A category taxonomy already exists (`CATEGORIES.md`, `data.jsx`): 17 event categories, 10 place categories, each with a hex color and Lucide icon.
- The path to appear on the platform today runs: apply as Contributor (4-step form) → manual admin approval → onboarding wizard → separately create an Event or a Place (each its own multi-step form with galleries, recurring dates, a volunteering toggle, and an optional launch broadcast).
- There is no scrollable list view as of the start of this session. Discovery was map-only.
- Recent development sessions (`RESUME_HERE.md` §3G onward) concentrated on Citizens Wear (a clothing/brand marketplace) and Citizens Vision (an analytics platform), plus ecosystem-wide infrastructure. Connect's own discovery loop had not had a dedicated session in that period.
- `README.md` at the Connect app root currently describes an unrelated "member data platform" and does not reflect the actual product.
- `docs/feature-clarity/` holds several unresolved "grill-me" planning documents (messaging, friends/social graph, reporting, search-and-discovery) and `docs/feature-clarity/map-layering.md` specifies a zoom-tiered, relevance-ranked marker reveal system. None of this is required for v1 and none of it blocks v1.

## 2. Features

### Live before this session
| Feature | Where |
|---|---|
| Map with category-colored pins, live/broadcast states, geolocation | `map.jsx` |
| Event and Place categories with color + icon | `CATEGORIES.md`, `data.jsx` |
| Apply-to-become-Contributor wizard | `apply.jsx` (`ApplyPage`) |
| Post-approval onboarding wizard | `apply.jsx` (`OnboardingPage`) |
| Create Event / Create Place wizard | `create.jsx` |
| Search bar + category filter chips on the map | `home.jsx` |
| Messaging, notifications, admin panel, contributor dashboard | `messages.jsx`, `admin.jsx`, `dashboard.jsx` |
| Connect / Consider (event) and Follow (place) interaction states | `store.jsx`, surfaced in `home.jsx` |

### Added session 1 (scoping)
| Feature | Where |
|---|---|
| Scrollable list view of Contributors, Places, and Events, with a type filter and search | `list.jsx` (renamed session 2, see below) |
| Map ↔ List toggle button in the Discover top bar | `home.jsx` |
| `list` page registered in the router | `shell.jsx` |
| V1-scope markers on fields/sections to drop from the v1 required path | `apply.jsx`, `create.jsx` (comments only — no behavior changed) |

### Added session 2 (2026-08-24 — RESUME_HERE.md §3AE)
| Feature | Where |
|---|---|
| Self-serve Contributor go-live — submitting the Apply form approves it immediately, no admin wait | `store.jsx` (`submitApplication`), `/api/contributor/apply`, migration 164 (`self_approve_contributor_application`) |
| `list.jsx` renamed to `kingdom-discovery.jsx` at every identifier level (file/component/route/nav) | `kingdom-discovery.jsx`, `home.jsx`, `shell.jsx`, `build-frontend.js`, `index.html` |
| Contributors now render on the map (the actual root fix — they never did before) | `home.jsx` markers array, `store.jsx` `adaptContributor()`, migration 164 `contributor_category` column |
| Contributor map category — fixed a real bug where the Apply wizard's category picker was silently discarded (sent to the wrong DB column) | migration 164, `/api/contributor/apply`, `/api/v1/contributors` |
| Founder-only hide/flag moderation safety net (backend only — no admin.jsx UI yet) | migration 164 (`set_contributor_hidden`), `/api/admin/contributors/hide` |
| Apply wizard trimmed from 4 steps to 3 per its own prior-session `DEFER TO V2` markers | `apply.jsx` |
| Playwright e2e suite (the merge gate) | `playwright.config.ts`, `e2e/kingdom-discovery.spec.ts` |

### Added session 3 (2026-08-24 — contributor self-service portal)
A prototype for this exact item (RESUME_HERE.md §3AE/§3AF: "explicitly the founder's NEXT
phase") had already been built in a prior, separate session and left uncommitted in that
session's scratchpad — never merged, never reviewed. This session verified it against V1_SCOPE
priorities, found its frontend was stale (built before this same day's self-serve go-live ship —
blind-copying would have reverted the admin-approval-gate removal, the `contributor_category`
map-pin fix, and the Kingdom Discovery rename), and hand-reconciled only the net-new pieces in.
Its migration (`167_place_status_open_hours_news_posts.sql`) had already been applied live and
was verified clean (0 ERROR, 0 new advisor findings) but was missing from the repo's migration
lineage — backfilled this session.

| Feature | Where |
|---|---|
| Edit + Cancel/Restore on your own Events and Places (dashboard, not admin) | `dashboard.jsx` (`EventManageCard`, `PlaceManageRow`), `create.jsx` (`CreateFlow` `editing` prop), `store.jsx` (`updateEvent`, `setEventStatus`, `updatePlace`, `setPlaceStatus`), migration 167 (`places.status`, `places.open_hours`) |
| Contributor Profile tab — bio/website/address/socials/logo/gallery, edit any time after onboarding | `dashboard.jsx` (`ProfileTab`), `store.jsx` (`updateContributorProfile`, reusing the already-validated `/api/contributor/profile`) |
| News — a contributor-authored update/story feed, shown on the dashboard and on the public listing | `dashboard.jsx` (`NewsPostForm`/`NewsPostRow`), `profiles.jsx` (News section on `ContributorProfilePage`), `store.jsx` (`createNewsPost`/`updateNewsPost`/`deleteNewsPost`), migration 167 (`news_posts` table + RLS) |
| Entry point: existing in-app Dashboard nav link (sidebar + bottom-nav), already gated `if (isContributor)` | `shell.jsx` — no new UI needed; a real `citizenscentral.co.za/dashboard` URL was considered and deferred (the SPA has no URL-based routing today — no pushState/history — so this would be new routing work, not just a page) |
| "Contributor Individual" clarified — confirmed to be the existing citizen community-event mechanic (`037_community_event_rate_limit.sql`: a Citizen posts one rate-limited public event, `role` never changes to `contributor`) | No code change — the dashboard's existing `isContributor` gate already correctly excludes these citizens from any dashboard access |

## 3. Objectives and plans

- Ship a minimal, repeatable loop: add a Contributor, Place, or Event with only essential fields; see it in a scrollable list; see it on the map with correct category color; open it for contact details and external links.
- Scope the platform to Pretoria only until this loop is proven, then scale outward.
- Keep Contributor, Place, and Event as three distinct concepts — this matches how the platform is already built and how the founder distinguishes them in practice (see §9).
- Treat everything beyond this loop — admin approval, galleries, recurring dates, volunteering, broadcasts, comments, sharing, an Instagram-style engagement layer — as a later phase, deliberately deferred, not deleted.

## 4. Project purposes

Citizens Connect exists inside the 219 initiative, named for Ephesians 2:19 — "you are no longer strangers and foreigners, but fellow citizens with the saints and members of the household of God." The platform's purpose follows directly from that verse:

- Turn strangers into fellow Citizens — help each believer find their tribe and their placement in God's building.
- Value every brick in the building — the smallest Contributor and the quietest Citizen are necessary parts of the whole, not a lesser tier.
- Gather and connect the saints rather than isolate them — the platform's purpose is unity and visibility, never a walled silo.
- Bring light and exposure to Christian activity across Pretoria, and increase connection between Citizens and Contributors.
- Slogan: Connecting the Kingdom.

v1's minimal scope serves this purpose directly: a Christian entity that cannot be found cannot be connected to. The fastest route to more real connection is a bigger, accurate, easy-to-join directory — not more features layered onto an empty one.

## 5. Current friction points discussed in our conversation

1. The admin-approval gate between applying and appearing on the platform makes the add → list → map → engage loop impossible to test end-to-end without personally acting as admin every time.
2. No scrollable list view existed; discovery was map-only.
3. The Create Event / Create Place forms present more fields as part of the core flow than a v1 listing needs (galleries, recurring dates, volunteering toggle, launch broadcast).
4. Recent engineering effort concentrated on Citizens Wear and Citizens Vision rather than Connect's own core discovery loop, even though Connect is the flagship / first-focus app.
5. Several planning documents (`docs/feature-clarity/*`, `map-layering.md`) describe advanced, unresolved features that add scope noise without being built yet.
6. `README.md` misdescribes the project.
7. Terminology needed explicit clarification: whether Contributor / Place / Event should collapse into one "entity" concept, and how individual vs. formally-established Contributors should be distinguished. Resolved in §9.

## 6. Solutions to frictions

1. Remove the admin-approval requirement from the v1 path; a Contributor's listing goes live immediately on submission.
2. Build a plain scrollable list screen reusing the existing category and data model.
3. Mark the non-essential fields and steps in `create.jsx` and `apply.jsx` as v1-deferred in place, so a future pass can drop them from the required path without losing the code.
4. Track effort allocation across the three apps explicitly as a portfolio-level decision, not just a Connect-level one (see §8).
5. Label deferred planning documents clearly as such so they stop competing for attention with v1 work (see §8).
6. Rewrite `README.md` to describe the actual product (see §8).
7. Keep Contributor, Place, and Event as three distinct concepts. Do not introduce a fourth "entity" table — "entity" stays an informal umbrella term in conversation and documentation only. Add "Individual" as a Contributor kind alongside Ministry / Organisation / Business, and relax the onboarding copy so a solo person isn't forced through "Organisation name" framing.

## 7. How those will be implemented

| Solution | Status | Detail |
|---|---|---|
| Scrollable list screen | Done this session | New `list.jsx`: `ListPage` renders Contributors, Places, and Events from the same `useApp()` state the map uses, with an All / Contributors / Places / Events filter row and a search box. Each card routes to the same profile screens the map's preview panel already opens (`go('event'/'place'/'profile', { id })`). |
| Map ↔ List toggle | Done this session | One button added to the Discover top bar (`home.jsx`), next to the existing search and category-filter buttons, calling `go('list')`. A matching button on the list screen calls `go('home')`. A visible toggle was chosen over a swipe gesture for discoverability; a plain two-screen toggle was chosen over a draggable bottom sheet to keep the build simple, per the founder's direction to go simple first. |
| Router wiring | Done this session | `case 'list'` added to the page switch in `shell.jsx`. |
| V1-scope markers | Done session 1 | `DEFER TO V2` comments added directly above the relevant fields/sections in `apply.jsx` and `create.jsx`, plus a scope note at the top of each file. |
| Remove admin-approval gate | **Done session 2** | `self_approve_contributor_application` RPC (migration 164, own-row-only) called immediately after the `contributor_applications` insert in `/api/contributor/apply`; `submitApplication` navigates straight to onboarding instead of waiting. Admin's `approve_contributor_application` RPC still exists, untouched, for edge cases. |
| Contributors appear on the map | **Done session 2** | The actual blocking bug: `home.jsx` never included `contributors` in its marker list, `adaptContributor()` never mapped lat/lng, and there was no DB column for a Contributor's map category. All three fixed; verified via Playwright (a real `.maplibregl-marker` renders). |
| Founder-only hide/flag | **Backend done session 2, no UI yet** | `set_contributor_hidden` RPC + `/api/admin/contributors/hide` exist and are tested; admin.jsx has no button wired to it yet — flagged as the next small addition in RESUME_HERE.md §3AE. |
| Individual Contributor kind | Not yet done | Add "Individual" to the Contributor kind alongside Ministry / Organisation / Business (`docs/feature-clarity/search-and-discovery.md` already anticipates this filter, just not this value); relax the "Organisation / ministry name" label in `apply.jsx` accordingly. Note: `apply.jsx` currently collects no kind at all (pre-existing gap, unrelated to session 2's fixes). |
| README fix | Not yet done | Rewrite `apps/connect/README.md` to describe Citizens Connect, not the unrelated "member data platform" text currently there. |

## 8. Priority goals to be accomplished

The founder has not stated these explicitly. They follow from the friction points above and are offered here for confirmation or edit, matching this project's convention of tracking open items rather than deciding them unilaterally:

1. ~~Bypass or auto-approve the Contributor application for v1~~ **✅ Done session 2.**
2. ~~Add a lightweight, founder-only hide/flag control for a listing~~ **✅ Backend done session 2 (no admin.jsx button yet).**
3. Add "Individual" as a Contributor kind, and adjust onboarding copy to support a solo person.
4. Correct `README.md`.
5. Label `docs/feature-clarity/*` and `map-layering.md` clearly as deferred/not-in-v1 (a one-line status header on each is enough) so they stop reading as active scope.
6. Seed a first real batch of Pretoria Contributors personally, end to end, through the simplified flow once it exists — using it as a real early user would is the fastest way to find what's still friction.
7. Add a minimal count of listings added (even a simple admin-panel number) as one visible signal of early growth, without building a full analytics layer.

## 9. Further details not yet laid out for the plan

**Terminology, resolved this session:**
- Contributor: the identity that adds to the platform — an individual or a formally established entity (church, non-profit, business, initiative). Already defined this way in `VISION.md`'s Language section, and already the identity concept Wear and Vision link back to (`connect_contributor_id`) — a cross-app term, not Connect-only.
- Place: a physical location. May or may not have any Events attached to it.
- Event: time-bound, attached to a Contributor, populates the map only while scheduled/current.
- "Entity" stays an informal, spoken/written umbrella word for "a Contributor, Place, or Event." It does not become a fourth database concept.

**Wear feed parity, noted for later:**
Citizens Wear is building an Instagram-style scrollable discovery feed for apparel, with comments, sharing, and liking. The founder wants visual and interaction continuity across Citizens apps, and has flagged — explicitly as future prep, not v1 scope — that Connect's list view could eventually grow toward the same engagement primitives:
- Bookmarking / liking: Connect already has this in substance as Consider (events) and Follow (places). A future pass can align the visual language with Wear's save/like affordance without changing the underlying mechanism.
- Comments: proposed future form is "Author Broadcasts" — a Contributor-authored update, distinct from open public commenting.
- Sharing: not yet built in the list view; the map's preview panel already has a share affordance to match.

This is recorded here so the v1 list view's data shape does not need to be reworked later — it already carries `id`, `type`, and category consistently across Contributors, Places, and Events, which is what an engagement layer would key off.

**Not yet decided (open):**
- Whether the List toggle should eventually also live in the persistent bottom nav (currently Discover / Kingdom Projects / Messages / Notifications) rather than only as an in-page button.
- Whether Contributors should get their own save/bookmark state — they do not currently have one, unlike Events and Places.
- Timing for the `map-layering.md` zoom-tier reveal system. Recommended to stay deferred until after the v1 loop is proven with real Pretoria listings.
