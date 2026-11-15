# The control-plane database line

Engine step E6, security half. Read with [`ADR-001`](../docs/engine/ADR-001-engine-architecture.md) (decision 3 in
full, decision 5 for fan-out) and the tenant's side in [`supabase-engine/`](../supabase-engine/README.md).

This directory is the database of the **control plane**: the engine owner's own small project. It lists the
tenants, holds what each one is allowed, records where each one's database stands, and keeps the log of everything
a Superuser does. It holds no user, partner or message of any tenant, and a tenant's world never calls it.

This repository is public. Nothing here names a tenant or a real organisation, and no project identifier is
written in it.

## The rules

1. **Nothing in this directory is ever applied to a tenant's project or to the Citizens project.** It is a third
   line, beside `supabase/` (Citizens) and `supabase-engine/` (a tenant), with its own numbering, lock and ledger.
2. **There is no live control-plane project yet.** The account has no free project slot (ADR-001, decision 1). The
   line is built from empty and proven in the unit tests and in CI, on the Postgres image hosted projects run. The
   real project is created at the launch gate.
3. An applied migration never changes: `migrations.lock.json` holds the hash of every file and a test fails when
   one differs. A new migration gets the next four-digit number.

## What is in it

| File or folder         | What it is                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `migrations/0001`      | The private schema, the thirteen tables, the append-only audit log                        |
| `migrations/0002`      | The functions: the only way in                                                            |
| `migrations/0003`      | The features a tenant on the engine line can be allowed (generated from the feature list) |
| `migrations.lock.json` | The hash of every migration file                                                          |
| `control-objects.json` | Everything a built control plane holds, by name (kept by hand)                            |
| `checks/catalogue.sql` | Generated from the object list. Raises when something is missing or nobody listed it      |
| `checks/security.sql`  | Raises when a mistake would open the control plane (list below)                           |
| `probes/01` to `07`    | Rollback-only probes: each proves a promise and keeps nothing                             |
| `probes/_setup.sql`    | Made-up people and tenants for the probes                                                 |

The tools are the package [`packages/engine-db`](../packages/engine-db/README.md), the same ones the engine line
uses: they take the line as a parameter. The test-only platform shim is shared
(`supabase-engine/test/platform-shim.sql`).

## The shape, and why

**Every table is in a private schema, `control`.** The data API does not serve it. The three roles that speak
through the data API (a visitor, a signed-in account, the service role) cannot use the schema at all.

**Every table has row security on and no policy, and every privilege is revoked table by table.** So even if the
schema were opened by mistake, nobody could read or write a row. Why both: a new table on this platform gives
those roles every privilege by default, and row security does not stop one of them (`TRUNCATE`).

**The only way in is 27 functions in `public`.** Each one:

- runs with its owner's rights and an empty search path;
- can be called by the signed-in role only, never by a visitor and never by the service role;
- starts, before it reads an argument, with one check of the caller (next section);
- writes its audit row in the same transaction as the change. A change without its row, or a row without its
  change, cannot exist.

Reading goes through functions too. There is no policy to get wrong, because there is none.

**There is no back door for a server.** The service role gets nothing: no table, no function. A console server
therefore cannot act by itself; it can only pass on the session of the Superuser who is using it. The same goes
for tooling that records results (a fan-out report, usage totals): it signs in as the person who runs it.

## Who may act: Superusers, the second factor, and the first Superuser

This is the decision the E6 brief asked for.

**A Superuser is an account of the control-plane project's own sign-in, listed in `control.superusers`.** It is
never an account in any tenant. There are two roles:

| Role               | May                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `superuser`        | Everything the functions offer                                                             |
| `support_operator` | See the tenant list and use break-glass support access (open, record, close). Nothing else |

**How a Superuser signs in** (recommended; settings of the project, made when it is created):

1. Sign-ups are switched off. Accounts exist only by invitation from the project's dashboard.
2. The first factor is the 6-digit email code, as in every world of the engine. No password is stored.
3. The second factor is an authenticator app (a time-based code). It is required.

**The database checks the second factor itself.** `control.require_superuser()` reads it from the session
(`aal2`) on every call. A session without it is refused with `second_factor_required`, whatever a screen or a
server forgot to check. A person taken off the list is refused on their next call, on the same session.

**How the first Superuser is created.** Once, at the launch gate, by the owner of the database, from the SQL
editor of the new project:

```sql
select control.bootstrap_first_superuser('<the account id>', '<the name shown in the log>');
```

