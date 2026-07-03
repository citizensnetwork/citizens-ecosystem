---
description: "Capture and persist the latest progress, decisions, and next steps into project docs so conversation deletion is safe."
agent: "Continuity Manager"
argument-hint: "Optional summary of what was done in this session"
---
Persist the current session outcomes for future chat continuity.

## Steps

1. Review git changes and recently touched files.
2. Update `.github/PROJECT_STATUS.md` with any completed/in-progress changes.
3. Update `.github/DECISIONS.md` with new decisions, rationale, and date.
4. Add explicit next actions to `PROJECT_STATUS.md` if useful.
5. Ensure no secrets are written into `.github/` files.

## Output

- Summary of continuity updates
- Exact files updated
- Any unresolved risks or TODOs
