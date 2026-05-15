# `monorepo-prep/`

This folder is intentionally **not** wired into the build. It holds placeholder READMEs that describe each future package in the `citizens/` monorepo (see [`docs/MONOREPO_PLAN.md`](../docs/MONOREPO_PLAN.md)).

When the cutover happens, the contents of `monorepo-prep/packages/<name>/README.md` move into the new monorepo at `citizens/packages/<name>/README.md`.

Nothing here is imported. Nothing here ships. Treat as documentation.
