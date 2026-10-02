# Handoff — Connect map preview (PR #78) is merged: confirm it, then what's next

> **Audience:** a fresh Claude Code session on the founder's PC in
> `C:\Users\SJ\Documents\Citizen Network\citizens-ecosystem`. Stateless: everything you need is here.
> Written 2026-10-03, straight after PR #78 merged. Read `VISION.md`, the root `CLAUDE.md` and
> `apps/connect/RESUME_HERE.md` first, as always (this file does not replace them).
>
> **Public repo.** Never put a real organisation's name, contact details or user ids in code, tests, docs or
> PR text (RESUME §3). This brief says "the radio station from the first Form submission"; the founder knows
> which one it is.

---

## 1. State

- **PR #78 merged** into `main` as `bba102f` (2026-10-02 23:46 UTC), one clean commit (`5aa15b6`) on top of the
  sign-in PR #77. All PR checks were green: Verify, E2E (Connect), CodeQL, Vercel previews for all three apps.
- **Not yet confirmed (your first job):** the post-merge CI on `main` and the **production deploys** of
  `citizens-ecosystem-connect`, `-vision`, `-wear` (Vercel auto-deploys on push to `main`; docs-only merges
  show CANCELED for Vision and Wear, which is expected, but this was a code change, so all three should build).
  `gh run list --branch main --limit 5` and the Vercel MCP `list_deployments`.
