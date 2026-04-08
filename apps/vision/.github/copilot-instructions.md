# Citizens Vision — Copilot Instructions

## Project Overview
Citizens Vision is a multi-tenant hierarchical data intelligence platform. It ingests organisational data (events, projects, goals, departments, users) and computes alignment metrics, trend analysis, and impact scoring. It exposes map, timeline, and dashboard visualization surfaces with role-based access control.

## Tech Stack
- **Framework:** Next.js 15 (App Router), React 18, TypeScript 5 (strict)
- **Database:** Supabase (PostgreSQL 17, Auth PKCE, Realtime, Edge Functions)
- **Maps:** MapLibre GL JS 5.x
- **Charts:** Recharts 2.x
- **State:** Zustand 5.x
- **Styling:** Tailwind CSS 4 (no config file, `@import` in globals.css)
- **Testing:** Vitest + Testing Library + Playwright (E2E)
- **Deployment:** Vercel + Supabase Cloud
- **Node:** 22.x | **Package Manager:** npm

## Architecture Rules

### File Organisation
- `src/app/` — Next.js App Router pages (async Server Components by default)
- `src/app/[orgSlug]/` — All tenant-scoped routes live here
- `src/app/api/` — API routes (auth-gated, org-scoped)
- `src/components/` — `"use client"` interactive components, grouped by domain
- `src/hooks/` — Custom React hooks
- `src/lib/` — Pure utilities, no React dependencies (except lib/supabase/)
- `src/stores/` — Zustand stores
- `src/types/` — TypeScript type definitions
- `supabase/` — Schema, migrations, edge functions, config

### Code Standards
1. **TypeScript strict mode** — No `any`, no `@ts-ignore`, no implicit returns
2. **Server Components first** — Only add `"use client"` when interactivity is needed
3. **RLS-first security** — Every table has RLS policies. Never bypass with service role in client code
4. **Idempotent migrations** — Use `IF NOT EXISTS`, `DO $$ BEGIN ... END $$`, `CREATE OR REPLACE`
5. **Validation at boundaries** — Validate inputs in API routes and form submissions. No deep defensive coding
6. **No over-engineering** — No abstractions for one-time operations. No premature optimisation
7. **Cursor-based pagination** — Never use OFFSET pagination for user-facing lists

### Naming Conventions
- **Files:** kebab-case for non-component files, PascalCase for components
- **Database:** snake_case for tables, columns, functions
- **TypeScript:** PascalCase for types/interfaces, camelCase for variables/functions
- **API routes:** RESTful (GET/POST/PATCH/DELETE), return `NextResponse.json()`
- **Zustand stores:** `use[Name]Store` pattern

### Supabase Patterns
- **Server client:** `await createClient()` from `src/lib/supabase/server.ts` (async, uses cookies)
- **Browser client:** `createClient()` from `src/lib/supabase/client.ts` (sync, singleton)
- **Auth check in API routes:** `const { data: { user } } = await supabase.auth.getUser()`
- **RLS helper functions:** `is_org_member(org_id)`, `is_org_admin(org_id)`, `get_user_org_role(org_id)`
- **UUID validation:** Always validate UUIDs before database queries

### Multi-Tenant Rules
- Every data query MUST be scoped to the active organisation
- Org context comes from `[orgSlug]` route parameter, validated against `user_org_roles`
- Never expose data from one org to users of another org
- Platform admins are the only exception (explicit check required)

### Testing Requirements
- Every API route has corresponding test file
- Every RLS policy has test assertions (service role vs anon vs member)
- Components tested for rendering and key interactions
- Minimum 80% coverage target per phase

## Phase Review Gate
After completing each phase, the Architect Agent MUST review all code. See `.github/agents/architect.agent.md` for the full review protocol. No phase is considered complete until the architect review passes with grade A or B.

## Git Workflow
After each phase completion (post-review):
1. Update `.github/PROJECT_STATUS.md` with phase status
2. Update all agent/instruction files if patterns changed
3. Compress session context into `.github/DECISIONS.md`
4. Stage all changes: `git add -A`
5. Commit: `git commit -m "Phase X: [description]"`
6. Push: `git push origin main`