The account is invited and has enrolled its authenticator app first. The function lives in the private schema, no
role of the data API can reach it, it writes its own audit row, and it refuses as soon as the list has ever held
anyone. So it cannot add a second person and cannot be used to come back after a revocation. Everyone after the
first is added by a Superuser with `superuser_add` (with a reason). Nobody removes themselves, so the list can
never become empty. A revoked person stays on the list as revoked: the audit log keeps pointing at somebody, and
the account cannot be deleted from the sign-in system underneath it.

**Two things to do when the project is created, because they are not in a migration:**

- **The project's secret (service) key is never deployed anywhere.** It gets nothing from this schema, but the
  sign-in system would let its holder reset another account's factors. The console needs only the publishable key
  and the Superuser's own session.
- Set a session time limit (recommended: 12 hours, and 1 hour without activity; both are paid-plan settings).

## The tables

| Table                   | Holds                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `tenants`               | One row per tenant: name, status (`building`, `live`, `suspended`, `retired`), region, dates |
| `tenant_domains`        | The domains a tenant's world answers on; exactly one may be the main one                     |
| `tenant_infrastructure` | Identifiers only: which database project, hosting project, email domain and map key          |
| `tenant_entitlements`   | The entitlements document, its revision, and which revision is in the tenant's project       |
| `grantable_features`    | The features the engine line can carry (generated)                                           |
| `engine_releases`       | Engine versions, with the schema head and fingerprint each one expects                       |
| `tenant_schema_state`   | Per tenant: head, fingerprint, in step or drifted, when it was applied and checked           |
| `provisioning_runs`     | The steps of creating or retiring a tenant, and where a run stopped                          |
| `usage_totals`          | Daily numbers per tenant. Numbers only                                                       |
| `support_access_grants` | Break-glass grants                                                                           |
| `audit_log`             | Every action: who, what, which tenant, why, when                                             |
| `superusers`            | Who may act                                                                                  |
| `schema_migrations`     | Which migrations of this line the database has                                               |

Choices worth knowing:

- **A tenant moves along one path.** Building to live; live to suspended and back; any of them to retired.
  Suspending deletes nothing. Retiring is final, and the function refuses it until the caller confirms that an
  export or a transfer of the project was offered first. Nothing about a retired tenant changes afterwards.
- **Identifiers, never secrets.** Each column of `tenant_infrastructure` accepts only the shape of an identifier
  (a 20-character project reference, a hosting project id, a domain, the _name_ a map key has in the map account).
  A token, a key or an address does not have that shape, so the table refuses it. Keys live in each tenant's own
  hosting project and nowhere else (ADR-001, decision 4).
- **A feature of another database line can never be allowed.** The console's server runs the contract's full
  check (`validateEntitlements`) first. The database then checks again, whoever called: the document is for the
  engine line, every feature is a yes or a no, and every yes is on the generated list. The table repeats the
  tenant side's own checks, so a document accepted here is accepted there.
- **The entitlements are pushed, then recorded.** `tenant_entitlements_set` stores the new revision and its audit
  row (with the document before and after). The copy in the tenant's project is written by the provisioning or
  fan-out tooling with `engine.write_entitlements`, and `tenant_entitlements_delivered` records it. The tenant
  list shows a revision that has not arrived yet.
- **Maintenance access is logged here.** `tenant_schema_state_record` is what a fan-out or a drift check reports
  for one tenant: the release, the head, the fingerprint, whether a migration was applied, and a note. The
  function works out `in_step` or `drifted` against the release.
- **Provisioning notes cannot hold a secret.** A step's note is short and is refused when it looks like a key,
  a token or a password.

## The audit log

Every change made through the functions writes one row: the actor (a listed account), the action, the tenant,
the reason, the detail, the time. Changes that decide something need a reason of 5 to 500 characters; recordings
of what a tool found (a schema state, a provisioning step, usage) do not.

**Append-only, twice over.** By grants: no role of the data API holds any privilege on it. By trigger: an update,
a delete or a truncate is refused for everyone, the owner of the database included. Reading the control plane's
own records (the tenant list, the log) writes no row: the log is for actions.

## Break-glass support access, step by step

The six steps of ADR-001, decision 3, and where each one lives.

| Step | What happens                                                                                   | Where                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | A Superuser or support operator opens a grant: tenant, reason, read-only, at most 30 minutes   | Here: `support_grant_open`. One open grant per tenant (an index), audit row              |
| 2    | The grant is written into the tenant's project as a support session                            | Tenant: `engine.open_support_session`. Here: `support_grant_delivery` records the answer |
| 2    | Reads go through reader functions that check the session and log each read                     | Tenant: `engine.support_*` readers, `public.support_session_reads`                       |
| 3    | Expiry fails closed; a job every 5 minutes closes abandoned sessions and guarantees the notice | Tenant: the readers' own clock check, job `support-session-expiry`                       |
| 4    | The tenant's staff see every session and read, and are told when one opens and ends            | Tenant: the two tables (staff read them), notices of type `support_access`               |
| 4    | The same entries are copied to the control-plane audit log                                     | Tenant: `engine.support_session_report`. Here: `support_reads_record`, once per entry    |
| 5    | No write-as-user                                                                               | Both: the only access value is `read_only`; the tenant side has no writing function      |
| 6    | "Ask me first": a grant waits for the tenant's approval                                        | Tenant: its own setting decides; `public.decide_support_session`                         |

