# Topic: the engine (E items)

> The white-label map engine: a nameless copy of Connect that tenants rent, completely separate from Citizens (own Supabase organisation, own database line, no Citizens data). Plan: [`docs/engine/ENGINE_PLAN.md`](../../../../docs/engine/ENGINE_PLAN.md); decision record ADR-001 beside it. Added by the fold of 2026-11-25 from the journal entries of 2026-11-11 to 2026-11-22 (verbatim in [`../journal/2026-11.md`](../journal/2026-11.md)). Model rule (founder, 2026-11-16): steps once given to Fable 5.2 run on Opus 5.5 high with the written method (promise, failing probe, SQL, deliberate break, hostile second pass, reviews).

| ID | Item | Pri | Size |
|---|---|---|---|
| E1 | **DONE #352** (2026-11-11): plan (E0) and ADR-001. Founder answers O2 to O8 recorded 2026-11-11 (#353). Open by design: O1 (legal entity, attorney), O8 (the engine's real name, needed by the E6 console and E8). | — | — |
| E2 | **DONE #353**: boundary inventory, `docs/engine/BOUNDARY_INVENTORY.md`; 69 of 79 public tables in the engine baseline, 10 Citizens-only. | — | — |
| E3 | **DONE #354**: `packages/engine-config` (`@engine/config`), entitlements plus configuration. A tenant gets no `/api/v1`; Kingdom Projects is a neutral "community ideas" feature, off by default (founder, 2026-11-11). Its parity test reads Connect's files: a PR that changes a Connect value it records updates `src/configs/citizens.ts` in the same PR. | — | — |
| E5 | **DONE #359** (2026-11-15): engine line `supabase-engine/` (0001 to 0010, own lock), tools `packages/engine-db`; applied to the engine build project (eu-central-1, test data only) by checksum. A new `supabase/migrations` file needs a line in `supabase-engine/citizens-line-ledger.json`. | — | — |
| E6 | **Security half DONE #360** (2026-11-16); engine migration 0011 applied to the build project (founder, 2026-11-16). **Console half open:** needs O8 (the real name). | P2 | M |
| E7 | **Parts 1 and 2 DONE** (#364, #376 removed Connect's partner level ladder, #384 emails and server words read the world). **Part 3 open:** `shell.jsx`, `map-v2-strings.jsx`, the `index.html` title, `map-v2.css` tokens, then categories and colours (`data.jsx`, `lib/categories.ts`). Waits for Codex PRs #381 and #382 (founder, 2026-11-22). The facelift PRs #348 to #350 are treated as superseded (founder, 2026-11-22). | P2 | M |
| E8 | **Not started.** Needs founder items A22; resume the free engine build project first (it pauses after a week without use). | P3 | L |

**Engine traps (from the journal; do not lose these)**
- The Supabase connector is authorised for ONE organisation at a time; check which before any write. Cloud sessions are refused the Supabase tools entirely (2026-11-25).
- Never probe a refusal as the database owner with `set role anon` and a function call: on the hosted image the server process ends and the database restarts. Use `has_function_privilege` / `has_schema_privilege` under the switched role.
- A migration can be applied as one DO block that checks the file's SHA-256 and runs it with `execute`; `execute_sql` returns only the last statement's result.
- The public repository's Actions logs are public: no migration fan-out in its workflows and no tenant list in the repo.
