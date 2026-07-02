# vendor/ — vendored ecosystem packages (pre-monorepo)

## citizens-frontend-build (`@citizens/frontend-build`)

**Vendored copy — do not edit here.** The canonical source lives in the
sibling repo at `citizens-wear/packages/frontend-build` (ecosystem Step 4,
[decision brief §6 row 4](../docs/strategy/ECOSYSTEM_DECISION_BRIEF.md)).
Connect consumes it via the `file:vendor/citizens-frontend-build` dependency
in [package.json](../package.json) because Connect deploys from this repo
alone (Vercel cannot reach a sibling checkout).

- **To update:** edit the canonical source in citizens-wear, run its tests
  (`pnpm --filter @citizens/frontend-build test`), then here run
  `npm run sync:frontend-build` and commit the refreshed copy.
- **Drift guard:** `src/__tests__/frontend-build-vendor.test.ts` compares this
  copy byte-for-byte (EOL-normalized) against the canonical source whenever
  the sibling checkout exists, and smoke-runs the vendored pipeline with
  Connect's own esbuild.
- **End of life:** at ecosystem Step 5 (monorepo lift) this directory is
  deleted and the dependency flips to `workspace:*`.
