---
description: "Create and apply a Supabase migration from this workspace using MCP, then verify schema and migration history."
agent: "Continuity Manager"
argument-hint: "Describe the schema change, e.g. 'add places.opening_hours text and index by created_at'"
---
Implement a Supabase schema change end-to-end with verification.

## Workflow

1. Read current schema and migrations:
- `supabase/schema.sql`
- `supabase/migrations/`

2. Create a new migration file in `supabase/migrations/` with the next sequential number.
- Migration SQL must be idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$` for policies).

3. Update `supabase/schema.sql` so canonical schema matches the migration.

4. Apply the migration to Supabase using MCP migration tooling (not local CLI).

5. Verify:
- List migrations and confirm the new migration appears.
- List tables/columns affected.
- Confirm RLS remains enabled for relevant tables.

6. Persist continuity updates:
- Update `.github/PROJECT_STATUS.md` if project status changed.
- Update `.github/DECISIONS.md` if any architectural/security decision changed.

## Output

- Files created/updated
- Migration name/version applied
- Verification evidence (tables/migrations/RLS)
- Any follow-up actions
