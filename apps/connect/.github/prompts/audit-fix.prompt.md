---
description: "Apply staged audit fixes from .audit/QUEUE.md in priority order. Accepts a count (N), 'all', or a specific surface name. Subsumes the deprecated /audit-apply prompt."
agent: "Continuity Manager"
argument-hint: "[N|all|<surface-name>] — N=1 applies P1 only; N=3 applies P1-P3; 'all' applies every findings-ready surface; or pass a surface name to target a single row."
---
Apply staged Connect Auditor fixes from `.audit/QUEUE.md` in **priority order** (P1 → P9, defined in the Priority Order table at the top of QUEUE.md).

This prompt subsumes the old `/audit-apply <surface>` flow. Pass a surface name as the argument to target a single row.

## Argument parsing (first step)

Parse the argument supplied to this prompt:

- **Numeric (`1`, `2`, `3`, …)** → apply the first N surfaces from the **Priority Order** table in `.audit/QUEUE.md` whose status is `findings-ready`. Skip rows whose status has drifted to `clean` or `outstanding` since the table was written.
- **`all` or no argument** → apply every `findings-ready` row in priority order.
- **A surface name (e.g. `rsvp-and-comments`)** → apply only that surface. Must have status `findings-ready`. If the surface is not in the priority table (because it was added after, or is `outstanding`), warn and stop.

**Critical-surface guardrail:** When the resolved batch contains more than one surface flagged "Solo? yes" in the Priority Order table (currently P1/P2/P3), stop and ask the user via `vscode_askQuestions`:

> "This batch includes N critical surfaces marked Solo. The masterplan recommends applying these one at a time so each `mcp_supabase_get_advisors` delta is inspectable. Proceed anyway, or split into N runs?"
> Options:
> - **Split** (recommended) — apply only the first solo surface this run; report remaining for next call
> - **Proceed as batch** — apply all selected surfaces in one run
> - **Abort**

Respect the answer.

## Steps

### 1 — Orient

Read:
- `RESUME_HERE.md`
- `.github/PROJECT_STATUS.md`
- `.github/DECISIONS.md`
- `.audit/QUEUE.md` (Priority Order table + relevant surface rows)
- `.audit/surfaces/<surface>.md` for every surface in the resolved batch

If `.audit/QUEUE.md` is missing or no `findings-ready` rows match the argument, report it and stop. If any matched row is `outstanding`, list it separately under "Surfaces not ready — patches still need writing" and skip it.

**Working-tree check:** If `git status` is dirty with main-session work, stop and warn before proceeding. Audit applies must run on a clean tree so commits stay surface-scoped.

### 2 — Build the consolidated apply list

For every resolved surface (in priority order):
1. List every Fix-staged patch referenced in the checkpoint with its slug, risk level, and one-line description.
2. Note any Fix-clean changes the auditor already wrote to the working tree (these ride along in the commit).
3. Verify each patch file exists on disk — if any are missing, mark that surface `outstanding` in `QUEUE.md` and exclude it from the run.

Present the full list to the user via `vscode_askQuestions` as a multi-select with all surfaces pre-selected:

> "Which surfaces should be applied? Deselected ones stay `findings-ready` for next time."

Show each surface as a header with its patches listed below.

**Do not proceed past this step without explicit user confirmation.**

### 3 — Apply surface by surface

For each confirmed surface, in priority order:

a. **Apply patches.** For each `.audit/patches/<surface>--<slug>.diff` in the checkpoint:
   - Apply the unified diff.
   - If a patch fails to apply cleanly (merge conflict, missing context), skip that patch, log the failure, and continue with the rest of the surface.

b. **Run incremental quality gates** after each surface's patches are applied:
   - `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx tsc --noEmit`
   - Relevant `npx vitest run` test files for the surface (full suite if scoping is unclear).
   - `npx next lint --dir src`
   - If any gate fails: revert that surface's patches, mark it `blocked` in QUEUE.md with a note, continue to the next surface. Do **not** abort the whole run.

