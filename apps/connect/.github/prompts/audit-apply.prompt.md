---
description: "Apply staged Fix-staged patches from .audit/patches/ for a given surface, run the full quality pipeline, and commit. Use in your MAIN dev session when nothing else is running."
agent: "Continuity Manager"
argument-hint: "Surface name to apply (e.g. 'rsvp-and-comments'). Must have an existing .audit/surfaces/<surface>.md checkpoint."
---
Apply the queued audit fixes for the surface the user named.

## Steps

1. **Orient.** Read `RESUME_HERE.md`, `.github/PROJECT_STATUS.md`, `.github/DECISIONS.md`, and `.audit/surfaces/<surface>.md`. Confirm the surface has status `findings-ready` in `.audit/QUEUE.md`. If not, stop and report.

2. **Confirm intent with the user.** Show the list of Fix-staged patches from the checkpoint with their risk levels. Ask via askQuestions whether to apply all, a subset, or abort. **Do not auto-apply.**

3. **Apply selected patches** one at a time. For each:
   - Apply the diff at `.audit/patches/<surface>--<slug>.diff`.
   - Run incremental checks (`npx tsc --noEmit`, relevant `vitest`).
   - If a patch fails to apply cleanly or breaks a gate, revert it and log the failure; continue with the rest.

4. **Run the full quality pipeline** after all selected patches apply:
   - `npx tsc --noEmit` → 0 errors
   - `npx vitest run` → suite passing
   - `npx next lint --dir src` → clean
   - Architect subagent review with diff summary → apply Should-fix inline
   - Security review pass
   - `mcp_supabase_get_advisors type:"security"` → no new warnings vs baseline

5. **Commit and push** per the user's standing quality pipeline procedure:
   - Write `.git/COMMIT_MSG.txt`
   - `git add -A`
   - `git -c user.name="Citizens Network" -c user.email="citizensnetworkpbo@gmail.com" commit -F .git/COMMIT_MSG.txt`
   - `git push origin main`

6. **Update continuity docs:**
   - `.github/PROJECT_STATUS.md` — note the audit-apply batch and surface
   - `.github/DECISIONS.md` — only if a finding produced a new architectural decision
   - `.audit/QUEUE.md` — mark surface `clean` with commit SHA and date
   - `RESUME_HERE.md` "Audit queue" section — update line to ✅ with SHA
   - Remove or archive consumed `.audit/patches/<surface>--*.diff` files

7. **Return** a concise report: surface, patches applied, patches skipped, quality gate results, commit SHA, next pending audit surface to suggest running.

## Guardrails

- Never apply a patch without explicit user selection.
- Never push if any gate fails — revert to last green and report.
- Never modify `.audit/surfaces/<surface>.md` checkpoint content; only update its status line at the top if present.
