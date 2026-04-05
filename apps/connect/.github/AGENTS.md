# Citizens Connect Agent Operating Contract

This repository is conversation-safe by design. Any chat can be deleted and rebuilt from files in `.github/`.

## Startup Protocol (every session)

1. Read `.github/PROJECT_STATUS.md`.
2. Read `.github/DECISIONS.md`.
3. Read `.github/copilot-instructions.md`.
4. If the task touches architecture, UI, maps, or Supabase, load the matching instruction file in `.github/instructions/`.
5. After implementing changes, update status/decision docs if anything meaningful changed.

## Persistence Rules

- Never store secrets in `.github/` docs.
- Keep secrets in `.env.local` only.
- Keep `PROJECT_STATUS.md` as the source of truth for progress.
- Keep `DECISIONS.md` as the source of truth for technical rationale.

## Definition of Done for Any Significant Task

- Code is implemented.
- Build or type check is run when relevant.
- `PROJECT_STATUS.md` reflects new progress.
- `DECISIONS.md` records any new technical decision.
- Any reusable workflow is captured as a prompt or agent in `.github/`.
