# @engine/db: tools and proofs for the engine database line

Engine step E5. The database line itself is [`supabase-engine/`](../../supabase-engine/README.md); read that
first. This package holds the code that writes and checks it.

| Module          | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `cut.ts`        | Cuts the generated baseline files from a private structure dump and the allow-list                     |
| `allowlist.ts`  | Reads `allowlist.json`; lists the names that must never reach a tenant                                 |
| `sql-scan.ts`   | Splits SQL into code, strings, comments and quoted names (a function body is scanned one level deeper) |
| `leaks.ts`      | Reads migration files for anything of the source world that got through                                |
| `checks.ts`     | Writes `checks/catalogue.sql` from the lock, the allow-list and `engine-objects.json`                  |
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

## What the tests cannot show

The in-memory database is PostgreSQL 18 and has no job scheduler; the test shim stands in for it. The
`Engine baseline` workflow repeats the build on the Postgres image hosted projects run. The fan-out tool is tested
against a stand-in for the platform and has not yet been run against a live project.
