---
description: "Diagnose and reconnect Citizens Connect to Supabase end-to-end (env check, project linkage, table/rls verification, and fixes)."
agent: "Continuity Manager"
argument-hint: "Optional issue context, e.g. 'auth failing on signup' or 'cannot fetch categories'"
---
Reconnect and verify Supabase integration for Citizens Connect.

## Steps

1. Verify `.env.local` contains:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`

2. Compare env values against live Supabase project URL and publishable key.

3. Verify connectivity:
- Execute SQL `select current_database(), now();`
- List public tables and confirm core tables exist.

4. Verify security baseline:
- Confirm RLS enabled on core tables.

5. If missing schema detected:
- Create/apply migration via MCP tooling
- Re-check tables/migrations

6. Return:
- Connection status (`connected` or `blocked`)
- Exact mismatch/fix details
- Files/DB changes made
- Next action to keep dev flow stable
