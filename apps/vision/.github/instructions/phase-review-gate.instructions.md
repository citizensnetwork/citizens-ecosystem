# Phase Review Gate — Mandatory Quality Process

## Applies To
All code changes within the citizens-vision project.

## Rule: Phase Completion Requires Full Agent Review Pipeline

No phase is considered complete until ALL agents have run their reviews:

### 1. Pre-Review Verification
1. **All deliverables are implemented** as specified in ARCHITECTURE.md
2. **All tests pass** (`npm test` exits with 0)
3. **TypeScript compiles** (`npx tsc --noEmit` exits with 0)
4. **Linting passes** (`npm run lint` exits with 0)

### 2. Agent Review Pipeline (ALL agents run sequentially)

| Order | Agent | Focus | Blocks Proceed? |
|-------|-------|-------|------------------|
| 1 | **Architect** | Security, architecture, DB, performance, code quality, test coverage | Yes (must grade A/B) |
| 2 | **Data** | Schema correctness, RLS isolation, index coverage, migration idempotency | Yes (must pass) |
| 3 | **Testing** | Coverage >=80%, test quality, missing test cases, deterministic tests | Yes (must pass) |
| 4 | **Product Lead** | Feature alignment, UX consistency, RBAC correctness, design language | Yes (must pass) |
| 5 | **Continuity** | Docs updated, decisions logged, git workflow executed | Yes (must pass) |

### 3. Cumulative Review Scope
Every agent review MUST cover:
- **Current phase** — All new code introduced in this phase
- **All previously completed phases** — Regression check on all existing code

This ensures no phase degrades the quality of prior work.

### 4. Review Output
Each agent produces a report in its defined format. All reports are appended to `.github/PROJECT_STATUS.md` under the phase entry.

### 5. Fix Cycle
- All Grade C/D items from Architect must be fixed
- All FAIL items from any agent must be fixed
- Re-run the failing agent(s) after fixes until all pass

## Rule: End-of-Phase Git Workflow

After ALL agent reviews pass:

1. Update `.github/PROJECT_STATUS.md` with phase completion + agent grades
2. Update `.github/DECISIONS.md` with any new decisions
3. Update agent/instruction files if new patterns were established
4. Update `.github/copilot-instructions.md` if tech stack or conventions changed
5. `git add -A && git commit -m "Phase X: ..." && git push origin main`

## Rule: No Phase Skipping

Phases must be completed in order as defined in ARCHITECTURE.md Section 9. Dependencies between phases are strict. If Phase N depends on Phase M, Phase M must be at Grade A/B before Phase N begins.

## Rule: Multi-Tenant Verification

Every phase that touches the database MUST include:
- RLS policy tests proving org isolation
- API route tests proving auth enforcement
- Manual verification that no cross-org data leaks exist