Choices worth knowing:

- **The tenant's database enforces the limits again.** It sets the 30 minutes by its own clock, allows one open
  session, and decides by its own setting whether a session starts active or waits. So the promise holds even if
  the control plane or the tooling has a fault.
- **The default is notify-and-show** (founder, ADR-001 open item O6). The tenant switches on "ask me first" in its
  own settings (`support_access_mode`), not in the control plane: the engine owner cannot quietly switch it off.
- **With "ask me first", the 30 minutes include the wait.** A request nobody answers in time expires unused. This
  is the careful reading; a longer waiting period would be a new decision.
- **A tenant's staff can end a session at once** (`public.end_support_session`). The ADR did not ask for it; it
  costs nothing and it is the tenant's own off switch.
- **What is copied back here holds nothing about a person**: for each read its number, time and kind, and for a
  private thread the reason given. The account that was read stays in the tenant's own log.
- **A grant's facts are fixed.** Its tenant, reason, time box and read-only access cannot be changed after it is
  opened, an ended grant cannot be opened again, and no grant is ever deleted.

## Honest limits

- **The owner of the database can do anything.** Whoever holds the engine organisation can open the control plane
  in the platform's dashboard, switch off a trigger and edit the log, and the platform keeps no record of it on
  the plan in use. The guards here make a mistake impossible and make tampering visible in the schema check; they
  do not make it impossible. ADR-001 says the same of tenant projects. The security review (step E10) should
  decide whether to anchor the log outside the control plane.
- **The readers are the sanctioned path, not a wall.** Support reads are run as the tenant database's owner
  through the tooling. The same owner could read a table directly. The operator agreement must say that the
  readers are the only way the operator reads (ADR-001, decision 7).
- **Nothing here has run on a hosted project.** The proof is the unit tests and the CI job.

## Proving it

| Proof                  | What fails it                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build from empty       | A migration that does not apply to an empty database                                                                                              |
| `checks/catalogue.sql` | Something missing or unlisted; a function that a visitor, the service role or everyone can call; a function the signed-in role cannot call        |
| `checks/security.sql`  | A table without row security; any policy; any privilege for a data API role; a function without the caller check; a missing or switched-off guard |
| `probes/01`            | Anyone but a listed Superuser with a second factor gets in (every function is tried)                                                              |
| `probes/02`            | A change without exactly one audit row; a refused change that leaves something; a read that writes                                                |
| `probes/03`            | The audit log or a grant's facts can be changed, even by the owner                                                                                |
| `probes/04`            | A tenant leaves its path; a secret-shaped value is stored as an identifier                                                                        |
| `probes/05`            | A document for another line, or a feature the engine line cannot carry, is accepted                                                               |
| `probes/06`            | A grant without a reason, longer than 30 minutes, or a second one; a read copied twice                                                            |
| `probes/07`            | The bootstrap works twice; someone removes themselves; a revoked person gets in                                                                   |
| Migration lock         | An edited migration                                                                                                                               |

Both run in `pnpm --filter @engine/db test` (in-memory Postgres) and in the `Engine baseline` workflow, job
"Control plane" (the hosted Postgres image). Each check has a test that breaks the database on purpose and
expects the check to catch it.

**When writing a probe**, the trap described in [`supabase-engine/README.md`](../supabase-engine/README.md)
applies: after `set local role ...`, never call a function that role may not call and never touch the private
schema; look the right up. The functions in `public` may be called as the signed-in role: it holds the right, and
they refuse from the inside.

## Adding a migration

1. Write `migrations/00NN_name.sql`. End it with
   `insert into control.schema_migrations (version, name) values ('00NN', 'name');`.
2. A new table: row security on, no policy, every privilege revoked. A new function in `public`: owner's rights,
   empty search path, `v_actor control.superusers := control.require_superuser(...)` as its first declaration, an
   audit row for a change, and its name in the grant list.
3. Add every new name to `control-objects.json`.
4. Run `pnpm --filter @engine/db lock -- --line control`, then `ENGINE_DB_WRITE=1 pnpm --filter @engine/db test`.

## Left for the console half of E6

The screens, the console's server, and the tooling that carries a grant into a tenant's project and the reads
back. The database side they need is here.
