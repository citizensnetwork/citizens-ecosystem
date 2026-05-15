# `@citizens/database`

**Responsibility:** The single source of truth for the database schema, generated TypeScript types, and runtime Zod validators.

**Exports (planned):**
- `Database` — full Supabase generated type from `supabase gen types typescript`.
- Re-exports of every table row type: `Profile`, `Event`, `Place`, `Rsvp`, `ContentLabel`, etc.
- `EventCategory`, `ContributorKind`, `UserRole` — string union types matching the live CHECK constraints.
- Zod schemas for runtime validation on API boundaries.

**Out of scope:** Supabase client instantiation (that lives in `@citizens/auth`). No queries.

**Bootstrap order:** First package to extract. `src/types/db.ts` is the seed; it should be re-generated from the live DB during the extraction step so the move comes with up-to-date types.