c. **Architect subagent review** of the surface's diff. Apply any `Should-fix` findings inline. Note `Nice-to-have` items in the checkpoint without acting.

d. **Security inline review** of the surface's diff (OWASP Top 10, RLS correctness, input validation). Fix any findings before committing.

e. **For surfaces marked "Solo? yes" only:** run `mcp_supabase_get_advisors type:"security"` IMMEDIATELY after the diff applies and before commit, so the delta is attributed to this surface alone. Compare against the baseline in `PROJECT_STATUS.md`. If a new critical RLS/auth advisor appears, revert and mark the surface `blocked`.

f. **Commit this surface's changes** (per-surface commit — preserves git bisect/revert granularity):
   - Write `.git/COMMIT_MSG.txt`:
     ```
     audit: apply <surface> fixes

     <one-line summary of what was fixed — Fix-clean + Fix-staged>

     Audited and staged by Connect Auditor. Applied via /audit-fix.
     ```
   - `git add -A`
   - `git -c user.name="Citizens Network" -c user.email="citizensnetworkpbo@gmail.com" commit -F .git/COMMIT_MSG.txt`

g. **Update `.audit/QUEUE.md`** — mark this surface `clean` with the commit SHA + today's date. Remove its row from the Priority Order table (or re-number the remaining rows so P1 always points to "next surface to fix").

h. **Archive applied patches** — move `.audit/patches/<surface>--*.diff` to `.audit/patches/applied/` (create if missing).

### 4 — Run Supabase security advisors once after the whole batch (non-solo surfaces)

If the batch included only non-solo surfaces (P4 onward), run `mcp_supabase_get_advisors type:"security"` once at the end. Compare to baseline. If new warnings appear, log them under the most likely surface checkpoint and **do not push** until the user acknowledges.

(Solo surfaces have already had their per-surface advisor check in Step 3e.)

### 5 — Push

Only if at least one surface committed successfully AND no new security advisor warnings were introduced:

```
git push origin main
```

If push fails, leave the committed-but-unpushed state for the user.

### 6 — Update continuity docs

- `.github/PROJECT_STATUS.md` — new batch section: "Audit fix batch (date)" listing surfaces applied / skipped / blocked with SHAs and any advisor deltas.
- `.github/DECISIONS.md` — only if a fix produced a new architectural decision.
- `RESUME_HERE.md` "Audit queue" section — update each applied surface line to ✅ with SHA; note blocked surfaces still needing manual resolution; re-number priority labels in the body so they match the updated QUEUE.md.
- `/memories/session/plan.md` if it exists.

### 7 — Final report

```
## /audit-fix complete — argument: <N|all|surface>

**Resolved batch:** P<n>…P<m> (<surface-list>)
**Surfaces applied:** N  (per-surface SHA + 1-line summary)
**Surfaces blocked:** N  (with reason — patches preserved for retry)
**Surfaces skipped:** N  (user-deselected or solo-split)

**Push:** ✅ pushed / ❌ not pushed (reason)
**Supabase advisors:** baseline maintained / ⚠️ new warning (detail)

**Next priority surface:** P<n+1> — `<surface>` (`/audit-fix 1` to apply)
**Polish work pending:** see `/audit-polish` and the Polish Queue in `.audit/QUEUE.md`.
```

## Guardrails

- Never apply patches without explicit user confirmation in Step 2.
- Never bundle multiple Solo surfaces unless the user explicitly chose "Proceed as batch".
- Commit per surface — preserves git bisect/revert granularity.
- Never push if any quality gate produced an unresolved failure.
- Never push if new Supabase security advisor warnings appeared.
- Never modify `.github/VISION.md`, `.github/MASTER_DIRECTION.md`.
- Never delete `.audit/surfaces/<surface>.md` checkpoints — they are a permanent record.
- If the working tree is dirty, stop at Step 2 and warn the user.
- If `mcp_supabase_*` MCP tools are unavailable in the session, log the gap, leave the surface `blocked`, and stop before pushing.
