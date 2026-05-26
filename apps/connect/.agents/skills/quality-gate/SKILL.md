---
name: quality-gate
description: >
  The Citizens Connect quality gate pipeline. Auto-loads when preparing to
  push a batch. Defines every step required before git push.
---

# Quality Gate Skill — Citizens Connect

Non-negotiable before every push to `origin/main`.

## Steps
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit                  # expect 0 errors
npx vitest run                    # expect 0 failures (baseline: 703 tests)
npx next lint --dir src           # expect clean
```

Then:
4. Architect agent review — apply all Should-fix; reach SHIP verdict
5. Security review inline — no new OWASP findings
6. `mcp_supabase_get_advisors type:"security"` — no new warnings vs baseline (84 WARN)

## Post-Push Docs (mandatory)
- `git push origin main`
- Update `RESUME_HERE.md` (what shipped, commit SHA, test count, next batches)
- Update `.github/PROJECT_STATUS.md` (batch checklist)
- Update `.github/DECISIONS.md` (any new technical decisions)

## RESUME_HERE.md Required Sections
1. Project at a glance
2. What just shipped (commit SHA + description)
3. Current platform state (test count, TS errors, lint)
4. Next batches queued (priority order)
5. Open questions / deferred items
6. How to verify locally (PowerShell commands)
7. Memory pointers
8. Architecture quick-orient
