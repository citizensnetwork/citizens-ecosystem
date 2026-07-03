---
applyTo: "**"
description: "Documentation routing rules for Citizens Connect. Defines where decisions are written, what to read at session start, and anti-bloat thresholds."
---
# Documentation Routing

## Session start (mandatory)
Read `RESUME_HERE.md` before any other action. It is the single source of truth for current repo state, what just shipped, and what is next.

## Write decisions here — not elsewhere

| Type | Write to |
|---|---|
| Contributor dashboard feature decisions | `docs/plans/contributor-dashboard.md` → "Implementation Decisions Log" section |
| Messaging / friends / search / reporting / dynamic surfaces decisions | `docs/feature-clarity/<feature>.md` |
| Codebase-wide rules that bind all new code | `.github/DECISIONS.md` |
| Batch completion records + test baselines | `.github/PROJECT_STATUS.md` |
| Session state / next batch / resume instructions | `RESUME_HERE.md` |

**Never** append batch-specific or feature-specific decisions to `.github/DECISIONS.md`. That file is for codebase-wide rules only — if it exceeds ~120 lines, the bottom half belongs in `docs/archive/DECISIONS_ARCHIVE.md`.

## Anti-bloat thresholds (triggers for cleanup)

| File | Threshold | Action |
|---|---|---|
| `.github/DECISIONS.md` | > 120 lines | Archive everything below line 100 to `docs/archive/DECISIONS_ARCHIVE.md` |
| `RESUME_HERE.md` | > 200 lines | Trim "what shipped" history to the 5 most recent batches |
| `docs/plans/contributor-dashboard.md` | > 600 lines | Split implementation log into `docs/archive/dashboard-decisions-<year>.md` |
| Any `.github/*.md` or `docs/*.md` | 1 commit + > 6 weeks old | Move to `docs/archive/`; update any refs |
