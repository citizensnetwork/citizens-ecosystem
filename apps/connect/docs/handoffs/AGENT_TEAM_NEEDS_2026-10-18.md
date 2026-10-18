# Agent team: what still needs doing (needs list, written 2026-10-18)

> **Audience:** the founder, and any fresh session that picks up the agent-team work. Stateless: read it with [`AGENT_TEAM_HANDOFF.md`](AGENT_TEAM_HANDOFF.md) and the T rows of `RESUME_HERE.md` (item **T16** points here). Every line says who can do it and the first step. Public-safe: no private address, key or name.
> **Facts below were read on 2026-10-18 between 04:30 and 11:45 local.** Re-check anything marked "live" before acting on it (scheduler, GitHub and the inbox change by the hour).
> **Usage guard.** The scheduled roles share ONE usage limit with every session. On 2026-10-18 the 5-hour window read 71 percent at 11:30 and the weekly window 62 percent. Run `get_usage` first, stay under 55 percent of the 5-hour window before heavy work, and keep long sessions out of 04:00 to 09:00 local.

## A. Only the founder can do these

| # | Need | Why | First step |
|---|---|---|---|
| A1 | **Say yes to merge docs PR #149** (this trail) when its checks are green and the Reviewer has commented on the exact head | Merge is `C`: a yes in chat that names the pull request. It is a docs-only change, so merge rung 1 applies | Ask the session: "merge PR 149" and let it confirm the head first |
| A2 | **Set the Designer's weekly clock** (Tuesdays 13:20, at most 3 cards) | You answered yes on card `d-schedule-designer`, but an answer is intent; the cron needs a yes in chat after a good baseline run. PR #147 is merged and the baseline ran | Tell a session "set the Designer cron"; it uses the safe-update procedure (back up `SKILL.md`, asserting script, update, byte-compare) |
| A3 | **Choose how the Designer reads the inbox** (the size problem) | Described in `docs/routines/designer.md` section 12 | Read that section, answer in chat |
| A4 | **Look at the four `TEST (delete me)` cards on your phone** (inbox), then say so | They are page tests for the new Design card layout (Designer phase 3); they are deleted after you look | Open the Decision Inbox on the phone, scroll the Inbox tab, then tell a session to delete them |
| A5 | **Apply two small prompt changes to scheduled roles** (or say "apply them" and a session does it) | (a) The Dispatcher records an answered idea whose issue already exists but never labels it, so a session had to; let it label an open issue whose `Dispatcher-card:` marker matches an answered yes card. (b) The Watcher's and the Scribe's prompts compare the security advisor against 121 WARN; the real baseline is 131 (RESUME_HERE section 2) | Safe-update procedure; a role never edits its own prompt. Related: the three prompt defects found in the Designer's baseline run (`designer.md` section 11) |
| A6 | **Your own steps from RESUME_HERE section 4, A** (nothing here is new) | A12 MapTiler usage alert; A13 read the Upstash database's region; A15 upload one photo on live Wear; C21 paste the updated `tools/google-forms/intake.gs` into the live Apps Script; the phone checks `docs/audit/phone-check-follow-save-cohosts.md` (sections A to I) and `docs/audit/phone-check-swipes-tilt-phase2.md` | Open the item in RESUME_HERE |

## B. A supervised session can do these (say "go")

| # | Need | Why | First step |
|---|---|---|---|
| B1 | **Fix the flaky Follow and Save tap tests** (item T14) | The scheduled CI run of 2026-10-18 02:35 UTC failed on `e2e/map-v2-follow.spec.ts` line 40 and `e2e/map-v2-save.spec.ts` line 54, while the push run on the same commit passed. Suspected timing (the spec measures the button right after the sheet opens), not reproduced | A proposal card already exists in the app (task `task_0b9b895a`); start it, or paste its brief from RESUME_HERE T14 |
| B2 | **Designer phase 4: join the team** | Order: Reviewer, Builder, Dispatcher, then Strategist and Scribe (one small docs PR each, each a rung 0 yes in chat), because chaining can start the Builder the moment an issue is labelled. The cron (A2) comes last | `docs/handoffs/DESIGNER_ROLE_HANDOFF.md` section 4, phase 4 |
| B3 | **Close the Dispatcher's stale "waiting" notes** (item T11) | The Scribe's digest of 2026-10-18 still counts four notes as "needs a live session": the chain permission rule, the no-reply email, the team schedules and the removal of finished work folders. RESUME_HERE says the schedules and the folder removal are done. The Dispatcher cannot close its own notes and the classifier refuses edits to answered cards without your yes | Verify each against live state, then close with your yes in chat |
| B4 | **C5 (Vision 6-digit sign-in) and S3 (compile Tailwind ahead of time in Connect)** | You answered Later on cards `i-p11-vision-code-signin` and `i-p15-tailwind-static`. Both are `direction` cards on purpose: C5 needs a real inbox to prove the code arrives, S3 needs a pixel-for-pixel comparison and your phone. Not the Builder's work | When you say go: a fresh session reads RESUME_HERE C5 or S3 |
| B5 | **Watch the Builder's first run on #143, #144 and #145** | Labelled `agent:ready` at about 11:30 on 2026-10-18. The Builder runs at 11:55, 15:55 and 17:55, only while the 5-hour usage is under 60 percent, so the first realistic run is 15:55. It opens up to 3 draft PRs; the Reviewer comments; you merge (a yes naming each PR). #144 changes two `package.json` files and the lockfile, which is why its card named them | `gh pr list --state open`; read the Builder's queue rows and the Reviewer's comments |

## C. Waiting on a clock or another change

- **Cloud move** (item T6): 14 clean days of unattended runs; the earliest decision date in RESUME_HERE T6 is 2026-10-26 (or 2026-10-29 counting from chaining). The Scribe keeps the count.
- **Strategist** next run: Monday 2026-10-19 09:17 local.
- **Weekly usage window** resets Saturday 2026-10-24 at 11:00 local; three Builder tasks plus the Designer will spend a lot of it.
- **Reader** (item T5): needs the founder to mint two scoped keys first; not started.

## D. How a fresh session should use this file

1. Read `VISION.md`, the root `CLAUDE.md`, `RESUME_HERE.md` and this file.
2. Run `get_usage`; then `list_scheduled_tasks` and `list_task_runs` for the roles; then read the Decision Inbox and `gh pr list`.
3. Tell the founder in at most 10 lines which of A, B and C changed since the date above. Do nothing in A without his word; start a B item only when he says go.
4. When an item is done, delete its line here in the same docs PR that records it in `RESUME_HERE.md`. When the list is empty, delete this file and its T16 row.
