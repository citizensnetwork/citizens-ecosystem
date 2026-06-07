# Standing Instructions — Read on EVERY run

These instructions are MANDATORY and apply to every session in this repository.

0. **Read [`VISION.md`](./VISION.md) FIRST — before anything else, every run.** It is our north star and conscience ("Connecting the Kingdom"). Run its alignment self-prompt against whatever we are about to do, and re-read/re-check it before shipping. If a task can't be tied to the vision, pause and ask.

1. **Always start by checking the resume_here md** for the latest project information, updates, details and context.

2. **Compact often** through every stage so we do not hallucinate. Do not run for more than 10mins without compacting.

3. **Be thorough with every process**, and do not leave broken code left alone, even if it wasn't part of the initial request (only exception is another in-process session) — Report it and address it.

4. **Ask at any point in time if anything is unclear** — even regarding rogue fixes — do not make assumptions, you're encouraged to ask as many clarification questions as possible.

5. **Ensure A+ grade quality code on EVERY build**, Re-auditing your work as a senior architect head and ensuring all broken/under-par/"nice to have" code is ACTED ON — optimize always for efficiency and effectiveness — thinking about the fastest, most efficient and lightest ways to complete any task, preparing for scale.

6. **Run a vibe-security check on your code.**

7. **Once checks, lints, audits, checks, fixes etc are done**, push to git, update the resume-here md folder in such a way that any other conversation can pick up from EXACTLY where we left off and have complete understanding of our current project state — no lost conversation must result in a loss of context. And finally, report on what was completed, as well as what incomplete work we still have lying ahead of us.

---

## Session Offloading Protocol (MANDATORY)

Every PR session MUST maintain a **temporary offload file** in `.Codex/sessions/`.
This folder is gitignored — deleting it entirely causes zero data loss.

### When to create the file

At the very start of each PR session, create `.Codex/sessions/<descriptive-pr-name>.md`
and write: objective, root cause, task list, and current context.

### When to offload (write updates to the file)

Offload **after each of the following triggers** — whichever comes first:

- Completing a thinking/research phase
- Beginning a new scheduled task list
- Completing any task list item
- Reaching ~100k tokens of conversation if none of the above apply

### What to write on each offload

- Current objective and status
- Completed tasks (with outcomes)
- Remaining tasks (ordered)
- Key findings, decisions, file paths, line numbers
- Any blockers or open questions
- Quality gate results if run

### After offloading

Run `/compact` immediately after writing the offload. If `/compact` is unavailable,
clear all prior conversation context and re-read the offload file to continue.
The offload file IS the source of truth — never the conversation history.

### Do NOT write to RESUME_HERE.md during a PR session

`RESUME_HERE.md` is updated only at session END to reflect the final shipped state.
Per-PR working notes, task lists, and intermediate findings go in the session file only.
