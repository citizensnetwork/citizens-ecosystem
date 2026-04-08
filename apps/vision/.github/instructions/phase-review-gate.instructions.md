# Phase Review Gate — Mandatory Quality Process

## Applies To
All code changes within the citizens-vision project.

## Rule: Phase Completion Requires Architect Review

No phase is considered complete until:

1. **All deliverables are implemented** as specified in ARCHITECTURE.md
2. **All tests pass** (`npm test` exits with 0)
3. **TypeScript compiles** (`npx tsc --noEmit` exits with 0)
4. **Linting passes** (`npm run lint` exits with 0)
5. **Architect Agent review** grades the phase A or B
6. **All Grade C/D items are fixed** before proceeding

## Rule: End-of-Phase Git Workflow

After architect review passes:

1. Update `.github/PROJECT_STATUS.md` with phase completion
2. Update `.github/DECISIONS.md` with any new decisions
3. Update agent/instruction files if new patterns were established
4. `git add -A && git commit -m "Phase X: ..." && git push origin main`

## Rule: No Phase Skipping

Phases must be completed in order as defined in ARCHITECTURE.md Section 9. Dependencies between phases are strict. If Phase N depends on Phase M, Phase M must be at Grade A/B before Phase N begins.

## Rule: Multi-Tenant Verification

Every phase that touches the database MUST include:
- RLS policy tests proving org isolation
- API route tests proving auth enforcement
- Manual verification that no cross-org data leaks exist
