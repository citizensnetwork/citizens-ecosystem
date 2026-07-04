---
name: rls-patterns
description: >
  Row Level Security patterns for Citizens Connect. Auto-loads when reviewing
  or writing Supabase RLS policies, API routes, or any auth-gated data access.
---

# RLS Patterns Skill — Citizens Connect

## Core Rules
1. Every table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
2. No `FOR ALL` — explicit INSERT / UPDATE / DELETE / SELECT
3. Public content: SELECT USING `true` or published-status check
4. User-owned: compare `auth.uid()` with owner column
5. Admin: `is_admin()` DB function only — never role checks in app code
6. Idempotent: wrap every `CREATE POLICY` in `DO $$ IF NOT EXISTS ... END $$`

## Standard Patterns

### Public read + owner write
```sql
CREATE POLICY "Public read" ON public.tbl FOR SELECT USING (true);
CREATE POLICY "Owner insert" ON public.tbl FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner update" ON public.tbl FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner or admin delete" ON public.tbl FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());
```

### Admin-only table
```sql
CREATE POLICY "Admin only" ON public.tbl USING (public.is_admin()) WITH CHECK (public.is_admin());
```

## API Route Auth Pattern
```typescript
const supabase = await createClient();  // RLS-scoped to caller's session
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

## Read Safety Rule
- `.single()` → inserts/RPCs only (throws PGRST116 on missing row)
- `.maybeSingle()` → all SELECT reads (returns null cleanly)
