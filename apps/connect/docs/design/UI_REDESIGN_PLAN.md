# Citizens Connect — UI Redesign Implementation Plan

> Phased plan for upgrading the application UI using Figma-designed glassmorphism components.
> This plan is executed in a separate Claude Code terminal session, NOT inline with feature work.

---

## SESSION RECAP — What was accomplished

1. **Explored the Figma Make reference design** at the provided URL ("Glassmorphism Community Map"). Captured and reviewed:
   - **Map Home**: Full-screen map with animated golden circle markers, pulsating rings, floating glass search bar, "Filters" (left) and "Layers" (right) floating controls, bottom stats bar ("8 Organizations | 2,468 Members | 98 Active Projects"), "Community Nexus" header with navigation icons
   - **Organisation Card (Right Panel)**: Category badge (e.g., "Education", "Health & Wellness"), org name + description, Members/Projects stat row, Impact Score + Activity Level progress bars (gold fill), "View Dashboard" gold CTA button
   - **Filter Panel (Left Side)**: "Filter Organizations" heading, category checkboxes with icons (Health & Wellness, Education, Environment, Community, Agriculture), Impact Level pill selectors (High/Medium/Growing)
   - **Organisation Dashboard**: Back arrow navigation, org name + type subtitle, "Our Mission" glass card, Founded/Location info row, "Recent Activity" timeline (gold dot indicators), "Active Projects" section with progress bar cards (project name, tag, % complete, impact metric)

2. **Created `docs/design/FIGMA_PROMPT.md`** — a comprehensive, self-contained prompt covering all 18 page/screen types, 23 reusable components, the full design language (colours, typography, spacing, motion), responsive breakpoints, and design tokens. This prompt is ready to paste into Figma Make.

---

## THE WORKFLOW — How this all fits together

```
                    YOU ARE HERE
                        |
                        v
+-------------------+     +-------------------+     +-------------------+
|  1. FIGMA PROMPT  | --> |  2. FIGMA DESIGN  | --> |  3. CLAUDE CODE   |
|  (DONE)           |     |  (YOU DO THIS)    |     |  (IMPLEMENTATION) |
|                   |     |                   |     |                   |
| FIGMA_PROMPT.md   |     | Paste prompt into |     | Extract tokens,   |
| covers all 18     |     | Figma Make. Review|     | apply component   |
| screens, 23       |     | output. Iterate   |     | styles, update    |
| components,       |     | until each page   |     | Tailwind config,  |
| design tokens,    |     | looks right.      |     | restyle every     |
| colour palette.   |     | Export assets.    |     | page/component.   |
+-------------------+     +-------------------+     +-------------------+
```

### Step-by-step:

1. **Figma Prompt** (DONE) — `docs/design/FIGMA_PROMPT.md` is ready.

2. **Figma Design** (YOUR ACTION) — Open Figma Make, paste the prompt, iterate on the generated design. Tweak colours, spacing, typography until you're satisfied. Optionally export:
   - SVG icons/logos (crown, map markers)
   - Design token values if you deviate from the prompt's defaults
   - Screenshots of each page for reference during implementation

3. **Claude Code Implementation** (SEPARATE TERMINAL SESSION) — Take the finalised designs and systematically restyle the existing codebase. No backend changes. No new features. Pure visual upgrade.

---

## CAN THIS BE DONE IN CLAUDE CODE?

**Yes, absolutely.** Here's what makes it feasible:

| Concern | Answer |
|---|---|
| **Is it just CSS/Tailwind changes?** | ~85% yes. The design upgrade is primarily Tailwind class changes on existing components, plus CSS custom property updates in `globals.css`. No database migrations, no API changes, no new routes. |
| **Do we need new dependencies?** | Minimal. Likely just `@fontsource/playfair-display` and `@fontsource/inter` (or Google Fonts via `next/font`). Lucide icons are already in use. Framer Motion is already in the Figma reference but optional — pure CSS transitions cover 90% of what we need. |
| **Will it break existing functionality?** | Not if done correctly. Every change is purely presentational. The existing `tsc --noEmit`, `vitest run`, and `next lint` gates catch any structural regressions. Visual regressions are caught by side-by-side comparison with the Figma frames. |
| **How big is the surface area?** | Large but systematic. ~60 page files, ~90 component files. But most share a small set of base patterns (glass card, gold button, category badge). Update the pattern once → propagate. |
| **Does the existing `globals.css` help?** | Very much. It already has `--gold: #D4AF37`, `--glass-*` variables, `gold-glow`, marker animations, shimmer skeletons. The foundation is 70% there. We're extending and refining, not starting from scratch. |

