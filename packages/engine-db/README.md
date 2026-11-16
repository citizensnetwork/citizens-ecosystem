# @engine/db: tools and proofs for the engine's database lines

Engine steps E5 and E6. There are two lines, and this package holds the code that writes and checks both:

- [`supabase-engine/`](../../supabase-engine/README.md): a tenant's own database. Read that first.
- [`supabase-control/`](../../supabase-control/README.md): the engine owner's control plane (step E6).

A line is a directory of numbered migrations with its own lock, ledger, checks and probes. The tools take the line
as a parameter (`linePaths('engine' | 'control')` in `paths.ts`); nothing is copied between them, and a file of
one line is never applied to a database of the other.

| Module          | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `cut.ts`        | Cuts the generated baseline files from a private structure dump and the allow-list                     |
| `allowlist.ts`  | Reads `allowlist.json`; lists the names that must never reach a tenant                                 |
| `sql-scan.ts`   | Splits SQL into code, strings, comments and quoted names (a function body is scanned one level deeper) |
| `leaks.ts`      | Reads migration files for anything of the source world that got through                                |
| `checks.ts`     | Writes `checks/catalogue.sql` from the lock, the allow-list and `engine-objects.json`                  |
| `control.ts`    | The control plane: its catalogue check and the seed of the features a tenant can be allowed            |
| `paths.ts`      | Where each line lives, and which ledger table its migrations write                                     |
| `wording.ts`    | The engine's default wording (the seed migration) and the payload a world publishes                    |
| `migrations.ts` | The migration files in order, and their lock                                                           |
| `drift.ts`      | The ledger check between the Citizens line and the engine line                                         |
| `provision.ts`  | The provisioning plan for one tenant                                                                   |
| `fanout.ts`     | Applies the line to every tenant project and reports drift                                             |

## Commands

Run them from the repository root. They need Node 24 (it runs the TypeScript files directly).

| Command                                               | What it does                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @engine/db test`                       | Builds the line from empty in an in-memory Postgres; runs every check, probe and tool test                  |
| `ENGINE_DB_WRITE=1 pnpm --filter @engine/db test`     | The same, and rewrites the two generated files (`checks/catalogue.sql`, `migrations/0010_wording_seed.sql`) |
| `pnpm --filter @engine/db lock`                       | Writes `migrations.lock.json` after you ADD a migration                                                     |
| `pnpm --filter @engine/db lock -- --line control`     | The same, for the control plane                                                                             |
| `pnpm --filter @engine/db drift`                      | The drift check, from the command line                                                                      |
| `pnpm --filter @engine/db cut -- <dump.json>`         | Cuts the baseline again from a private dump                                                                 |
| `pnpm --filter @engine/db provision -- ...`           | Prints the provisioning plan for one tenant; changes nothing                                                |
| `pnpm --filter @engine/db fanout -- --targets <file>` | Plans a fan-out; add `--apply` to apply. Refuses to run in CI                                               |

## Adding an engine migration

1. Write `supabase-engine/migrations/00NN_name.sql`. End it with
   `insert into engine.schema_migrations (version, name) values ('00NN', 'name');`.
2. State the grants of every new object. A new table: revoke everything from the app roles first, then grant
   only what is needed.
3. If it adds a table, a function, a trigger or a job, add the name to `supabase-engine/engine-objects.json`.
4. If it changes a sentence the database writes, change the catalogue in `packages/engine-config` and upsert the
   changed rows of `engine_wording` in the migration.
5. Run `pnpm --filter @engine/db lock`, then `ENGINE_DB_WRITE=1 pnpm --filter @engine/db test`.
6. If it is the twin of a Citizens migration, say so in `supabase-engine/citizens-line-ledger.json`.

## Adding a control-plane migration

The steps are in [`supabase-control/README.md`](../../supabase-control/README.md). In short: the file, its names
in `control-objects.json`, `pnpm --filter @engine/db lock -- --line control`, then the tests with
`ENGINE_DB_WRITE=1`.

## What the tests cannot show

The in-memory database is PostgreSQL 18 and has no job scheduler; the test shim stands in for it. The
`Engine baseline` workflow repeats both builds on the Postgres image hosted projects run. The control plane has
no live project yet, so that workflow is its only proof outside the unit tests. The fan-out tool is tested
against a stand-in for the platform and has not yet been run against a live project.
