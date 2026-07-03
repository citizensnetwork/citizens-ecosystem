---
description: "Generate a new Supabase table with migration SQL, schema update, TypeScript types, and RLS policies"
agent: "agent"
argument-hint: "Table name and columns, e.g. 'places: name text, category_id uuid FK categories, lat double precision'"
---
Create a new Supabase table for the Citizens Connect project. Follow all existing patterns exactly.

## Input

The user will provide a table name and column definitions. Parse them and generate ALL of the following artifacts.

## Steps

### 1. Migration SQL

Create a new file at `supabase/migrations/NNN_add_<table>.sql` where NNN is the next sequential migration number (check existing files in `supabase/migrations/`).

The migration must be **idempotent** (safe to re-run):
- `CREATE TABLE IF NOT EXISTS public.<table>`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for any columns added to existing tables
- Use `DO $$ BEGIN ... END $$` blocks for policies to skip if already exists
- `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`

Follow the column conventions from [schema.sql](../supabase/schema.sql):
- `id uuid default gen_random_uuid() primary key`
- `created_at timestamptz not null default now()`
- Foreign keys: `references public.<table>(id) on delete cascade`
- Always `enable row level security`

### 2. Update schema.sql

Add the new table definition to [schema.sql](../supabase/schema.sql) in the appropriate section, maintaining the numbered section pattern (`-- N. Table name`). The schema file is the canonical full schema — it must include everything the migration adds.

### 3. TypeScript Types

Add the new type to [src/types/db.ts](../src/types/db.ts) following existing patterns:
- Export a named type matching the table name (PascalCase)
- Use `string` for uuid/text, `number` for numeric, `number | null` for nullable numerics, `string | null` for nullable text, `boolean` for boolean columns
- Date columns are `string` (ISO format from Supabase)

### 4. RLS Policies

Every table needs at minimum:
- **SELECT**: `for select using (true)` if publicly viewable, or `using (auth.uid() = user_id)` if private
- **INSERT**: `with check (auth.uid() = <owner_column>)` — always require auth
- **UPDATE**: `using (auth.uid() = <owner_column>)` — owners only
- **DELETE**: `using (auth.uid() = <owner_column>)` — owners only

Wrap each policy in the idempotent DO block:
```sql
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Policy name' and tablename = '<table>') then
    create policy "Policy name" on public.<table> for select using (true);
  end if;
end $$;
```

### 5. Summary

After generating all files, list:
- The migration file created
- Types added/updated
- Policies created
- Any manual steps (e.g., "Run migration in Supabase SQL Editor")
