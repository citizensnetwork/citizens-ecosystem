# Citizens Connect — Database Segment
> Supabase · PostgreSQL · RLS · Edge Functions · Storage

## Identity
This segment owns all persistent data. Do not touch `src/` from this context —
raise UI changes as a separate task.

## Project Context
- Project ID: `xyiajtrvhlxaeplsiajj`
- Schema source of truth: `supabase/schema.sql` (idempotent)
- Migrations: `supabase/migrations/` — sequential, named `NNN_description.sql`, latest: 092
- Edge Functions: `supabase/functions/` — Deno runtime, shared at `_shared/`

## Skill to load: `supabase-migration`, `rls-patterns`
See `.claude/skills/supabase-migration/SKILL.md` and `.claude/skills/rls-patterns/SKILL.md`
for full migration templates, RLS patterns, and the advisor baseline.
