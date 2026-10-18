# Agent team: make the morning routines run and move toward self-operation (kickoff brief, written 2026-10-17)

> **Why this file exists.** The founder left the machine unattended on 2026-10-17 and asked for "the morning routines" to run and the agent team to move toward operating itself. The session that tried to start a separate session for this was **refused by the auto-mode classifier**, so the brief is kept here, public-safe, for a person to paste into a fresh session. Read `AGENT_TEAM_HANDOFF.md` first; this file only adds what the 2026-10-17 night found and what to do next.

## What the night found (verified from the task runs, 2026-10-17)

- **The roles are enabled and scheduled** (Watcher 05:00, 10:00, 15:00, 20:00; Scribe 06:15; Dispatcher 07:30, 17:30; Builder 07:50, 11:50, 15:50, 17:50; Reviewer 08:30, 12:30, 16:30; Strategist Mondays 09:15; all local time, South Africa, UTC+2).
- **Their one real enemy is the shared usage limit.** Every run from 15 to 17 October failed in seconds with "you've hit your weekly limit" until it reset at 11:00 on the 17th; after that the Watcher (13:00), Dispatcher, Builder and Reviewer (about 17:55) succeeded; and the **Watcher's 20:00 run failed again on the 5-hour limit** because a long supervised session (the Map v2 Phase 2 build) used the same window. At 21:30 that session was at 92 % of the 5-hour window. A role run costs about 1 to 3 minutes; a long build session costs the window.
- **No role was running anything wrong**; the Builder correctly found no `agent:ready` issue (the queue is empty), the Dispatcher routed 7 answered cards on its last run.
- **The database moved ahead of `main`** during the night: migrations 183 to 188 were applied (see `RESUME_HERE.md` §2); the advisor baseline is now **0 ERROR / 130 WARN / 3 INFO**. The Watcher compares against `RESUME_HERE.md` §2 on `main`, so that file must say 130 before the 05:00 run (PR #137 carries the change).

## Do these, in order (stop when `get_usage` says the 5-hour window is above 55 %)

1. **Check last night's runs** with `list_scheduled_tasks` and `list_task_runs` for each role, and read any failed run's error. If a run failed on the limit, do nothing to the task: the limit resets by itself. If one stalled on a tool approval, say exactly what the founder must click.
2. **Feed the Builder**. Three pipeline items need no design session, account or production decision: **P12** (Contributor kind in the Apply wizard, item C3), **P14** (rate-limit consolidation onto `@citizens/utils`, S7) and **P16** (Vision browser tests with a hermetic fake project, then CI, S9). Write one well-briefed public GitHub issue each (problem, acceptance checks, files, the traps in `docs/routines/builder.md` §4: grep the Connect e2e specs for button text before renaming a CTA, keep every rate-limit value and prove it with tests, a new `app/*.jsx` goes in both `index.html` and `build-frontend.js`, draft PR only, no database change). Label `agent:ready` only what the founder approved: **ask him on the Decision Inbox** (an `idea` card per item, recommended default yes) unless he has told you in chat to approve them. Leave **P11** (Vision 6-digit sign-in; needs a real inbox) and **P15** (Tailwind static compile; must be pixel-identical) as `idea` cards.
3. **Designer phase 3** (item T12): see `DESIGNER_ROLE_HANDOFF.md` phase 3 (the inbox page update; the task created manual-only; one supervised run). The clock waits for the founder's answer to card `d-schedule-designer`.
4. **Leave a trail**: update `AGENT_TEAM_HANDOFF.md` §1 and §7.1 and `RESUME_HERE.md` §T in one docs-only PR, after every PR it mentions has reached its final state.

## Rules that bind this work

- The repo is **public**: no real organisation, person, email or id in anything committed; stage explicit paths, never `git add -A`; the primary checkout is on an old local `main` with untracked briefs, so work in a short sibling worktree (`../wt-<name>`).
- Scheduled roles are **propose-only**: they never merge, never edit their own prompt, schedule or permissions, never answer an inbox card. A person-started session may merge a docs-only PR under rung 1 (`reviewer.md` §11).
- Check `get_usage` before long work. **Do not run a long session between about 04:00 and 09:00 local**: the morning roles run in that window.
- Use the safe procedure in the memory notes before touching any scheduled task's prompt ("update a scheduled role's prompt safely").

## Paste-in prompt

```
Read apps/connect/docs/handoffs/AGENT_TEAM_SELFOP_KICKOFF.md, then apps/connect/VISION.md, the root CLAUDE.md, apps/connect/RESUME_HERE.md and apps/connect/docs/handoffs/AGENT_TEAM_HANDOFF.md. Work in a short sibling worktree from origin/main, keep an offload file in .claude/sessions/, and check get_usage first (stop heavy work above 55 % of the 5-hour window).
Do the four steps of the kickoff file in order. Ask me ONE batched question at the start: may you label the three issues (P12, P14, P16) agent:ready yourself, or should they go to the Decision Inbox as cards for my tap?
Report DONE / LEFT in plain language, with what the morning roles did and what is unverified.
```

## What happened (2026-10-18)

1. **Last night's runs checked.** No role did anything wrong. The only failure since the limit reset was the Watcher's 20:00 run on the 5-hour limit (a long session shared the window). The morning of the 18th: Watcher 05:02, Scribe 06:27, Dispatcher 07:31, Builder 07:55 and Reviewer 08:42 all succeeded.
2. **The Builder was fed.** Issues #143 (P12), #144 (P14) and #145 (P16) were written and filed as idea cards, and P11 and P15 as direction cards (they need a supervised session, so a Yes must not hand them to the Builder). The founder tapped yes on the first three and Later on the other two. The label `agent:ready` is **still missing** (the Dispatcher never labels an existing issue, and the classifier refused a session's write): see RESUME_HERE T13.
3. **Designer phase 3** was already running in another session (PR #147), so it was not started here.
4. **This trail** is the docs-only pull request that changed AGENT_TEAM_HANDOFF.md sections 1, 3.2 and 7.1 and RESUME_HERE.md items T4, T10 (deleted), T13 to T15 and the section 6 entry.
