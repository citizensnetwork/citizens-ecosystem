# Map v2 runner prompt (refreshed 2026-10-10)

Paste everything below the line into a new Claude Code session opened at the monorepo root.
It replaces the earlier pasted version. What changed and why: `docs/MAP_UX_TRACKER.md` §13.

---

ROLE
You are a senior product designer-engineer on Citizens Connect (Pretoria, v1), inside the Citizens ecosystem monorepo. Instagram's map is a reference for interaction patterns, not a spec. You have professional latitude on design choices that still meet an Accept line: use your judgement, then log it. Where the product intent is unclear, ask (tracker §10) instead of assuming.

RUN
PHASE = 1
STOP_AFTER = M4 (set to M1 for a cautious first run)
MAP LOOK = LIGHT BY DEFAULT, WITH A DARK SETTING (founder, 2026-10-10: tracker D1). Light is the live look and what a first-time visitor sees; dark is built last (P1-12) from Citizens' own tokens, behind a setting `auto | light | dark`. Instagram's frames are dark: copy the patterns, not the palette.

DECIDED BY THE FOUNDER ON 2026-10-10 (do not re-ask; tracker §10 and §13.1 hold the detail)

- D1 light by default plus a dark setting (P1-12 is in M4; if the tile provider has no usable dark style, pause that item and ask: D4).
- D3 accent: an existing brand colour. On light, gold as a fill with a near-black label, and dark gold `#8B6914` for gold text, rings and icons (plain gold is 2.29:1 on white, calculated: recompute in P1-02, and compute the dark set).
- D5 gallery images: contributor-supplied only, no imports from other sites or socials.
- D6 Android Back and Escape: close the sheet at once, one `useBackGuard` entry. No state-by-state collapse in Phase 1.
- D8 pins: category glyph below about zoom 15 (tune within 13–15), logo at and above it, the selected pin always shows its logo (the founder's `map-layering.md`).
- D9 one sheet container for Contributor, Place and Event; Place and Event reuse their `EntityCard` body inside it.
- D10 a shared link keeps opening the full profile page.
- D2 (sheet beside the profile page) and D7 (English only) were not explicitly answered: the tracker's defaults stand.

Source of truth: `docs/MAP_UX_TRACKER.md`. Read all of it before touching code (it has the §13 reconciliation, Appendix E tunable design parameters and the Decision Log). If it is missing, stop and tell me. If branch `feat/map-v2` already exists, check it out and resume at the first unchecked item. Run M0 (the Phase 0 audit) first if any P0 box is unchecked.

READ FIRST, in this order (skip any that do not exist, but say so)

1. `apps/connect/VISION.md`: always first. Run its alignment self-prompt on this work now, and again before shipping.
2. Root `CLAUDE.md` and `apps/connect/CLAUDE.md` (standing rules: offload file, compaction, vibe-security, ask when unclear).
3. `apps/connect/RESUME_HERE.md` (state, §3 standing rules, item **C19** = this project). Treat its claims as unverified until you check them against git and the code.
4. `docs/MAP_UX_TRACKER.md` (esp. §2 values, §4 discernment, §5 guardrails, §13, Appendix E) and `apps/connect/V1_SCOPE.md`. `apps/connect/docs/feature-clarity/map-layering.md` is the founder's zoom-reveal direction (decided: D8). `apps/connect/README.md` is known stale: do not rely on it.
5. `docs/reference/instagram-map/INDEX.md`, then OPEN the frames in that folder and study them.
   If CLAUDE.md or §2 conflicts with the tracker's hard rules, stop (Gate G5).

SESSION PROTOCOL (root CLAUDE.md, mandatory)

- At the start create `.claude/sessions/map-v2-<milestone>.md` (gitignored): objective, task list, context. Update it after each item and about every 100k tokens, then `/compact`. Compact at least every 10 minutes of work. The offload file is the source of truth, not the conversation.
- Do NOT write `RESUME_HERE.md` mid-session. Update the tracker's Status and logs as you go. Refresh the "Map v2" block of RESUME_HERE (item C19) once, at the end of the run.
- Stage explicit paths only, never `git add -A` or `git add .`: untracked local briefs in the tree name real organisations.
- Report and address broken code you find in files you touch; elsewhere, record it in tracker §10 or RESUME_HERE rather than widening this change.

HARD RULES (full list: tracker §5)

1. Branch `feat/map-v2`. Never push to `main` (the repo blocks it). Never force-push (a repo ruleset forbids it): fix forward. Open a DRAFT PR. If `gh` is unavailable (its login expired on 2026-10-10), use the GitHub MCP connector; failing that, write `docs/audit/PR_DESCRIPTION.md`. Merging is the founder's decision, never yours.
2. Bump the `?v=` cache-bust on every file you modify: it is per `<script>` tag in `apps/connect/src/frontend/index.html`. A new `.jsx` file must be added to BOTH `index.html` and `apps/connect/scripts/build-frontend.js` `appFileOrder`. Verify dev (Babel-standalone) and production (`build-frontend.js`) both render.
3. Keep the existing IIFE-on-window module pattern. No new bundler, framework or runtime dependency (Gate G2). `src/frontend/**` is not linted: run a one-off `no-unused-vars` check on files you touch.
4. No DB writes, no migrations applied, no RLS/auth changes. SELECT-only, aggregate counts only (the MCP SQL role bypasses RLS and the database is the shared production project), no personal data in any output. If a schema change is needed, write the SQL to `docs/proposals/` and stop that item (Gate G1; the live migration head is 181).
5. Everything new ships behind `?map=v2`, default OFF. Flag off = unchanged. Do not weaken the routing and Back rules in RESUME_HERE §3: history entries only inside a tap or key press; an overlay uses `useBackGuard`; paths come from `CC_ROUTES`, never string literals.
6. `docs/reference/instagram-map/*.jpg` is already git-ignored. No Instagram logos, icons, ring colourway or strings. Never log in to, scrape or automate Instagram.
7. Core loop first: if an item would delay contributor onboarding → listing → map → events, defer it and say so. The simplest thing that meets the Accept line wins.
8. Tick a box only with evidence (commit hash + screenshot or measured number). If you could not measure something, write NOT MEASURED. Never estimate. Report failures and unverified claims plainly. In docs, use numbers, paths and hashes, not vague comparatives.
9. IDs in the tracker are their own namespace: outside the tracker write `MAP:H2`, `MAP:M3`, `MAP:D1` (RESUME_HERE has its own H, M, D, P numbers).

USING THE REFERENCE AND YOUR OWN JUDGEMENT
For each pattern: study the frames, run the 7-question filter (tracker §4: Belonging, Truthfulness, Dignity & safety, Attention, Stewardship, Originality, Reach), decide ADOPT / ADAPT / DEFER / REJECT, and add one line to the Decision Log (§11.1). Appendix E lists every tunable design value with Instagram's observed number, Citizens' v1 value and a start value: adjust within its range and log the measure that justified it. Deviate where you can meet the same Accept criteria with fewer parts or a lower measured cost, or where Citizens' users need something different (one-handed use, mid-range Android, mobile data, flyers with text, a light map). Logged deviation is expected; silent deviation is not. The founder's decisions above are final for Phase 1; a new question you cannot settle goes to tracker §10 with your recommendation, and that item pauses.

WORKFLOW

1. Setup: `git fetch`, then create `feat/map-v2` from the latest `origin/main` (or check it out if it exists and merge `origin/main` in: other sessions merge to `main` often, and RESUME_HERE changes under you). Confirm the tree holds nothing you would stage by accident, record the start commit in the Run log (§11.3).
2. M0 Audit → `docs/audit/*.md`, baseline screenshots (360×800, 390×844, 768×1024) and baseline measurements (tracker Appendix C). The tracker lists what is already known so you verify rather than rediscover.
3. Then M1 (P1-01–03) → M2 (P1-04) → M3 (P1-05–11) → M4 (P1-12 dark setting, P1-13, P1-14). Per item: implement → gates → check in a real browser at the 3 viewports → measure against Accept → commit "map-v2(P1-xx): …" → tick the box with evidence.
   Gates (workspace-wide): `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (run `build` before `typecheck`), then Connect e2e: `pnpm --filter citizens-connect test:e2e` (stop any `next dev` on the same checkout first; a local dev server reads the real Supabase and rate-limit buckets, so do not hammer `/api/v1/*`).
4. After each milestone: push the branch, update the draft PR (done / not done / decisions needed), update the tracker Status, continue. Stop after STOP_AFTER.
5. Browser tooling: Connect already has Playwright (no new dependency); the Claude desktop app's built-in browser can resize to the 3 viewports. For M7 take the flag-off before/after screenshots in one run on one machine (no committed baselines: Windows-made baselines fail on the Linux CI runner). No browser available → NOT MEASURED.
6. If context is running low: finish the current item, update the tracker and the offload file, push, report.

STOP AND ASK (write the question in tracker §10, pause that item, continue unrelated items)
G1 DB/schema change · G2 new dependency · G3 new brand colour or logo · G4 a target is missed after one honest, simple fix attempt · G5 conflict with tracker §2, V1_SCOPE.md or CLAUDE.md · G6 anything touching auth, payments, notifications, user location or minors' data.

FINAL REPORT (plain language, one screen, written for a non-engineer)

- What now works, and how to try it in 60 seconds (URL + flag).
- Table: item / status / evidence.
- Measured results vs targets, and what was not measured.
- Decisions I need from Stephen (numbered, with your recommendation).
- Risks, rollback (turn the flag off, or revert the PR), and what to test on a real phone (the sheet's Back behaviour first).
- What you deferred or rejected, and why.
- Refresh the "Map v2" block (item C19) in `apps/connect/RESUME_HERE.md`: where we are + the next step.
