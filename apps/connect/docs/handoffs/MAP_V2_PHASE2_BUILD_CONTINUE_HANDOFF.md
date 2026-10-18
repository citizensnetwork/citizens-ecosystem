# Map v2 Phase 2: continue after the 2026-10-17 build session (written 2026-10-17)

**Read this in full at the start of the session; section 7 is the start-up checklist.** It assumes nothing from any earlier chat. It continues `MAP_V2_PHASE2_BUILD_HANDOFF.md` (the brief for the session that wrote this one; its section 5, "Traps", still applies in full). Sources of truth stay `docs/MAP_UX_TRACKER.md` (section 9 is Phase 2, section 10 the decisions, section 4 the Q1 to Q7 filter) and `apps/connect/RESUME_HERE.md`.

## 1. What the 2026-10-17 session did

Stephen answered the batched question in chat: **apply Save and co-hosts; follower notifications on by default; Moments ADAPT (no ring, no countdown); P2-10 "go ahead" (but no crown or loading screen was chosen)**. The S13 audit was "write it as a proposal only".

**APPLIED to the live database (Stephen's yes, one per file), tags exist locally and must be pushed:**

| Migration                  | What                                                                      | Evidence                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `183_saved_items`          | a PRIVATE bookmark (own rows only, 500 cap, no UPDATE/TRUNCATE)           | tag `connect-pre-mig183-saved-items` (on `b63a458`); advisor identical to baseline; probe `docs/audit/probes/183_saved_items.probe.sql` 21 of 21 PASS  |
| `184_event_cohosts`        | co-hosted events (read-only table, 3 SECURITY DEFINER functions, 2 kinds) | tag `connect-pre-mig184-event-cohosts` (on `19c992d`); advisor 0 ERROR, **+3 WARN** (the 3 functions, on purpose); probe `184_...` 39 of 39 PASS      |

The live head is **184**. The advisor baseline in RESUME section 2 was 122; it is now **125** (the three new functions, same class as the 109 existing). Both files are in `supabase/migrations/` and carry one change from the proposals: `authenticated` has its default privileges revoked first (Supabase grants every privilege on a new table, and `TRUNCATE` ignores RLS).

**Built and committed on branch `claude/map-v2-phase2-build` (11 commits on `f14b0c8`; nothing from here is live until merged):**

- **Follow on the Contributor sheet** (`toggleFollow`), plus a fix: a signed-out visitor on the real site used to get a heart that vanished on refresh; Follow and the Place card's Follow now say "Sign in to follow." (`guestCannot` in `store.jsx`).
- **Save**: button on a Contributor's and a Place's sheet (not an Event, not your own listing), a "Saved" section in Settings (by name, never by popularity), `saved-lib.jsx` (data side, signed-in client under RLS, no API route), optimistic with rollback, the 500 ceiling said in words, emptied on sign-out.
- **Co-hosted events**: public API adds `co_host_ids` (accepted only) and a Contributor's lists include events they co-host (`src/lib/events/cohosts.ts`, routes `v1/events`, `v1/events/[id]`, `v1/contributors/[slug]`; `apps/connect/docs/api-v1.md` updated); both Contributors' Events tabs ("With ..."), the event card, the full event page; the organiser's "Co-hosts" panel on each live event in the Dashboard; Accept and Decline under the invitation notification (`cohost-lib.jsx`, `cohosts.jsx`).
- **"0 followers" removed** everywhere (a real listing carries no count, so every card said 0): `window.UI.followerBucket` shows the bucket from 100 or nothing.

**Proposals written, dry-run in a transaction that always rolls back, NOT applied (each needs Stephen's yes on that file):**

- `docs/proposals/p2-04-follower-notifications.sql`: dry-run 13 of 13. The "one switch in Settings" already exists (`contributor_updates`). Defaults: 500 per post, 2 per Contributor per follower per 24 hours, nothing for a draft/private/past/cancelled event, publish-from-draft handled, never twice.
- `docs/proposals/p2-05-moments.sql`: ADAPTED (`moment_views` dropped, no ring, no countdown), dry-run 21 of 21. Front end to build after the yes: a "Today" tab on the sheet and a "Post a note" box.
- `docs/proposals/s13-follows-privacy.md` + `s13a`, `s13b`, `s13c` (`.sql`): the audit of every reader of `follows` and `place_follows` and the fix, in a fixed order: **a (functions), b (search_contributors), then deploy four code edits, then c (close the table)**. The code edits: `v1/contributors/[slug]` and the dashboard route call `follower_count_public` / `follower_count_exact`; `conversations` calls `recipient_follows_me`; the broadcasts route runs its two follower lookups as `admin`. Applying c first would make public counts read 0 and refuse every Contributor message. The note also lists two further findings (the public APIs return exact follower counts; search ranks by followers).

**Decisions recorded, nothing built:**

- **P2-10 (crown):** Connect **already has** the crown (`src/frontend/assets/citizens-crown.png`, 240x130, the same design as Wear's larger PNG) and a loading splash (`auth.jsx` `CROWN_SRC`, `e2e/loading-splash.spec.ts`). The live PNG's dominant colour is `#F0BB1E`, a brighter yellow than the gold tokens (`#C9A84C`, `#D4AF37`, ink `#8B6914`). Whether to recolour or swap is a brand choice (gate G3): ask Stephen one question, do not change it.
- **Pinch zoom inside the full sheet (leftover a):** left alone. Today the sheet keeps every two-finger gesture and a test (`e2e/pinch-zoom.spec.ts`, "a pinch on the sheet at full leaves the page scale at 1") pins that. A low-vision person cannot enlarge text in the full card. The change is `--mv2-ta: pan-y pinch-zoom` (and `pan-down pinch-zoom`) at full in `map-v2.css`, but it reverses a tested decision, so it is Stephen's call (phone check E1 asks him).
- Leftovers (b) Wear's `maximum-scale=1` (sibling app), (c) the 3-photo strip, (d) QR findability, (e) the plain-text Recent row: unchanged by design.
- **Follow-up to propose later:** `invite_event_cohost` has no per-inviter daily cap (an organiser could invite the same Contributor to many events); in Settings, a saved listing that is no longer on the map shows only as a count ("1 more saved listing..."), so it cannot be removed from the list.

## 2. Verification, with numbers

Run on the branch (worktree `wt-map-v2-p2`, 2026-10-17): `pnpm format:check` OK; `pnpm lint` OK; `pnpm build` 8/8 OK (it caught one TypeScript weak-type error in `attachCoHostIds`, fixed); `pnpm typecheck` 12/12 OK; `pnpm test` OK (**Connect 1,473 passed, 36 live-only skipped**, Vision 798; Connect was 1,418); `node scripts/map-v2/lint-frontend.mjs` clean on the 11 default files and on the three new files (the five older files it can also lint carry 73 problems on `main` and 73 here: unchanged).

New specs, each run on its own and green: `e2e/map-v2-follow.spec.ts` (9), `e2e/map-v2-save.spec.ts` (7), `e2e/map-v2-cohosts.spec.ts` (13), `e2e/signed-in-save-cohosts.spec.ts` (10, against the stateful fake Supabase project in `e2e/support/fake-project.ts`: the real store code with a real session). New unit tests: `savedLib` (11), `cohostLib` (21), `events-cohosts` route (14) and helper (9).

**Mutation-checked** (a self-healing harness kept outside the repo; every mutation caught, the tree restored byte for byte after each run): Follow 4 of 4, follower display 5 of 5, Save 8 of 8, co-host server 10 of 10 (one survivor needed a direct test of `createdByOrIn`), signed-in Save and co-host glue 15 of 15, co-host screens 12 of 12.

**NOT done and NOT verified:**

- **The full Connect Playwright suite has not been run on this branch** (only the four new specs). Run it once (section 7). Likely places for an old spec to need adjusting: tests that assume the action row's contents or height at half (`map-v2-sheet*.spec.ts`), tests that count `[data-mv2='row']`-style elements, `map-v2-look`, `dashboard-owner-rows`, `pinch-zoom`, `routing`, and anything that reads "followers" text on a card.
- **Nothing was run on a real phone or with Stephen's real account.** `docs/audit/phone-check-follow-save-cohosts.md` is his checklist (sections A to E). Section C needs two Contributor accounts.
- The **tracker and RESUME have not been updated** (section 5 lists what to write).
- **Nothing is pushed or merged.** See section 7 for the first steps.
- Not driven by any test: signing out empties the saved lists; the Notifications screen with a LIVE invitation; the Capacitor shell.

## 3. After the 2026-10-17 PC crash (read if `git` looks broken)

The crash NUL-filled the branch's ref file (`.git/refs/heads/claude/map-v2-phase2-build`): `git log` said "your current branch appears to be broken" and `git status` showed every file as a staged add. Every commit object survived. Recovery, done once already: read the tip from this file (it is `f6d1eb2` or later), then write its full id plus a newline into that ref file (`git update-ref` refuses on a broken ref). Afterwards `git fsck --no-dangling` printed nothing and `git status` was clean. If it happens again, scan for all-NUL files first (memory: "Crash-zeroed files"). The two migration tags live in the same repository and were intact.

## 4. Live state (verify; do not trust a line without re-checking)

- Database head 184 (`183_saved_items`, `184_event_cohosts`). Use `execute_sql` on `supabase_migrations.schema_migrations` for the head: `list_migrations` and `get_advisors` are huge.
- Nothing in the live app reads the new tables until this branch merges and deploys, so applying them first was safe (additive).
- `main` had moved to `f0db1a8` (PR #136) when this was written; the branch is 7 commits behind. Merge `origin/main` into the branch before the PR is merged (a conflict in `RESUME_HERE.md` section 2 or 6 is routine: keep both).
- Open PRs from other sessions (never touch their branches): check `gh pr list`.

## 5. What to write at the END (through the same PR)

- **`apps/connect/RESUME_HERE.md`:** section 2 (database head 184; advisor baseline 125; Connect tests 1,473 passed and 36 skipped, plus the new e2e counts after the full run); a section 6 entry (5 to 10 lines; move the oldest entry to the archive if section 6 passes 8); items: C19 (Map v2: Follow, Save, co-hosts built, awaiting phone check), S13 (audit done, three yeses pending), the P2 follow-ups above, A12 and the intake paste (still Stephen's).
- **`docs/MAP_UX_TRACKER.md`:** section 9 (P2-04 Follow and Save built, P2-09 built, P2-05 adapted proposal, P2-10 recorded); section 10 (the five answers of 2026-10-17 as decisions, with the zoom question and the crown colour as open questions); section 11.1 (Q1 to Q7 answers, one row each: Follow on the sheet ADOPT, Save ADAPT as private, co-hosts ADOPT with accept-only visibility, follower notifications ADAPT with caps, Moments ADAPT without ring or countdown, the "0 followers" removal ADOPT under Q2 and Q3); 11.2 evidence (the probes and mutation counts); 11.3 run log.
- Then `npx prettier --write` on every markdown you touched (a literal `|` in a table cell must be `\|`), and bump nothing in `?v=` unless a frontend file changes again.

## 6. Questions for Stephen (one batched `AskUserQuestion`, recommendation first)

1. **Follower notifications** (`p2-04-follower-notifications.sql`): apply it? _Recommended: yes._ Then build the two Notifications icons and the open handler (`pages.jsx`) and a line under "Broadcasts and updates" in Settings.
2. **Moments, adapted** (`p2-05-moments.sql`): apply it? _Recommended: yes, then build the "Today" tab (a Contributor-sheet tab, only when a live note exists) and the "Post a note" box (280 characters, one optional image, no ring, no countdown, no view count)._
3. **S13** (`s13-follows-privacy.md`): close `follows` and `place_follows` to the public key and other people's eyes; make the public follower number a bucket everywhere (including search results and the contributor API); a Contributor sees HOW MANY follow them, not WHO. _Recommended: yes to all three._ Then apply a, b, ship the four code edits (each with a test that fails if the old table read comes back), then c.
4. **P2-10:** Connect already has the same crown and a loading screen. Is the brighter-yellow crown the brand, or should it use the gold tokens? _Recommended: keep it until Stephen picks the colour._
5. **Zoom in the full card** (phone check E1): let the page zoom under the full sheet? _Recommended: yes, at full only (accessibility)._

## 7. Start-up checklist (in order)

1. Read `apps/connect/VISION.md` and the root `CLAUDE.md`. Work in the sibling worktree `C:\Users\SJ\Documents\Citizen Network\wt-map-v2-p2` (branch `claude/map-v2-phase2-build`); the primary checkout is on an old local `main` with untracked briefs: do not work or pull there. If the worktree is gone, `git worktree add ../wt-<name> claude/map-v2-phase2-build` from a fetched branch, then `pnpm install --frozen-lockfile` (1 to 2 minutes; use a SHORT path: a deep path breaks vitest on Windows).
2. `git fetch origin --prune`; `git status`; `git log --oneline -3` must show `f6d1eb2` or later; `gh pr list`; check CI on `main`; `gh api user --jq .login` must be `citizensnetwork`; `git config user.email` must end in `@users.noreply.github.com`. If Stephen pasted phone-check results, fix every failure first (extend the test that should have caught it, then fix).
3. Create your offload file in `.claude/sessions/` (root `CLAUDE.md`).
4. **Push the branch and the two tags by explicit refspec** (`git push -u origin claude/map-v2-phase2-build:claude/map-v2-phase2-build`; `git push origin refs/tags/connect-pre-mig183-saved-items refs/tags/connect-pre-mig184-event-cohosts`). Scan the diff against `origin/main` for emails and ids first (done once on 2026-10-17: only `.example` addresses and synthetic UUIDs).
5. Copy the primary checkout's gitignored `apps/connect/.env.local` into `apps/connect`, check port 3100 is free **as its own command**, run the **full** suite once (`cd apps/connect && npx playwright test`, about 17 minutes on a busy PC; the line reporter prints nothing until the end), **delete the `.env.local` copy afterwards**. Fix what the older specs need (scope selectors to `[data-mv2='panel']` and similar rather than loosening assertions).
6. Ask the one batched question (section 6); build what each answer unlocks; write the end-of-session docs (section 5); merge `origin/main` in; open the PR (a draft is fine until the docs are in); read CI once with the app's PR tools after one bounded wait; no polling loop; never enable auto-merge.
7. Nothing is merged, deleted or applied to the live database without Stephen's fresh yes in chat (one yes per migration file; a past yes does not carry over). Close out as DONE / LEFT in plain language, with the checks Stephen should do on his phone, and say plainly what is unverified.

## 8. Where things are

- Proposals and the S13 audit: `docs/proposals/` (the `README.md` there is the index and the current status table). Probes: `docs/audit/probes/`. Phone check: `docs/audit/phone-check-follow-save-cohosts.md`.
- Code: `app/saved-lib.jsx`, `app/cohost-lib.jsx`, `app/cohosts.jsx` (new; registered in `src/frontend/index.html` and `scripts/build-frontend.js` `appFileOrder`), `app/store.jsx` (`guestCannot`, `toggleSave`, the saves seed, `adaptEvent` `coHostIds`, `adaptNotification` `kind`), `app/map-v2-sheet.jsx`, `app/pages.jsx` (`SavedList`, the invitation actions), `app/dashboard.jsx` (`EventManageCard` Co-hosts), `app/entity-card.jsx`, `app/profiles.jsx`, `app/ui.jsx` (`followerBucket`).
- Server: `src/lib/events/cohosts.ts`; tests `src/__tests__/api/v1/events-cohosts.test.ts`, `src/__tests__/lib/events-cohosts.test.ts`, `src/__tests__/frontend/{savedLib,cohostLib}.test.ts`.
- Lessons already saved to memory: new-table default grants and the rolled-back DO-block probe recipe; MCP and test-tool size and regex traps (`\b` is backspace in Postgres regex; `list_migrations` and `get_advisors` are huge).
