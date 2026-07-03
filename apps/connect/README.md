# Citizens Connect

Member data platform for Citizens Network PBO.

---

## What the platform does

Citizens Connect manages membership records for Citizens Network PBO. It syncs
member data from a CSV export into our Supabase (Postgres) backend, runs periodic
data-cleaning batches, and produces reports for the board.

## How to run a batch

Batches are numbered data-maintenance jobs. To run one:

1. Read the batch description in `batches/batch-X.md` and follow its steps **in order**.
2. Each step has a matching SQL file in `sql/`. Review the SQL before running it.
3. Run each step against the `citizens-connect-prod` database.
4. Stop and report if any step errors or if a SQL file does not match what its
   batch doc says it should do.
5. Update `CHANGELOG.md` when the batch completes.

See `CLAUDE.md` for project conventions (idempotency, review-before-run, PII
handling).

## Key paths

- `batches/` — batch descriptions (the source of truth for what each batch does)
- `sql/` — the SQL files referenced by each batch step
- `scripts/sync_members.py` — syncs `data/members.csv` into the `members` table
- `docs/notes.md` — working notes