- No DB migration (head is still 177; next # is 178). One production row was edited by hand (see §3).
- A small docs PR may be open or merged on top: branch `claude/resume-map-preview-wrapup` (this file plus the
  RESUME_HERE write-up). If `git log origin/main` doesn't show it, it is waiting for the founder's merge.

## 2. What shipped (so you can find it)

Everything is in `apps/connect`. The founder's first live production walk found four things; all are fixed.

| Area | Where | Rule now |
|---|---|---|
| Every pin opens one small card | `src/frontend/app/home.jsx` (`onSelect`, `PreviewPanel`), `entity-card.jsx` | Event, Place **and Contributor** pins open the same `EntityCard` at `layout:'panel'`. "View Full Profile" opens the page. |
| Zoom gates | `src/frontend/app/map.jsx` (`ZOOM_GATES`, `ZOOM_LABELS`, `zoomBandFor`, `markerHidden`) | A type hides when zoom < its gate: **place 9.5, event 7.5, Contributor 6**. Ideas never gate. The selected pin always shows. Names from **zoom 15**. Hint bands: `all / places / contributors / none`. |
| First view never blank | `map.jsx` markers effect (the "fit to data" block) | With geolocation denied the map frames all data, which can land below every gate. It now stops at the lowest visible gate and **centres on the pins that are drawn**. |
| Logos shown whole | `ui.jsx` (`Avatar fit`, `logoFit`), `map.jsx` `buildPinInner`, `entity-card.jsx`, `profiles.jsx`, `dashboard.jsx` | Organisation logo: `object-fit: contain` on white, category colour as the ring. An **Individual's** photo still fills the frame. |
| Past events | `data.jsx` `DATA.isPastEvent`, `store.jsx` `adaptEvent` (`startsAt`/`endsAt`) | One predicate. Past = end behind us; **no end time ⇒ stays up for the rest of its calendar day** (founder-visible refinement of the brief, one line to change). Map and Kingdom Discovery filter on it; organiser profile and dashboard show them under "Past events". Events tab empty state: "No upcoming events yet / Follow organisations to hear when they post." |
| Intake hygiene | `src/lib/publicUrl.ts` (`checkSocialValue`, `checkSocialField`, `normaliseWhatsappNumber`), `src/lib/contributorFields.ts` (`parseListingFields`, `lenientSocials`), intake + profile routes, `data.jsx` `urlFor` | A value **with spaces is a display name, not a handle**. Dashboard Profile, Apply and Admin Create refuse it. The Google Form intake is **lenient**: drops it, adds a Note to the response `warnings`, still publishes. A link to another site is dropped at intake only. WhatsApp is stored as international digits (`27…`). Frontend `urlFor` renders nothing for a non-link. |

**Founder decisions (2026-10-02):** D1, "all Contributors hidden from zoom level 6" (read as `z < 6`; if he meant
"at 6 and below", change `ZOOM_GATES.contributor` and the boundary assertions). D2, labels from 15.

**Tests:** Connect 852 unit (+32 live-only, skipped), Playwright e2e 30/30. New specs live in
`e2e/discovery-cards-and-back.spec.ts` (card, Back, zoom matrix, labels, first view, past events, empty state,
logos); the golden path in `e2e/kingdom-discovery.spec.ts` now goes pin → card → View Full Profile.

## 3. The production data edit (done, for the record)

One row in `public.profiles` (the radio station from the first Form submission) had three bad social values
(two display names and a local-format phone). It was corrected with a single-row `UPDATE` guarded on the old
values, using the links the founder supplied, and read back through `/api/v1/contributors`. No listing was
deleted or recreated. The Google Sheet source was also corrected by the founder.

## 4. Do this first

1. **Confirm the merge landed cleanly:** post-merge CI on `main` green; Vercel production deploys READY for all
   three apps. If anything is red, that is the priority (re-run, or open a fix PR; `main` is protected, so use a PR).
2. **Ask the founder to run the production re-check** (he has the list; it is also in RESUME §6):
   - Tap a Contributor pin: small card, and "View Full Profile" opens the page. The logo is whole; the
     Facebook, YouTube and WhatsApp chips are real links.
   - Zoom out over Gauteng, then South Africa: places drop out first, then events, then Contributors below 6,
     with a hint saying what to zoom in for. Names appear at neighbourhood zoom.
   - No May to August events on the map; Kingdom Discovery → Events says "No upcoming events yet".
3. Anything he reports from that is the next task, ahead of the list below.

## 5. What's open (all in `RESUME_HERE.md` §4; IDs are stable)

- **C11 (P2, M): events feed ceiling.** `/api/v1/events` is `order by date ASC limit 100` and the store fetches page 1
  once, so once past events push the total past 100 rows, *upcoming* events fall off the page and never reach the
  map. Fix with the existing `from=` filter for the map/Discovery fetch plus an owner-scoped fetch for past and
  cancelled events. **Design it together with C1** (a cancelled event vanishes from its owner's dashboard after a
  reload). Only 3 events exist today, so it is not urgent.
- **C12 (P3, S): first-view framing.** Frame the densest cluster (median-based) rather than all the data, so a new
  guest lands on Pretoria with events and places visible.
- **C13 (P3, S): map polish.** No distance on the map preview card (`HomePage` never passes `myLoc` to
  `EntityCard`; the list does), no Contributor entry in the Map Key, Ideas never gate by zoom.
- **A2 (founder): the rest of the production smoke walk.** Part 1 (the map) is done. Left: sign in with Google
  (never machine-verified since the supabase-js pin) → Become a Contributor → dashboard edit/cancel/News → Admin
  Create + Claim → phone-to-desktop map resize → Android Back button and cards.
- Another session owned the **6-digit sign-in + admin delete** brief (PR #77 shipped the sign-in half). Check
  RESUME and `git log` before touching admin delete; don't assume it is done or free.

## 6. Gotchas learned this session (the durable ones are already in RESUME §3)

- **Sibling worktree + preview tools:** `preview_start name=…` serves the *primary* checkout's files, not your
  worktree's. Start your own `npx next dev -p <port>` from the worktree's `apps/connect` (copy the gitignored
  `.env.local` in; delete it afterwards). **Never run Playwright while that dev server runs:** both use one
  `.next`, and the second corrupts the first (its `/api/*` routes return 404). Stop yours first.
- A local dev server talks to the **real** Supabase and the real Upstash rate-limit buckets. Read-only browsing
  is fine; don't hammer `/api/v1/*`.
- `window.__ccMap` exposes the map. In specs use `jumpTo({center,zoom},{originalEvent:{}})`; without the
  `originalEvent` marker the "frame the data" effect undoes the jump on the next render.
- Keep `store.jsx` edits tiny when another session is active; bump `?v=` per file you change and never reuse
  another session's token on a file you both changed (production clients would keep the stale cached copy).
- `pnpm test` at the root can time out `@citizens/frontend-build`'s "hashed outputs" test when every app's tests
  run in parallel on a busy machine. It passes alone in about 5 s.

## 7. Clean-up still owed (local, harmless)

- The worktree `C:\Users\SJ\Documents\Citizen Network\wt-map-preview` (contains a **copy of
  `apps/connect/.env.local`**, gitignored). Remove it: `git worktree remove --force ../wt-map-preview`, then
  finish with Node `fs.rmSync(dir,{recursive:true,force:true})`, because the pnpm store inside is full of
  junctions (see the `windows-pnpm-and-worktrees` memory note).
- Branches: remote `claude/connect-map-preview-consistency` (merged; RESUME **H2** housekeeping), local
  `claude/connect-map-preview-consistency` and `claude/resume-map-preview-wrapup`.
- Make sure nothing is still listening on ports 3100 or 3101.
- The original brief `docs/handoffs/CONNECT_MAP_PREVIEW_CONSISTENCY_HANDOFF.md` is **untracked in the main
  checkout on purpose** (it names a real organisation and a user id). Leave it untracked; this file supersedes it.
- Screenshots (before/after, 1280 and 390 px) were shown to the founder in the session and deliberately not
  committed (they show a real organisation's contact details).

## 8. Start prompt for the next conversation

> Read `apps/connect/docs/handoffs/CONNECT_MAP_PREVIEW_WRAPUP_HANDOFF.md`, then `VISION.md` and
> `apps/connect/RESUME_HERE.md`. PR #78 is merged: first confirm post-merge CI and the Vercel production
> deploys, then ask me for the results of my production re-check. Work in a sibling git worktree if another
> session is active. Don't commit real organisation details; the repo is public.