---

## PHASED IMPLEMENTATION (for Claude Code terminal)

Each phase is a single git-committable batch. Run quality gates (`tsc`, `vitest`, `lint`) after each. Each phase should take 1-2 Claude Code sessions.

---

### Phase 0 — Design System Foundation
**Scope:** Global CSS + Tailwind config changes. Zero component changes.

**Files touched:**
- `src/app/globals.css` — Extend CSS custom properties
- `src/app/layout.tsx` — Swap fonts (Montserrat → Playfair Display + Inter via `next/font/google`)
- Add/update any Tailwind v4 theme tokens

**Changes:**
1. Add missing CSS variables to `:root`:
   ```css
   --color-gold-dark: #C5A028;
   --color-gold-light: #E8C547;
   --color-white: #FAFAF7;
   --color-black: #111111;
   --glass-bg: rgba(255,255,255,0.85);
   --glass-border: rgba(212,175,55,0.10);
   --blur-glass: 12px;
   --shadow-panel: 0 25px 50px -12px rgba(0,0,0,0.15);
   ```
2. Load Playfair Display (headings) + Inter (body) via `next/font/google`, replace Montserrat
3. Add global utility classes: `.glass-card`, `.glass-panel`, `.gold-button`, `.gold-outline-button`
4. Update `body` base styles to `font-family: Inter` / `color: #111`
5. Verify all existing components still render correctly (no visual regressions from font swap)

**Quality gate:** `tsc 0`, all tests pass, lint clean. Manual visual spot-check on login + map home + dashboard.

---

### Phase 1 — Navbar + Global Shell
**Scope:** Navbar component + root layout chrome.

