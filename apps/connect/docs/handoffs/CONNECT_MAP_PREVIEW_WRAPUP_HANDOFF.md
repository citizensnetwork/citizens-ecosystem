# Handoff — Connect: map preview shipped (#78); what is still open across the parallel sessions

> **Audience:** a fresh Claude Code session on the founder's PC in
> `C:\Users\SJ\Documents\Citizen Network\citizens-ecosystem`. Stateless: everything you need is here.
> Written 2026-10-03 (early hours), after PR #78 merged. Read `VISION.md`, the root `CLAUDE.md` and
> `apps/connect/RESUME_HERE.md` first, as always (this file does not replace them).
>
> **Public repo.** Never put a real organisation's name, contact details or user ids in code, tests, docs or
> PR text (RESUME §3). Where this brief says "the radio station from the first Form submission", the founder
> knows which one it is.
>
> **Re-verify before you act.** Every status below is a snapshot (2026-10-03, about 02:00 SAST). Run
> `gh pr list --state open` and `git log origin/main` first; a parallel session may have moved things.

---

## 1. The state of play (read this first)

Three sessions have been working on Connect in parallel. Where each piece stands:

| Piece | PR | State at write-up |
|---|---|---|
| **Map preview** (one card for every pin, zoom gates, logos, past events, intake hygiene) | #78 | **Merged** (`bba102f`, 2026-10-02 23:46 UTC). All checks were green before merge. |
| **6-digit email sign-in** | #77 | **Merged.** (Task 1 of the older admin-delete handoff.) |
| **Admin "Delete listing"** (Admin → Listings) | #79 | **Open, not merged → the Delete button is NOT in production yet.** Code is complete and tested; its migration 178 **is applied** in prod. Blocked only by red CI (see below). |
| **CI blocker: OSV advisory on `braces`** | #81 | **Open, green, ready to merge** (its Verify run passes). Adds one 30-day exception to `osv-scanner.toml`. Until it is on `main`, **every PR's Verify check is red** (#79, #80 and any new one). |
| **This docs PR** (RESUME_HERE write-up + this handoff) | #80 | Merges after #81 (see §3). |
| Wear crown logo + loading screen in Connect | none | **Not started** (Task 3 of the older handoff, P3). |

### The CI blocker, in plain terms
CI has a "blocking" step (OSV-Scanner) that fails if any dependency in `pnpm-lock.yaml` has a known
vulnerability. On 2026-10-02 at ~22:36 UTC GitHub reviewed advisory **GHSA-vfj7-8cjw-p6xm**: `braces` up to
3.0.3 can crash a Node process on deeply nested brace patterns (CVSS 8.7). **3.0.3 is the newest release, so
there is no fixed version to upgrade to.** `braces` is **dev-only** (lint tooling: `eslint-config-next` /
`@typescript-eslint` → `fast-glob` → `micromatch` → `braces`), it only globs our own file patterns and never
ships to users. PR #78's CI ran just before the advisory was reviewed, which is why it merged green and
everything since is red. Nothing in any PR's own code is at fault. #81 adds a single `[[IgnoredVulns]]` entry
that expires **2026-11-02** (RESUME §3 Process and item **H8**): after that date CI goes red again unless
`braces` has been fixed upstream or the founder decides again. **Do not renew it silently.**

### Admin delete (PR #79) in plain terms
**Why it exists:** after the first real Google-Form intake the founder could not remove test, duplicate or
bad listings: Admin → Listings only offers Hide/Unhide. A Contributor listing *is* a user account, so a naive
delete could erase a real person's account. So Delete decides from one fact (has the owner ever signed in?):

| Owner has… | Delete does |
|---|---|
| **never signed in** (Form-intake or admin-created placeholder) | Hard-deletes the account; the profile, events, places and news go with it; uploaded images are cleaned up. |
| **signed in** (a real person) | Removes only the **listing**: role goes back to citizen, listing fields cleared, events/places cancelled, news and team removed. The person keeps their citizen account and can re-apply (their re-application starts hidden until an admin unhides it). |

It refuses (with a plain reason) to touch an admin, yourself, a non-listing, or anyone who owns a Wear brand
or has Vision data. The admin must type the listing's name to confirm; the modal says which of the two
outcomes will happen. An audit row is written in the same transaction.

**Where it stands:** the database function (migration `178_admin_remove_contributor_listing`) was applied to
the live project on 2026-10-02 at 23:17 UTC (verified: the SECURITY DEFINER function exists, latest migration
version `20261002231716`). The **code** (`/api/admin/contributors/delete-listing`, the Delete button and modal
in `admin.jsx`) is only on the PR branch `claude/connect-admin-delete-listing`. The PR title still says
"DRAFT: apply 178 first" and its description still says 178 is unapplied; that text is stale (178 has since
been applied and recorded in the PR's second commit). So **today the admin portal still cannot delete**: the
button simply doesn't exist in production until #79 merges. The migration being applied early is harmless
(additive; nothing calls it yet).

**What #79 needs:** its Verify check failed *only* on the `braces` advisory (E2E, CodeQL and the Vercel
preview all pass). Once #81 is on `main`, merge `main` into #79 (never rebase or force-push; another session
owns that branch, so coordinate), let CI re-run, then merge. After deploy the founder should do a **live
acceptance test**: create or pick a throwaway placeholder listing, Delete it, confirm the modal's wording and
the result. The code was verified with a rollback-only probe against the live database (18 scenarios, zero
residue) plus 853 unit and 23 e2e tests.

