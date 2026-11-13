# The engine database line

Engine step E5. Read with [`docs/engine/ENGINE_PLAN.md`](../docs/engine/ENGINE_PLAN.md),
[`ADR-001`](../docs/engine/ADR-001-engine-architecture.md) (decisions 3 and 5),
[`BOUNDARY_INVENTORY.md`](../docs/engine/BOUNDARY_INVENTORY.md) (section 4) and the configuration contract in
[`packages/engine-config`](../packages/engine-config/README.md).

This directory is the database of a tenant's world: the migrations that build it from an empty project, and the
files that prove it. It sits beside `supabase/`, which stays the one migration line of the Citizens project.

This repository is public. Nothing here names a tenant or a real organisation, and no project identifier is
written in it.

## The two rules

1. **Nothing in this directory is ever applied to the Citizens project.**
2. **Nothing from `supabase/` is ever applied to a tenant.** A tenant gets these files and nothing else.

A new migration goes into `migrations/` with the next four-digit number. An applied migration never changes:
`migrations.lock.json` holds the hash of every file and a test fails when one differs.

## What is in it

| File or folder              | What it is                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `allowlist.json`            | Which objects of the source database go in, which go in after a change, and which stay out. Out is the default |
| `baseline.lock.json`        | Which dump the baseline was cut from (its hash, its pinned head) and what a built database must contain        |
| `engine-objects.json`       | What the engine line adds beyond the cut (kept by hand)                                                        |
| `migrations/0001` to `0010` | The baseline, in order (below)                                                                                 |
| `migrations.lock.json`      | The hash of every migration file                                                                               |
| `citizens-line-ledger.json` | The drift ledger between the Citizens line and this one (below)                                                |
| `checks/`                   | Two SQL files that raise an error when a built database is wrong: `catalogue.sql`, `security.sql`              |
| `probes/`                   | Rollback-only probes: each one proves a promise and keeps nothing                                              |
| `test/platform-shim.sql`    | Test only: what a hosted project already has before the first migration. Never applied to a real project       |

The tools that write and check these files are the package [`packages/engine-db`](../packages/engine-db/README.md).

## How the baseline was cut

The source is the structure of the Citizens database (its tables, functions, row policies and grants; no rows),
read on 2026-11-12 at the head `202_lets_gatherings`. The head is pinned by file name, because 202 was applied
before 201. It was read from the live database and not replayed from the migration files, because two of the first
tables have no `create table` in those files.

That dump is private and is not in this repository. What is here is everything made from it:

- `allowlist.json` says, object by object, what goes in. The generator stops if the dump holds anything the list
  does not name, so a new object in the source can never slip into a tenant unnoticed.
- `pnpm --filter @engine/db cut -- <dump>` writes the five generated files (`0002`, `0003`, `0006`, `0007`,
  `0008`) and `baseline.lock.json`.

| In the source                | In the engine line                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 79 tables                    | 69 in, 10 out (billing, sibling-app bridges, API keys, AI search, form intake, the listing helper, two orphans) |
| 139 functions                | 95 as they are, 15 after a change, 29 out                                                                       |
| 44 triggers                  | 32 in, 12 out (they sit on a cut table or call a cut function)                                                  |
| 2 views                      | 1 in, 1 out                                                                                                     |
| 15 scheduled jobs            | 8 in (one of them changed), 7 out                                                                               |
| 3 storage buckets            | 2 in, 1 out                                                                                                     |
| Rows (categories, places, …) | None. Every table arrives empty                                                                                 |

The inventory counted 27 functions out and 10 changed. Step E5 found two more that stay out (a billing rate helper,
and a helper only a cut column used) and five more that need a change (they named a cut column, a cut table, or
carried a sentence or a fixed list of the source world).

Internal names stay as they are (`contributor_*`, the role value `citizen`, `schedule_kingdom_project`): one
codebase runs against both lines, and nobody using a world ever sees them (ADR-001, decision 5).

## The ten files

