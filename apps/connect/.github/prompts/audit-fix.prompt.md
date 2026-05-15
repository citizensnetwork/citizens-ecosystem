---
description: "Apply ALL pending staged audit fixes across every 'findings-ready' surface in .audit/QUEUE.md in one run. Applies surface-by-surface with quality gates between each. Use in your MAIN dev session when nothing else is running."
agent: "Continuity Manager"
argument-hint: "(no argument needed — applies all findings-ready surfaces in risk order)"
---
Apply all queued Connect Auditor fixes from `.audit/QUEUE.md` in a single run.

## Steps

### 1 — Orient

Read:
- `RESUME_HERE.md`
- `.github/PROJECT_STATUS.md`
- `.github/DECISIONS.md`
- `.audit/QUEUE.md`

If `.audit/QUEUE.md` is missing or has no `findings-ready` rows, report "Nothing to apply." and stop.

For any row with status `outstanding`, list it separately in the final report under "Surfaces not ready — outstanding patches needed" with its checkpoint link. Do not attempt to apply an `outstanding` surface.

### 2 — Build the consolidated apply list

For every row with status `findings-ready` in `QUEUE.md` (in risk order — critical first, then high, then medium):
1. Read `.audit/surfaces/<surface>.md` checkpoint.
2. List every Fix-staged patch under that surface with its slug, risk level, and one-line description.
3. Note whether any Fix-clean changes were already applied to the working tree by the auditor (these are already in place and will be included in the commit automatically).

Present the full list to the user as a single `askQuestions` prompt:
- Show each surface as a section header with its patches listed below.
- Ask: "Which surfaces should be applied?" with all `findings-ready` surfaces as multi-select options (all pre-selected).
- Add a freeform note: "You can deselect any surface to skip it this run. Skipped surfaces stay `findings-ready` for next time."

**Do not proceed past this step without explicit user confirmation.**

### 3 — Apply surface by surface

For each confirmed surface, in risk order:

a. **Apply patches.** For each `.audit/patches/<surface>--<slug>.diff` in the checkpoint:
   - Apply the unified diff.
   - If a patch fails to apply cleanly (merge conflict, missing context), skip that patch, log the failure, and continue with the rest.

b. **Run incremental quality gates** after each surface's patches are applied:
   - `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx tsc --noEmit`
   - Relevant `npx vitest run` test files for the surface.
   - `npx next lint --dir src`
   - If any gate fails: revert that surface's patches, mark it `blocked` in QUEUE.md with a note, and continue to the next surface. Do **not** abort the whole run.

c. **Architect subagent review** of the surface's diff. Apply any `Should-fix` findings inline. Note `Nice-to-have` items in the surface checkpoint without acting on them.

d. **Security inline review** of the surface's diff (OWASP Top 10, RLS correctness, input validation). Fix any findings before committing.

e. **Commit this surface's changes:**
   - Write `.git/COMMIT_MSG.txt`:
     ```
     audit: apply <surface> fixes

     <one-line summary of what was fixed — Fix-clean + Fix-staged>

     Audited and staged by Connect Auditor. Applied via /audit-fix.
     ```
   - `git add -A`
   - `git -c user.name="Citizens Network" -c user.email="citizensnetworkpbo@gmail.com" commit -F .git/COMMIT_MSG.txt`

   Commit per surface so each surface is independently revertable in git history.

f. **Update `.audit/QUEUE.md`** — mark this surface `clean` with the commit SHA and today's date.

### 4 — Run Supabase security advisors once after all surfaces

After the last surface commits (or if no surface committed due to failures):

- `mcp_supabase_get_advisors type:"security"` — compare to the baseline in PROJECT_STATUS.md. If any **new** warning appears, log it as a blocked finding in the relevant surface checkpoint. Do not push if new critical RLS warnings are introduced.

### 5 — Push

Only if at least one surface committed successfully and no new security advisor warnings were introduced:

```
git push origin main
```

If push fails, report the error and leave the committed-but-unpushed state for the user to resolve.

### 6 — Update continuity docs

- `.github/PROJECT_STATUS.md` — add a new batch section: "Audit fix batch (date)" listing surfaces applied, skipped, and blocked with commit SHAs.
- `.github/DECISIONS.md` — only if a fix produced a new architectural decision.
- `RESUME_HERE.md` "Audit queue" section — update each applied surface line to ✅ with SHA; note any blocked surfaces still needing manual resolution.
- Archive consumed `.audit/patches/<surface>--*.diff` files by moving them to `.audit/patches/applied/` (create if missing).

### 7 — Final report

Return:

```
## /audit-fix complete

**Surfaces applied:** N  (list with commit SHA per surface)
**Surfaces blocked:** N  (list with reason — patches available for manual apply)
**Surfaces skipped:** N  (user-deselected)

**Push:** ✅ pushed to main / ❌ not pushed (reason)
**Supabase advisors:** no new warnings / ⚠️ (detail)

**What's next:**
- Blocked surfaces to resolve: ...
- Remaining pending surfaces (not yet audited): run `/audit-next`
- Nice-to-haves noted in checkpoints: .audit/surfaces/<surface>.md
```

## Guardrails

- Never apply patches without explicit user confirmation in Step 2.
- Commit per surface, not one giant commit — preserves git bisect / revert granularity.
- Never push if any quality gate produced an unresolved failure.
- Never push if new Supabase security advisor warnings appeared.
- Never modify `.github/VISION.md`, `.github/MASTER_DIRECTION.md`.
- Never delete `.audit/surfaces/<surface>.md` checkpoints — they are a permanent record.
- If the working tree is dirty (uncommitted main-session work exists), stop at Step 2 and warn the user before proceeding.