## 2. What the map-preview PR (#78) shipped (so you can find it)

Everything is in `apps/connect`. The founder's first live production walk found four things; all are fixed.

| Area | Where | Rule now |
|---|---|---|
| Every pin opens one small card | `src/frontend/app/home.jsx` (`onSelect`, `PreviewPanel`), `entity-card.jsx` | Event, Place **and Contributor** pins open the same `EntityCard` at `layout:'panel'`. "View Full Profile" opens the page. |
| Zoom gates | `src/frontend/app/map.jsx` (`ZOOM_GATES`, `ZOOM_LABELS`, `zoomBandFor`, `markerHidden`) | A type hides when zoom < its gate: **place 9.5, event 7.5, Contributor 6**. Ideas never gate. The selected pin always shows. Names from **zoom 15**. Hint bands: `all / places / contributors / none`. |
| First view never blank | `map.jsx` markers effect (the "fit to data" block) | With geolocation denied the map frames all data, which can land below every gate. It now stops at the lowest visible gate and **centres on the pins that are drawn**. |
| Logos shown whole | `ui.jsx` (`Avatar fit`, `logoFit`), `map.jsx` `buildPinInner`, `entity-card.jsx`, `profiles.jsx`, `dashboard.jsx` | Organisation logo: `object-fit: contain` on white, category colour as the ring. An **Individual's** photo still fills the frame. |
| Past events | `data.jsx` `DATA.isPastEvent`, `store.jsx` `adaptEvent` (`startsAt`/`endsAt`) | One predicate. Past = end behind us; **no end time ⇒ stays up for the rest of its calendar day** (a deliberate refinement of the brief; one line to change). Map and Kingdom Discovery filter on it; organiser profile and dashboard show them under "Past events". Events tab empty state: "No upcoming events yet / Follow organisations to hear when they post." |
| Intake hygiene | `src/lib/publicUrl.ts` (`checkSocialValue`, `checkSocialField`, `normaliseWhatsappNumber`), `src/lib/contributorFields.ts` (`parseListingFields`, `lenientSocials`), intake + profile routes, `data.jsx` `urlFor` | A value **with spaces is a display name, not a handle**. Dashboard Profile, Apply and Admin Create refuse it. The Google Form intake is **lenient**: drops it, adds a Note to the response `warnings`, still publishes. A link to another site is dropped at intake only. WhatsApp is stored as international digits (`27…`). Frontend `urlFor` renders nothing for a non-link. |

**Founder decisions (2026-10-02):** D1, "all Contributors hidden from zoom level 6" (read as `z < 6`; if he
meant "at 6 and below", change `ZOOM_GATES.contributor` and the boundary assertions). D2, labels from 15.

**Production data edit (done):** one `profiles` row (the radio station from the first Form submission) had
three bad social values; corrected with a single-row `UPDATE` guarded on the old values, using the links the
founder supplied, and read back through `/api/v1/contributors`. No listing was deleted or recreated.

**Tests at #78:** Connect 852 unit (+32 live-only, skipped), Playwright e2e 30/30.

## 3. Do this first, in order

1. **Unblock CI:** #81 is green and ready. If it is not yet merged, ask the founder to merge it (or to tell
   you to). Check `gh pr view 81`.
2. **Merge #80** (this docs PR): merge `main` into its branch, wait for Verify to go green, merge. (If you are
   reading this from `main`, #80 is already merged.)
3. **#79 (admin delete):** after #81, merge `main` into `claude/connect-admin-delete-listing`, wait for green,
   then merge. Also fix its stale title/description ("DRAFT: apply 178 first", "migration 178 is NOT applied").
   Coordinate with whichever session owns it; don't both push.
