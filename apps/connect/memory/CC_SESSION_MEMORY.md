# Citizens Connect — Session Memory
### For Claude to load at the start of any new conversation

## Project
Citizens Connect — faith community event & place discovery platform (Pretoria, ZA).
Owner: Stephen. PBO: Citizens Network.
Stack: Next.js (API only going forward), Supabase, Capacitor (iOS + Android scaffolded).
Codebase: `C:\Users\SJ\Documents\Citizen Network\citizens-connect`

## The Mission (active, in progress)
Replace the entire Next.js frontend with a new HTML/React design prototype.
Keep the Next.js API routes and Supabase backend 100% untouched.
Wire each screen in the HTML design to real API calls.
Ship via Capacitor as the mobile app simultaneously.

## Key files to read first
- `docs/HTML_FRONTEND_WIRING_SPEC.md` — master spec, all decisions locked, build order
- `docs/ARCHITECTURE_AND_MIGRATION_STRATEGY.md` — broader architectural context
- `docs/HTML_FRONTEND_MIGRATION_PLAN.md` — gap analysis between design and backend
- Design source: `Citizens Connect Map.zip` (v2) in the project root or Citizen Network folder

## All decisions locked (summary)
- Auth: Google OAuth via Supabase. No role switcher. Roles from `profiles.role` DB column.
- Admin = Stephen only, set directly in DB. Contributor = apply → approval → onboarding.
- Map: Real MapLibre GL + MapTiler (not the SVG prototype).
- Tweaks panel: removed. Defaults: teardrop pins, speech bubbles, sheet creation.
- Insights: Contributors see own analytics; Admin sees platform-wide stats.
- City reach map: uses `location_snapshot` on RSVP row (snapshot of profile location at RSVP time).
- Funder report: distinct PDF at `/api/contributor/[handle]/funder-report`.
- Voting tiers: Small Volunteer (1-20), Community (20-100), Town (100-1k), Funders Challenge (5k), Provincial Vision (10k).
- Votes: all authenticated users. Unauthenticated see but must log in. Retractable.
- Auto-transition: Small Volunteer + Community auto-move to In Process on threshold hit, create event, RSVP all voters, assign submitter as project lead.
- Town/Funders/Provincial: admin manually approves transition.
- Impact Ideas on map: yes, as lightbulb pins, hidden by default behind Ideas filter.
- Build order: Phase 0 (DB migrations) → Phase 1 (auth) → Phase 2 (map + home, June 9 target) → Phase 3 (screens) → Phase 4 (advanced) → Phase 5 (Capacitor).

## Where to implement
Claude Code (not Cowork). Start by reading the wiring spec MD.
Kickoff prompt: "Read docs/HTML_FRONTEND_WIRING_SPEC.md then begin Phase [X]."

## Open questions (don't block Phase 1-2)
- F1: Firebase project for FCM push?
- F2: Apple Developer Program enrolled?
- F3: Production domain for HTML frontend (for CORS)?
- F4: Community Covenant link target on auth screen?
