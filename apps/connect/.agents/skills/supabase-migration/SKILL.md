---
name: supabase-migration
description: >
  How to write, name, and apply Supabase migrations for Citizens Connect.
  Auto-loads when working on database schema changes, new tables, or RLS policies.
---

# Supabase Migration Skill — Citizens Connect

## Naming
`NNN_snake_case_description.sql` — check `supabase/migrations/` for the highest number first.
Current latest: 092.

## Template
```sql
-- Migration NNN: [description]
-- Depends on: [prior migration if relevant]

CREATE TABLE IF NOT EXISTS public.my_table (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS my_table_profile_id_idx ON public.my_table(profile_id);

ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'my_table' AND policyname = 'Owner insert my_table') THEN
    CREATE POLICY "Owner insert my_table" ON public.my_table FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
END $$;

-- ROLLBACK: DROP TABLE IF EXISTS public.my_table;
```

## Applying (MCP not always available — fallback is Supabase SQL editor)
```
mcp_supabase_apply_migration name:"NNN_description"
-- then verify:
mcp_supabase_get_advisors type:"security"   -- baseline must not worsen (84 WARN)
```

## Common Pitfalls
- Forgetting `IF NOT EXISTS` on policies → fails on re-run
- Using `FOR ALL` → always split into 4 explicit policies
- Omitting `ON DELETE` on FK → defaults to RESTRICT (usually wrong)
- Coordinate columns without CHECK → add `CHECK (col BETWEEN -90 AND 90)`
- SECURITY DEFINER functions: must `REVOKE ALL FROM anon, authenticated` + `SET search_path = pg_catalog, public`
