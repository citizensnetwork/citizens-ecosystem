# Citizens Connect — Frontend Segment
> Next.js 15 App Router · TypeScript · Tailwind CSS v4 · React Server Components

## Identity
This segment owns pages, components, hooks, and lib utilities.
Do not modify `supabase/` from this context — raise DB changes as a separate migration task.

## Architecture Rules
- Pages in `src/app/` are async Server Components — fetch data, pass to client components
- Client interactivity: `"use client"` components in `src/components/`
- Supabase server: `await createClient()` from `src/lib/supabase/server.ts`
- Supabase client: `createClient()` from `src/lib/supabase/client.ts`
- Dynamic routes: always `await params` before destructuring (Next.js 15)
- Map components: `dynamic(() => import(...), { ssr: false })` — MapLibre needs window

## Design System (60/30/10)
See `.claude/skills/ui-system/SKILL.md` for full patterns.
Gold `#D4AF37` · Black `#111111` · White `#FAFAF7`

## Testing
- Co-locate tests in `src/__tests__/` mirroring `src/` structure
- Every new API route: min 3 test cases (401, happy path, error)
- Baseline: 703 tests, 0 failures

## Skill to load: `ui-system`, `api-route`