| File                                     | Written by                    | What it does                                                                                                                            |
| ---------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_extensions_and_default_privileges` | hand                          | Extensions, the private `engine` schema (migration ledger, per-project settings, schema fingerprint), and safe defaults for new objects |
| `0002_tables`                            | the cut                       | 69 tables, their constraints and indexes                                                                                                |
| `0003_functions`                         | the cut                       | The 95 functions that go in exactly as they are                                                                                         |
| `0004_engine_configuration`              | hand                          | What the world is allowed, what it chose, and its words (next section)                                                                  |
| `0005_changed_functions`                 | from the dump, by exact edits | The 15 functions that go in after a change; the reason is above each one                                                                |
| `0006_views_triggers_policies`           | the cut                       | The view, 32 triggers, row security on every table, 212 row policies                                                                    |
| `0007_grants`                            | the cut                       | Every grant, stated object by object                                                                                                    |
| `0008_storage_and_realtime`              | the cut                       | Two storage buckets with their rules, six realtime tables                                                                               |
| `0009_scheduled_jobs`                    | hand                          | Eight jobs                                                                                                                              |
| `0010_wording_seed`                      | from the message catalogue    | The engine's default wording                                                                                                            |

## The storage step E3 left to E5, and why each choice

### 1. Where the configuration lives: `public.engine_configuration`

One row per published revision: the revision number, the contract version, the document as `jsonb`, who published
it and when, and whether it is the current one.

- **Exactly one current.** A partial unique index allows at most one current row; publishing switches the old one
  off and the new one on in the same transaction.
- **A published revision is a record.** A trigger refuses any edit or delete. Going back to an earlier
  configuration means publishing it again as the next revision, so the history shows what happened.
- **Who reads.** Everyone reads the current revision, signed in or not: the app needs it to start. Staff also read
  the earlier ones.
- **Who writes.** Nobody writes the table directly, not even the world's own server. The only way in is
  `publish_engine_configuration(document, wording, published_by)`, which only the server's role may call.
- **What the database checks, and what it leaves to the server.** The server runs the contract's full check
  (`validateConfiguration`) first. The database then checks again, whoever called: the document is an object, its
  contract version has the same major number as the entitlements, the revision is the last one plus one, every
  feature that is switched on is allowed by the entitlements, the map tilt and the category lists are within the
  limits, and the service provider is named when the engine owner requires it. So the one rule that protects the
  engine owner, _a configuration can only switch on what the entitlements allow_, holds even if a server has a
  bug. The full shape of the document (about 30 KB as JSON Schema) is not checked in the database: it would have
  to be migrated to every tenant for every small addition to the contract.

### 2. The read-only copy of the entitlements: `public.engine_entitlements`

One row. The table refuses a document that is not for the engine line.

- **Tenant roles can read, never write.** The signed-out role, the signed-in role **and the world's own server
  role** have `select` and nothing else. A new table on this platform gives the first two every privilege by
  default, including one that row security does not stop (`TRUNCATE`); those defaults are revoked here, on this
  table and on every table of the baseline.
- **Who writes.** Only the database owner, through `engine.write_entitlements(document)` in the private schema,
  which no role inside the world can reach. That is the channel the engine owner's tooling uses (provisioning, and
  every later change).
- **It takes effect at once.** `engine_feature_on(feature)` answers yes only when the world switched the feature
  on **and** the entitlements allow it, so a feature the engine owner takes away is off before any new publish.

### 3. The wording table: `public.engine_wording`, and `engine_text(key, values)`

Six database functions used to write their own sentences, with the source world's words in them. They now read
every sentence by key.

- **Rows.** `(key, source, renderer, text)`. `source` is `engine` (the neutral default) or `tenant` (the world's
  own words). `renderer` is `database` or `edge`: the same table serves the edge functions.
- **The defaults** are seeded by `0010`, which is generated from the message catalogue in `@engine/config`
  (every message a database or edge function writes out, 19 today). A test fails when the file and the catalogue
  differ. A world must name itself, so the engine has no default name; a default row says "this app" where a
  world's name would go.
- **A world's own words** are written by publishing: the server sends what `createWorld(...).wording(...)` gives,
  and the publish function replaces all `tenant` rows in the same transaction as the configuration. A key the
  engine does not know is refused.
- **The helper** returns the world's row, else the engine's default, else the key itself. A missing sentence shows
  up as an odd text; it never stops the action that wanted to send it. Values (`{$name}`) are filled in during a
  single pass, so a value that looks like a placeholder is never read as one.
- **Eleven sentences were missing from the catalogue** and were added to `packages/engine-config` (adding a
  message is not a contract change). The Citizens configuration renders every one exactly as the Citizens database
  writes it today.

Other sentences inside the as-is functions are neutral English and stay where they are for now. Moving them into
the table uses the same helper and is a follow-up, not part of this step.

### 4. How the `categories` table follows the configuration

The table arrives empty. Publishing brings it in line: one row per event or place category, found by its id (the
`slug`), with its label, colour and order. An id in both lists applies to both. A category that left the
configuration is removed **only when no event and no place uses it**; one that is in use stays, so old listings
keep their name and colour, and the app simply stops offering it for new ones.

- The app roles can read the table and nothing else: publishing is its only writer.
- In the source, the list of event categories was written into a constraint. Here a trigger checks an event's
  category against the table. The same went for partner kinds, the ideas ladder and the gathering starters: each
  fixed list became a format check, and the list itself is the world's configuration.

### Also

- **Features that are off are off in the database.** The two ideas functions a signed-in person can call refuse
  while the ideas feature is off.
- **Scheduled jobs never hold an address.** The weekly digest calls `engine.call_edge_function`, which reads the
  project's own address and publishable key from `engine.project_settings` (set at provisioning) and does nothing
  until they are set.
- **Grants.** Every grant is written out, so the result does not depend on a project's defaults. The app roles get
  no `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN` on any table and only `SELECT` on a view. Function grants
  are copied exactly as they are in the source; tightening them is for the security review (step E10).
- **No object comments** are carried over: they cite the source's migration numbers and its framing.

## Proving it

| Proof                  | What fails it                                                                                                                                                                            | Where it runs                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Build from empty       | Any migration that does not apply to an empty database                                                                                                                                   | Unit tests (in-memory Postgres) and the `Engine baseline` workflow (the hosted Postgres image) |
| `checks/catalogue.sql` | Something missing, something nobody listed, a name that stays out, a function an unlisted role can call                                                                                  | Both, and against a tenant after fan-out                                                       |
| `checks/security.sql`  | A table without row security, an app role that can empty a table or write an engine table, an owner-rights function without a fixed search path                                          | Both                                                                                           |
| `probes/*.sql`         | A broken promise: tables arrive empty, the engine tables are locked, publishing keeps the rule, functions speak the world's words, accounts and privacy, categories and feature switches | Both                                                                                           |
| Leak check             | In any migration file: a cut name, a sibling schema, a sentence or comment with the source's framing, an address, a key, an email address, seed data                                     | Unit tests                                                                                     |
| Migration lock         | An edited migration                                                                                                                                                                      | Unit tests                                                                                     |
| Drift ledger           | A Citizens migration nobody decided about                                                                                                                                                | Unit tests                                                                                     |

The unit tests are part of `pnpm test`. Each check has a test that breaks the database on purpose and expects the
check to catch it.

## Provisioning beyond SQL

`pnpm --filter @engine/db provision -- ...` prints the whole list for one tenant, in order, with the SQL for the
steps that are SQL. It changes nothing. The list covers the project itself, the migrations, the entitlements, the
per-project settings the jobs read, the sign-in settings, the storage buckets, the jobs, the function secrets, the
first staff account, the first configuration and the proofs.

**The 13 edge functions cannot be deployed to a tenant yet.** They still write their own sentences and their
default sender. The plan marks each one blocked until it reads its text from the wording table and its sender from
the function secrets.

## Fan-out: one migration, every tenant

`pnpm --filter @engine/db fanout -- --targets <file> [--apply]`

For each tenant, in order: check the project, read which migrations it has, apply the missing ones (each in its own
transaction), run the two checks, read the schema fingerprint. It stops at the first failure and never carries on
by itself. The report says where each tenant stands and whether all tenants on the newest migration have the same
fingerprint.

It refuses, before changing anything:

- to run in CI (this repository is public, and so are its logs);
- a project outside the one organisation it was told about;
- a database that holds a sibling app's schema;
- a database that has tables but no engine ledger;
- a database whose history is not a prefix of this line.

The tenant list is a file kept outside the repository (later: read from the control plane). The tool has tests
against a stand-in for the platform; **it has not yet been run against a live project.** Its first real run is the
pilot's provisioning.

## Drift between the two lines

The Citizens project keeps migrating. Every Citizens migration after the baseline is a question: does a tenant
need the same change? The answer goes into `citizens-line-ledger.json`:

- `citizens-only`, with a reason;
- `twinned`, with the engine migration that carries the same change;
- `not-yet`, with what is waiting (allowed, and printed as a warning).

A test fails when a file in `supabase/migrations` has no entry, and it says which engine-covered tables and
functions the migration names. **So a pull request that adds a Citizens migration must add its ledger entry.**

Why a ledger and not a comparison of two databases built from empty (as ADR-001 first sketched): the Citizens line
cannot be built from its files alone.

## What the app must stop asking a tenant database for (for step E7)

The same app code runs against both lines. Today it still names 32 things a tenant database does not have:

- 6 tables, in the features that are on the Citizens line (the listing helper is the largest: 11 files);
- 16 functions (form intake, API keys, the listing helper);
- all 10 cut `profiles` columns (`auto_update_level` in 7 files; the rest in the list of profile columns).

Each belongs to a feature a tenant cannot be given, so step E7 puts each behind its feature switch. Two more
hand-overs for E7: the ideas ladder needs an optional "staff decide" mark per tier (today a setting,
`ideas_review_tiers`), and the 13 edge functions need to read their wording by key.