**Files touched:**
- `src/components/ui/Navbar.tsx`
- `src/components/ui/ConsiderBadge.tsx`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/messaging/MessagesPanel.tsx` (outer chrome only)
- `src/app/layout.tsx` (body classes)

**Changes:**
1. Navbar: `bg-white/90 backdrop-blur-md` glass bar, height 56px, gold wordmark left, icon tray right
2. Replace text-based nav items with icon-first layout (Consider heart, Messages bubble, Bell, Avatar)
3. Add gold unread badge styling to all notification indicators
4. Body: `bg-[#FAFAF7]` base, `font-sans: Inter`

---

### Phase 2 — Map Home UI (Floating Controls + Markers)
**Scope:** Map overlay controls, marker visual refinement, quick-action popup.

**Files touched:**
- `src/components/events/EventsView.tsx` (or equivalent map container)
- `src/components/map/EventMap.tsx` (marker rendering)
- Map marker CSS in `globals.css`
- `src/components/events/QuickActionPopup.tsx` (if exists)
- Bottom stats bar component (new or existing)

**Changes:**
1. Floating "Filters" button (left) + "Layers" button (right) as glass pills
2. Bottom stats bar: glass card with event/place/org counts
3. Marker refinement: ensure gold circles (events) and black rounded squares (places) match Figma
4. Quick-action popup: glassmorphism card with Connect/Consider buttons

---

### Phase 3 — Right-Side Panels (Event + Place + Org detail)
**Scope:** The most-used UI surfaces. Event detail, place detail, org profile panels.

**Files touched:**
- `src/components/ui/SidePanel.tsx` (base panel component)
- `src/app/@panel/(.)events/[id]/page.tsx` + related
- `src/app/@panel/(.)places/[id]/page.tsx` + related
- `src/app/@panel/(.)c/[slug]/page.tsx` + related
- `src/components/events/EventDetailContent.tsx`
- `src/components/places/PlaceDetailServer.tsx`
- `src/components/contributor/ContributorPublicProfile.tsx`

**Changes:**
1. Base `SidePanel`: `bg-white/90 backdrop-blur-md rounded-l-2xl shadow-2xl`, slide-in animation
2. Event detail: Playfair Display title, gold category badge, glass organiser card, gold RSVP/Consider buttons
3. Place detail: same glass treatment, verified badge, follow button
4. Org profile: cover image with gradient, circular logo overlap, stats row, gold follow/message buttons
5. All panels: consistent back-arrow + share/report header

---

### Phase 4 — Left Drawer (Burger Menu + Filters)
**Scope:** Burger menu / filter panel redesign.

**Files touched:**
- Burger menu component (wherever the left drawer lives)
- Filter components
- `src/components/events/QuickPanelPreferencesSection.tsx`
- `src/components/events/QuickPanelSettings.tsx`

**Changes:**
1. Glass panel slide-in from left
2. User profile quick card at top
3. Category checkboxes with Lucide icons + gold active states
4. Date range pills (Today, This week, This weekend, etc.)
5. Considerations accordion section (My Considerations + Friends tabs)
6. Quick Access shortcut buttons

---

### Phase 5 — Authentication Pages
**Scope:** Login, signup, forgot/reset password.

**Files touched:**
- `src/app/login/page.tsx`
- `src/app/signup/page.tsx`
- `src/app/login/forgot-password/page.tsx`
- `src/app/login/reset-password/page.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/SignupForm.tsx`
- `src/components/auth/OAuthButtons.tsx`

**Changes:**
1. Centred glass card on off-white background
2. "CITIZENS" gold wordmark + crown logo at top
3. Playfair Display headings ("Welcome back", "Join the Kingdom")
4. Gold full-width primary buttons
5. Clean input fields with gold focus ring
6. OAuth buttons (Google, Apple)

---

### Phase 6 — Contributor Dashboard
**Scope:** All `/c/[slug]/dashboard/*` pages.

**Files touched:**
- `src/app/c/[slug]/dashboard/layout.tsx`
- `src/app/c/[slug]/dashboard/page.tsx` (overview)
- `src/app/c/[slug]/dashboard/events/page.tsx`
- `src/app/c/[slug]/dashboard/places/page.tsx`
- `src/app/c/[slug]/dashboard/broadcasts/page.tsx`
- `src/app/c/[slug]/dashboard/team/page.tsx`
- `src/app/c/[slug]/dashboard/inbox/page.tsx`
- `src/app/c/[slug]/dashboard/analytics/page.tsx`
- `src/app/c/[slug]/dashboard/planning/page.tsx`
- `src/app/c/[slug]/dashboard/settings/page.tsx`
- All associated client components in `src/components/contributor/dashboard/`

**Changes:**
1. Dashboard layout: glass sidebar nav with Lucide icons, gold active state
2. Overview: glass stat cards, recent activity timeline (gold dot indicators), quick-action buttons
3. All sub-pages: consistent glass card containers, gold CTAs, status badges
4. Planning: glass expandable cards with gold completion toggles
5. Analytics: gold-filled progress bars, glass metric cards

---

### Phase 7 — Admin Dashboard
**Scope:** All `/admin/*` pages.

**Files touched:**
- `src/app/admin/page.tsx`
- `src/app/admin/applications/page.tsx`
- `src/app/admin/contributors/page.tsx` + `[id]/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/categories/page.tsx`
- `src/app/admin/tags/page.tsx`
- `src/app/admin/reported/page.tsx`
- `src/app/admin/suggestions/page.tsx`
- `src/app/admin/api-keys/page.tsx`
- Associated components in `src/components/admin/`

**Changes:**
1. Sidebar nav (same pattern as contributor dashboard but different items)
2. Stat cards with glass treatment
3. Application review cards with Approve/Reject gold buttons
4. Consistent table/list styling across all admin pages

---

### Phase 8 — Messaging, Notifications, Secondary Surfaces
**Scope:** Messaging panel internals, notification panel, calendar overlay, forms, profile pages.

**Files touched:**
- `src/components/messaging/MessagesPanel.tsx` (full internals)
- `src/components/messaging/ChatView.tsx`
- `src/components/messaging/MessageRequestCard.tsx`
- `src/components/messaging/ConversationList.tsx`
- `src/components/notifications/NotificationBell.tsx` (dropdown panel)
- `src/components/events/GlassCalendar.tsx`
- `src/components/events/EventForm.tsx`
- `src/components/events/EditEventForm.tsx`
- `src/components/places/PlaceFormWithIndemnity.tsx`
- Profile pages (`/profile/*`)

**Changes:**
1. Messaging: gold-tinted sent bubbles, glass panel chrome, request card with Allow/Deny
2. Notifications: glass dropdown, type-dependent icons, gold unread dots
3. Calendar overlay: frosted `bg-black/60` backdrop, gold-highlighted event day tiles
4. Forms: gold focus rings, gold primary submit buttons, glass card containers
5. Profile pages: cover image + avatar overlap, glass sections

---

### Phase 9 — Polish, Responsive, & Landing Page
**Scope:** Mobile breakpoints, landing page, micro-interactions, final consistency pass.

**Files touched:**
- Landing page (`src/components/ui/LandingPage.tsx`)
- All components (responsive class adjustments)
- `globals.css` (any remaining animation/transition additions)

**Changes:**
1. Landing page: Hero with gold wordmark, map preview, feature cards, scripture quote
2. Mobile: full-width panels, bottom nav bar, collapsed sidebars
3. Tablet: narrower panels, responsive grid adjustments
4. Skeleton loaders: match new glass card shapes
5. Empty states: centred icon + message + CTA with glass styling
6. Final consistency audit: every button, badge, card, panel matches design tokens

---

## WHAT DOES NOT CHANGE

These are explicitly out of scope for the UI redesign:

- **Backend / API routes** — zero changes to any `route.ts` file
- **Database / migrations** — no schema changes
- **Business logic** — no changes to auth flows, RLS, rate limiting, etc.
- **Test files** — existing tests should pass without modification (they test logic, not styles)
- **Feature additions** — no new features; this is purely visual

---

## PREREQUISITES BEFORE STARTING PHASE 0

1. **Figma design finalised** — You've pasted the prompt into Figma Make, iterated, and are satisfied with the output
2. **Design assets exported** (optional but helpful):
   - Crown logo SVG
   - Map marker SVGs (event circle, place square) if different from current
   - Any custom illustrations for empty states or landing page
3. **Screenshots saved** — Save Figma frame screenshots to `docs/design/screenshots/` so Claude Code can reference them during implementation (use the `/verify` skill to compare rendered output against the design)
4. **Current branch clean** — All pending Stage K/L work committed and pushed

---

## ESTIMATED EFFORT

| Phase | Scope | Estimated sessions |
|---|---|---|
| 0 | Design system foundation | 1 session |
| 1 | Navbar + shell | 1 session |
| 2 | Map home UI | 1 session |
| 3 | Right-side panels | 1-2 sessions |
| 4 | Left drawer | 1 session |
| 5 | Auth pages | 1 session |
| 6 | Contributor dashboard | 2 sessions |
| 7 | Admin dashboard | 1-2 sessions |
| 8 | Messaging + secondary | 1-2 sessions |
| 9 | Polish + responsive + landing | 1-2 sessions |
| **Total** | | **~11-15 sessions** |

Each "session" = one Claude Code terminal conversation (~1-2 hours of focused work).

---

## HOW TO KICK OFF EACH PHASE

When opening a new Claude Code terminal for a phase, paste this:

```
Read docs/design/UI_REDESIGN_PLAN.md and docs/design/FIGMA_PROMPT.md.
I'm executing Phase [N] of the UI redesign. Follow the plan exactly.
Apply only the changes listed for this phase. Run quality gates when done.
Do not add features. Do not change backend code. Pure visual upgrade.
```

If you have Figma screenshots saved, you can also say:

```
Here's the Figma design for this page: [attach screenshot]
Match this design as closely as possible using Tailwind CSS classes.
```
