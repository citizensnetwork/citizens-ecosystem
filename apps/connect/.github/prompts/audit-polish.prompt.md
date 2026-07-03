---
description: "Batch-apply Report-only (no-patch) audit findings across N surfaces from the Polish Queue in .audit/QUEUE.md. Designed to address minor refactors, perf wins, and dead-code cleanup efficiently without one prompt call per item."
agent: "Continuity Manager"
argument-hint: "[N|all|<surface-name>] — N=1 polishes the next surface in the Polish Queue; N=3 polishes the next 3 surfaces; 'all' polishes every Polish Queue entry; or pass a surface name to polish that surface only."
---
Address Report-only items recorded in the **Polish Queue** section of `.audit/QUEUE.md`. These are observations the auditor surfaced but explicitly chose **not** to stage as patches (small refactors, minor perf wins, dead-state cleanup, etc.). This prompt converts them into actual code changes in batches without requiring one `/audit-fix` call per item.

## Argument parsing (first step)

Parse the argument:

- **Numeric (`1`, `2`, `3`, …)** → polish the first N rows from the **Polish Queue** table in `.audit/QUEUE.md` (top of table = highest cadence-priority).
- **`all` or no argument** → polish every Polish Queue row except those marked "L" effort (which need their own design pass).
- **A surface name** → polish only that surface's Report-only items. Must have a row in the Polish Queue table.

**Effort-tier guardrail:** If any row in the resolved batch is effort tier **L**, stop and ask the user via `vscode_askQuestions`:

> "Row(s) <list> are tier L (needs its own design pass — e.g. 1822-LOC EventsView split, Playwright follow-up, schema drift). The Polish prompt is designed for S/M items. Proceed anyway, defer L rows, or abort?"
> Options:
> - **Defer L rows** (recommended) — apply S/M items only
> - **Proceed with all** — risky; only do this for one L row at a time
> - **Abort**

## Steps

### 1 — Orient

Read:
- `RESUME_HERE.md`
- `.github/PROJECT_STATUS.md`
- `.audit/QUEUE.md` — Polish Queue section
- Every `.audit/surfaces/<surface>.md` checkpoint for surfaces in the resolved batch — specifically the **Gate 5 — Improvements?** and **Report-only** subsections. Each item to address must be **explicitly listed** in the Polish Queue and traceable to the checkpoint.

**Working-tree check:** If `git status` is dirty, stop and warn.

### 2 — Build the consolidated item list

For each surface in the resolved batch, enumerate every Report-only item the Polish Queue lists for that row. Resolve each to a concrete file + change description by re-reading the checkpoint.

Present the full item list to the user via `vscode_askQuestions` as a multi-select with all items pre-selected:

> "Which items should be applied this run? Deselected items stay in the Polish Queue."

Show items grouped by surface so the user can deselect a whole surface or individual items.

**Do not proceed past this step without explicit user confirmation.**

### 3 — Apply items

For each confirmed item:

a. Make the edit in the smallest scope possible. Preserve existing patterns (Supabase dual-client, RLS posture, error shape, lint conventions).

b. If an item requires a Supabase migration (e.g. dropping `profiles.onboarding_completed`), write the migration under `supabase/migrations/` with the next sequential number and update `supabase/schema.sql` accordingly. **Do not apply the migration via MCP** in this prompt — leave it for the user's normal migration cadence and note it in the final report.

c. If an item turns out to be larger than expected (forks into multiple files / cross-cuts a surface boundary), pause it, mark "deferred — promote to Fix-staged" in the report, and continue with the remaining items.

### 4 — Quality pipeline (once for the batch)

After all selected items are applied:

- `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx tsc --noEmit` → 0 errors
- `npx vitest run` → full suite passes
- `npx next lint --dir src` → clean
- **Architect subagent review** with diff summary → apply Should-fix inline, note Nice-to-haves
- **Security inline review** (OWASP Top 10, RLS correctness, input validation, rate limits) → fix any findings
- If any migration was added: `mcp_supabase_get_advisors type:"security"` after the user applies the migration (note in report — do not block this commit on it).

If any gate fails, bisect to the offending item, revert that item only, and continue.

### 5 — Commit

Choose commit granularity based on diff coherence:

- **Single coherent commit** when items are all tier S and touch ≤ 5 files total:
  ```
  audit: polish batch (<surface-list>)

  <bullet list of items applied>

  Polish Queue items from Connect Auditor checkpoints. Applied via /audit-polish.
  ```
- **Per-surface commits** when items are heterogeneous or > 5 files per surface — follow the same pattern as `/audit-fix`.

Use the standard:
```
git add -A
git -c user.name="Citizens Network" -c user.email="citizensnetworkpbo@gmail.com" commit -F .git/COMMIT_MSG.txt
```

### 6 — Push

Push only if all gates passed.

```
git push origin main
```

### 7 — Update continuity docs + Polish Queue

- `.audit/QUEUE.md` — remove or strike completed rows from the Polish Queue table. If items were deferred, leave the row but trim the items list.
- Each affected `.audit/surfaces/<surface>.md` checkpoint — append a "Polish run <date>" note listing which Report-only items were resolved + commit SHA. Do not delete the original Report-only entries (permanent record).
- `.github/PROJECT_STATUS.md` — new batch section "Polish batch (date)" listing what was cleaned up.
- `RESUME_HERE.md` "Audit queue" section — update polish pointers if any.

### 8 — Final report

```
## /audit-polish complete — argument: <N|all|surface>

**Surfaces polished:** <list>
**Items applied:** N  (one-line per item)
**Items deferred:** N  (with reason — usually promoted to Fix-staged for next audit)
**Migrations added:** N  (filename + apply instruction)

**Quality gates:** tsc ✅ · vitest ✅ · lint ✅
**Push:** ✅ pushed / ❌ not pushed (reason)

**Polish Queue remaining:** N rows (top of table: <surface>)
**Next call suggestion:** `/audit-polish <N>` for the next batch.
```

## Guardrails

- Never address an item that isn't explicitly listed in the Polish Queue table. New observations belong in a fresh `/audit <surface>` run.
- Never apply migrations via MCP from this prompt — write the file, note it, let the user apply via their normal cadence.
- Never modify `.github/VISION.md`, `.github/MASTER_DIRECTION.md`.
- Never delete a checkpoint or its original Report-only entries. Append polish notes only.
- If an item balloons in scope, defer it and recommend re-running `/audit <surface>` to stage it as a proper Fix-staged patch.
- Tier L rows need explicit user approval — they are deferred by default.