4. **Confirm production:** post-merge CI on `main` green and the Vercel production deploys READY for
   `citizens-ecosystem-connect`, `-vision`, `-wear` (at write-up, `main`'s run for `bba102f` had not appeared yet).
5. **Founder production re-checks** (he has the lists):
   - Map: tap a Contributor pin → small card → "View Full Profile" opens the page; the logo is whole and its
     Facebook/YouTube/WhatsApp chips are real links. Zoom out over Gauteng then South Africa: places vanish
     first, then events, then Contributors below zoom 6, with a hint. Names appear at neighbourhood zoom. No
     May–August events on the map; Kingdom Discovery → Events says "No upcoming events yet".
   - Admin delete (after #79 ships): the live acceptance test above.
6. Anything he reports from those is the next task, ahead of §4.

## 4. What's open after that (all in `RESUME_HERE.md` §4; IDs are stable)

- **Wear crown logo + loading screen in Connect** (the older handoff's Task 3, P3). The founder likes Wear's
  crown and loading screen and wants both in Connect. The old brief still has the detail; it is untracked in
  the main checkout (it names a real organisation), so ask the founder to point you at it, or re-derive from
  `apps/wear/src/frontend/app/icons.jsx` (`Crown`), `assets/citizens-crown.png` and Wear's `app.jsx` loading gate.
- **H8 (new, from #81): `braces` exception expires 2026-11-02.** Re-check npm for a fixed `braces`; bump via
  `pnpm.overrides` and delete the ignore entry, or decide again with the founder.
- **C11 (P2, M): events feed ceiling.** `/api/v1/events` is `order by date ASC limit 100` and the store fetches
  page 1 once, so once past events push the total past 100 rows, *upcoming* events fall off the page and never
  reach the map. Fix with the existing `from=` filter for the map/Discovery fetch plus an owner-scoped fetch for
  past and cancelled events. **Design it together with C1** (a cancelled event vanishes from its owner's
  dashboard after a reload). Only 3 events exist today, so it is not urgent.
- **C12 (P3, S): first-view framing.** Frame the densest cluster (median-based) rather than all the data, so a
  new guest lands on Pretoria with events and places visible.
- **C13 (P3, S): map polish.** No distance on the map preview card (`HomePage` never passes `myLoc` to
  `EntityCard`; the list does), no Contributor entry in the Map Key, Ideas never gate by zoom.
- **A2 (founder): the rest of the production smoke walk.** Part 1 (the map) is done. Left: sign in with Google
  (never machine-verified since the supabase-js pin) → Become a Contributor → dashboard edit/cancel/News →
  Admin Create + Claim → phone-to-desktop map resize → Android Back button and cards.
- **A10 (founder, from the sign-in PR):** see RESUME §4 (re-paste `intake.gs`, check the email templates).

## 5. Gotchas learned (the durable ones are in RESUME §3)

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
- New advisories can turn every PR red with no code change (2026-10-02: #76, then the `braces` one). Read the
  failing OSV step before touching a PR's code, and never push an unrelated dependency fix onto someone else's
  feature branch: fix it once, on its own PR to `main`.
- `pnpm test` at the root can time out `@citizens/frontend-build`'s "hashed outputs" test when every app's
  tests run in parallel on a busy machine. It passes alone in about 5 s.

## 6. Clean-up still owed (local, harmless)

- The worktree `C:\Users\SJ\Documents\Citizen Network\wt-map-preview` (contains a **copy of
  `apps/connect/.env.local`**, gitignored). Remove it once #80 is merged: `git worktree remove --force
  ../wt-map-preview`, then finish with Node `fs.rmSync(dir,{recursive:true,force:true})`, because the pnpm
  store inside is full of junctions (see the `windows-pnpm-and-worktrees` memory note).
- Branches: remote `claude/connect-map-preview-consistency` (merged; RESUME **H2** housekeeping), local
  `claude/connect-map-preview-consistency` and `claude/resume-map-preview-wrapup`.
- Make sure nothing is still listening on ports 3100 or 3101.
- The original briefs `docs/handoffs/CONNECT_MAP_PREVIEW_CONSISTENCY_HANDOFF.md` and
  `…CONNECT_EMAIL_CODE_SIGNIN_AND_ADMIN_DELETE_HANDOFF.md` are **untracked in the main checkout on purpose**
  (they name a real organisation and a user id). Leave them untracked. This file supersedes the first; the
  second's Task 1 (sign-in) and Task 2 (admin delete, pending #79) are done or in flight, Task 3 is open (§4).
- Screenshots (before/after, 1280 and 390 px) were shown to the founder in the session and deliberately not
  committed (they show a real organisation's contact details).

## 7. Copy-paste prompt for the next conversation

```text
Read apps/connect/docs/handoffs/CONNECT_MAP_PREVIEW_WRAPUP_HANDOFF.md, then VISION.md and
apps/connect/RESUME_HERE.md. First re-verify the state with `gh pr list --state open` and
`git log origin/main`: the handoff is a snapshot. The order of work is: (1) get PR #81 (the dated OSV
exception for the dev-only `braces` advisory) merged so CI is green again; (2) merge PR #80 and PR #79
(admin Delete listing; migration 178 is already applied in production) once their checks pass, merging
main into each branch, never rebasing or force-pushing, and coordinating with any other session that owns
#79; (3) confirm post-merge CI and the Vercel production deploys; (4) ask me for the results of my
production re-checks (map behaviour, then the admin Delete live test) and treat anything I report as the
top task. After that, the open work is in the handoff's section 4 (Wear crown logo + loading screen first).
Work in a sibling git worktree if another session is active. The repo is public: never commit a real
organisation's name, contact details or user ids. Ask me before merging anything I haven't told you to merge.
```
