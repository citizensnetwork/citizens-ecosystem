# Standing Instructions — Read on EVERY run (monorepo root)

These instructions are MANDATORY and apply to every session in this repository.
They are the monorepo edition of `apps/connect/CLAUDE.md` (which still governs
sessions opened inside that app dir); where they overlap, they are the same rules.

0. **Read [`apps/connect/VISION.md`](./apps/connect/VISION.md) FIRST — before anything
   else, every run.** It is our north star and conscience ("Connecting the Kingdom").
   Run its alignment self-prompt against whatever we are about to do, and re-read it
   before shipping. If a task can't be tied to the vision, pause and ask.

1. **Always start by checking [`apps/connect/RESUME_HERE.md`](./apps/connect/RESUME_HERE.md)**
   — the single source of truth for project state across the whole ecosystem
   (Connect, Vision, Wear, and this monorepo).

2. **Compact often** through every stage so we do not hallucinate. Do not run for more
   than 10 mins without compacting.

3. **Be thorough with every process**; do not leave broken code alone, even if it wasn't
   part of the initial request (only exception: another in-process session) — report it
   and address it.

4. **Ask at any point if anything is unclear** — do not make assumptions.

5. **Ensure A+ grade quality code on EVERY build**, re-auditing as a senior architect;
   optimize for efficiency, effectiveness, and scale.

6. **Run a vibe-security check on your code.** RLS is the only isolation wall between
   apps — treat every migration and every service_role usage as a security surface.

7. **Once checks/lints/audits/fixes are done**, push to git, update
   `apps/connect/RESUME_HERE.md` so any conversation can resume with zero context loss,
   and report what was completed + what remains.

## Monorepo-specific rules

- **`supabase/` at the root is THE migration lineage** for all three apps
  (schemas `public` / `vision` / `wear`, one shared Supabase project). Numbering is
  sequential across apps; apply via MCP `apply_migration` with a pre-apply git tag and a
  security-advisor check (0 ERROR / 0 new findings). Contract:
  [`apps/connect/docs/SHARED_DB_CONTRACT.md`](./apps/connect/docs/SHARED_DB_CONTRACT.md).
- **Cross-app data goes through Connect's `/api/v1`** — never read a sibling app's
  tables directly (contract R2).
- **Gates are workspace-wide:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  (turbo). A change in `packages/*` must leave every consumer green.

## Session Offloading Protocol (MANDATORY)

Every PR session MUST maintain a temporary offload file in `.claude/sessions/`
(root-level, gitignored). Create it at session start (objective, root cause, task list,
context); update it after each thinking phase / task-list item / ~100k tokens; run
`/compact` after each offload. The offload file IS the source of truth — never the
conversation history. Do NOT write to RESUME_HERE.md mid-session; update it only at
session END to reflect the final shipped state.
