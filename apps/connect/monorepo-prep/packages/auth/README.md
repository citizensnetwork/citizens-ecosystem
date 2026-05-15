# `@citizens/auth`

**Responsibility:** Supabase Auth wrappers shared across every Citizens app.

**Exports (planned):**
- `createServerClient(cookies)` — async cookie-bound SSR client. Wraps `@supabase/ssr`'s `createServerClient` with the project URL/anon-key already injected.
- `createBrowserClient()` — singleton client for browser components.
- `requireUser()`, `requireRole(...)` — route helpers that 401/403 on missing session or insufficient role.
- `requireAdmin()` — convenience for `/admin` routes.

**Out of scope:** App-specific routing (no `redirect()` to a specific path baked in — caller decides). No Connect/Wear-specific business logic.

**Bootstrap order:** Second package to extract (after `@citizens/database`). The current `src/lib/supabase/{server,client}.ts` and `src/lib/adminGuard.ts` are the seeds.
