# Citizens Connect — CLAUDE.md
> **Connecting the Kingdom** · Map-first community discovery for the Christian community.
> Stack: Next.js 15 App Router · TypeScript · Supabase · MapLibre GL JS · Tailwind v4 · Capacitor.
> Slogan source: Ephesians 2:19–22. Supabase project: `xyiajtrvhlxaeplsiajj`.

## Non-Negotiable Direction
`.github/MASTER_DIRECTION.md` is the locked product + engineering vision. All features and fixes must align with it.
Do not add speculative features. Do not refactor without a clear quality win.

## Project State
- Read `RESUME_HERE.md` first — single source of truth for where we are.
- Technical decisions: `.github/DECISIONS.md`
- Phase tracker: `.github/PROJECT_STATUS.md`

## Segments (use subdirectory CLAUDE.md for domain work)
- **Map/Spatial**: `src/components/map/CLAUDE.md` — MapLibre, clustering, markers
- **Database**: `supabase/CLAUDE.md` — schema, migrations, RLS, edge functions
- **API Routes**: `src/app/api/CLAUDE.md` — Next.js App Router routes, auth, rate limiting
- **Frontend**: `src/CLAUDE.md` — components, Tailwind v4, UI system, app structure

## Agents (call these for specialised tasks)
- `architect` — Grade every batch A/B/C, apply all Should-fix before push
- `security` — OWASP Top 10, RLS correctness, input validation, CSP
- `map-specialist` — MapLibre GL JS patterns, clustering, markers, geolocation
- `database-specialist` — Supabase schema, RLS policies, migrations, edge functions
- `mobile-specialist` — Capacitor, iOS/Android, native plugins

## Quality Gate (non-negotiable before every push)
1. `npx tsc --noEmit` — 0 errors
2. `npx vitest run` — full suite passes (baseline: 703 tests)
3. `npx next lint --dir src` — clean
4. Architect agent review — all Should-fix applied
5. Security review inline — no new OWASP findings
6. `mcp_supabase_get_advisors type:"security"` — no new warnings vs baseline (84 WARN)

## Key Conventions
- Windows PATH: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` before every terminal command
- No `&&` in PowerShell — use `;`
- Never speculate on features; ask one concise question if blocked
- Push after each batch; refresh `RESUME_HERE.md` in the same push window
- `.single()` reserved for inserts/RPCs only — use `.maybeSingle()` for reads

## Build Commands
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm run dev       # Dev server
npm run build     # Production build
npx tsc --noEmit  # Type check
npx vitest run    # Full test suite
npx next lint --dir src  # Lint
```

## Roles
`citizen` / `contributor` (with `contributor_kind`: ministry | organization | business) / `admin`

## Default map centre
Pretoria, South Africa `[-25.7479, 28.2293]` (lng, lat — MapLibre order)
