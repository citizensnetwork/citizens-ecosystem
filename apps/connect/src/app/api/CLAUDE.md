# Citizens Connect — API Routes Segment
> Next.js 15 App Router · Auth-gated Routes · Rate Limiting · Input Validation

## Identity
Owns all `src/app/api/` routes. Every route must pass the security checklist.
Do not modify the Supabase schema from here — raise DB changes as a migration task.

## Route Standards
- Auth-gated: `createClient()` → `getUser()` before proceeding
- RLS-scoped client (caller's session) — never service role in user-facing routes
- Service role (`createAdminClient()`) only in admin-verified routes
- Rate limiting: apply `RATE_LIMITS.*` from `src/lib/rate-limit.ts`

## Input Validation Checklist (every route)
- [ ] UUID inputs: `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i`
- [ ] Text inputs: trimmed + length-capped
- [ ] Enum inputs: explicit allow-list
- [ ] Coordinate inputs: lat ±90, lng ±180
- [ ] No raw request body passed to Supabase

## Skill to load: `api-route`, `rls-patterns`
