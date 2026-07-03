---
description: "Resume the project from files only, reconstruct context, execute the requested task, and update project continuity docs before finishing."
agent: "Continuity Manager"
argument-hint: "Task to continue, for example: 'resume from current status and implement place edit/delete'"
---
Continue Citizens Connect work without relying on chat history.

## Steps

1. Read:
- `.github/PROJECT_STATUS.md`
- `.github/DECISIONS.md`
- `.github/copilot-instructions.md`
- Relevant `.github/instructions/*.instructions.md`

2. Summarize current state in 5-10 bullets.

3. Execute the requested task end-to-end.

4. Run verification checks relevant to the change.

5. Persist continuity updates:
- Update `PROJECT_STATUS.md`.
- Update `DECISIONS.md` for any new decision.

6. Return:
- What was implemented
- Files changed
- Validation results
- Follow-up options
