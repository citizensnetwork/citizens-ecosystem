# Citizens Vision — Architectural Decisions

## DECISION-001: Separate Supabase Project (Same Org)
- **Context:** Citizens Vision needs its own database but shares users with Citizens Connect
- **Decision:** Separate Supabase project within same organisation, linked by email/auth
- **Rationale:** Schema isolation prevents coupling; shared org enables future auth federation
- **Status:** Accepted (2026-04-08)

## DECISION-002: Dashboard-Centric Architecture (Not Map-Only)
- **Context:** CV could be built as primarily a map application or a broader analytics platform
- **Decision:** Dashboard-first with map as one of three visualization surfaces (map, dashboard, timeline)
- **Rationale:** Alignment metrics, trend analysis, and advisory outputs require richer surfaces than maps alone
- **Status:** Accepted (2026-04-08)

## DECISION-003: Pull-Sync from Citizens Connect
- **Context:** CV needs CC data (events, places, profiles) for cross-platform intelligence
- **Decision:** Edge Function pull-sync every 15 minutes into mirror tables; no CC code changes needed
- **Rationale:** Decouples CV from CC's schema; CV controls what/when it pulls; read-only access to CC
- **Status:** Accepted (2026-04-08)

## DECISION-004: Rule-Based Advisory Engine (Not ML/AI)
- **Context:** Advisory outputs could use ML models or deterministic rules
- **Decision:** Template-driven, rule-based recommendations evaluated against metric snapshots
- **Rationale:** Deterministic = auditable, explainable, reproducible. ML deferred until data volume justifies it
- **Status:** Accepted (2026-04-08)

## DECISION-005: Zustand for Client State
- **Context:** Need cross-component state for org context, filters, map viewport, timeline
- **Decision:** Zustand 5.x with separate stores per domain (orgStore, filterStore, mapStore, timelineStore)
- **Rationale:** Lightweight, TypeScript-native, no boilerplate. Middleware for persistence and devtools
- **Status:** Accepted (2026-04-08)

## DECISION-006: Phase Review Gate with Architect Agent
- **Context:** Need to maintain high code quality across 12 phases of development
- **Decision:** Mandatory architect review after each phase with A-D grading; no phase proceeds below B
- **Rationale:** Prevents technical debt accumulation; catches security/architecture issues early
- **Status:** Superseded by DECISION-007 (2026-04-08)

## DECISION-007: Full Agent Pipeline Review (All 5 Agents)
- **Context:** Phase 0 only had architect review; gaps found in test coverage and design consistency
- **Decision:** All 5 agents (architect, data, testing, product-lead, continuity) run sequentially after every phase, with cumulative scope across all completed phases
- **Rationale:** Ensures no dimension of quality is overlooked; cumulative reviews catch regressions
- **Status:** Accepted (2026-04-09)

## DECISION-008: Dark Theme — Dark-Grey + Blue + White
- **Context:** Original palette was monochrome + gold; user requested distinct identity for CV
- **Decision:** 70% dark-grey (#1a1a2e), 20% blue (#4a90d9), 10% white (#ffffff)
- **Rationale:** Dark theme reduces eye strain for data-heavy dashboards; blue conveys trust/intelligence
- **Status:** Accepted (2026-04-09)

## DECISION-009: Zod for Schema Validation
- **Context:** Phase 1 introduces complex forms (activities, departments) needing client+server validation
- **Decision:** Add Zod for typed schema validation; schemas shared between API routes and forms
- **Rationale:** Type-safe validation, shared schemas reduce duplication, first-class TypeScript support
- **Status:** Accepted (2026-04-09)

## DECISION-010: Workspace Relocation to Citizen Network
- **Context:** Project files were in `Desktop/Businesses`; needed dedicated workspace
- **Decision:** Relocate to `Documents/Citizen Network` with all Citizen ecosystem projects
- **Rationale:** Organised workspace, professional directory structure, separation from non-Citizen files
- **Status:** Accepted (2026-04-09)

## DECISION-011: Department Boundaries Layer Deferred to Phase 3
- **Context:** Phase 2 spec called for department colour-coded geo-boundaries on the map
- **Decision:** Defer department boundary layer; no `geo_boundaries` table or department polygon data exists in current schema
- **Rationale:** Cannot render what doesn't exist. Phase 3 (Metrics) or Phase 9 (Geo-Boundaries) will introduce the schema. Layer toggle UI is pre-wired for future activation
- **Status:** Accepted (2026-04-09)

## DECISION-012: ACTIVITY_TYPE_ICONS Emoji Retained
- **Context:** Product Lead flagged emoji markers as inconsistent with design language; suggested SVG icons
- **Decision:** Retain emoji for ACTIVITY_TYPE_ICONS in Phase 2; plan full SVG icon library migration in a future UI consistency pass
- **Rationale:** Emoji work cross-platform with zero bundle cost. SVG migration is a horizontal concern affecting all phases — better done as a dedicated pass than mid-phase
- **Status:** Accepted (2026-04-09)

## DECISION-013: CartoDB Dark-Matter Tiles (No API Key Required)
- **Context:** ARCHITECTURE.md specified MapTiler + OSM fallback for tile provider
- **Decision:** Use CartoDB dark-matter basemap tiles instead of MapTiler
- **Rationale:** Free with no API key requirement; dark theme natively matches the dark-grey/blue/white design palette; no usage limits for the project's scale
- **Status:** Accepted (2026-04-09)

## DECISION-014: Custom Event Bridge for Map Fly-To Communication
- **Context:** MapSearchBar and GeolocationButton need to trigger fly-to on MapView without tight coupling
- **Decision:** Use `window.dispatchEvent(new CustomEvent('map:flyto', { detail: { center, zoom } }))` pattern
- **Rationale:** Lightweight, framework-agnostic, avoids Zustand store pollution for ephemeral navigation events. MapView listens and cleans up on unmount
- **Status:** Accepted (2026-04-09)

## DECISION-015: Temporal Marker Opacity Scale
- **Context:** Activity markers need visual distinction based on recency to surface temporal patterns
- **Decision:** Three-tier opacity decay: 0–30 days = 1.0→0.8, 30–90 days = 0.8→0.55, 90–365 days = 0.55→0.35
- **Rationale:** Balances visibility (nothing disappears) with temporal signal. Matches CC pattern. Computed once per marker in GeoJSON transform, not per render frame
- **Status:** Accepted (2026-04-09)

## DECISION-016: Map Activity Hard Cap (5000 per Org)
- **Context:** Map API route returns GeoJSON for all org activities with coordinates; unbounded could cause client-side rendering issues
- **Decision:** Hard cap of 5000 activities per API response in `/api/map/activities`
- **Rationale:** MapLibre handles 5000 markers + clustering efficiently. Beyond that, server-side clustering or tiling is needed (Phase 9 scope). Cap prevents accidental browser crash
- **Status:** Accepted (2026-04-09)

## DECISION-017: Nominatim Geocoding with 400ms Debounce
- **Context:** MapSearchBar needs geocoding for place name → coordinates resolution
- **Decision:** Use OpenStreetMap Nominatim with 400ms debounce, 3-character minimum query, and proper User-Agent header
- **Rationale:** Free, no API key, adequate for search-on-type UX. Debounce + minimum length respects Nominatim's usage policy (max 1 req/sec). User-Agent required by TOS
- **Status:** Accepted (2026-04-09)

## DECISION-018: Partial Geo Index Deferred to Phase 3
- **Context:** Data Agent recommended `CREATE INDEX ON activities (latitude, longitude) WHERE latitude IS NOT NULL` for map query performance
- **Decision:** Defer geo index creation to Phase 3 migration (003_metrics.sql)
- **Rationale:** Current activity volumes don't justify the index; Phase 3 migration is the next schema change opportunity. Documented for inclusion
- **Status:** Implemented (2026-04-09) — index created in 003_metrics.sql

## DECISION-019: Recharts 2.x for Dashboard Charting
- **Context:** Phase 3 dashboard requires line charts, bar charts, and pie charts for metrics visualization
- **Decision:** Use Recharts 2.x as the charting library
- **Rationale:** React-native composable API, lightweight bundle, built-in dark theme support via prop customization, matches ARCHITECTURE.md recommendation
- **Status:** Accepted (2026-04-09)

## DECISION-020: SECURITY INVOKER for compute_org_kpis()
- **Context:** compute_org_kpis() SQL function aggregates activity data; could use DEFINER (bypass RLS) or INVOKER (respect RLS)
- **Decision:** Use SECURITY INVOKER so the function respects the caller's RLS policies
- **Rationale:** RLS-first security model — even DB functions must not bypass tenant isolation. Caught by Architect review
- **Status:** Accepted (2026-04-09)

## DECISION-021: Materialized Views as Scale-Ready Infrastructure
- **Context:** Phase 3 creates mv_org_activity_summary and mv_department_ranking but API queries could use them or query activities directly
- **Decision:** Create materialized views in migration but have API routes query activities table directly for now
- **Rationale:** At current data volumes, direct queries are fast and return live data. Materialized views add refresh lag. Infrastructure is pre-positioned for when org activity counts exceed query performance thresholds
- **Status:** Accepted (2026-04-09)

## DECISION-022: useReducer for DashboardClient Fetch Counter
- **Context:** DashboardClient needs a loading counter to track parallel API fetches; useState would trigger React compiler ESLint warnings
- **Decision:** Use useReducer for the fetch counter state
- **Rationale:** React compiler (ESLint react-compiler plugin) flags certain useState patterns in effects. useReducer with dispatch is the idiomatic workaround
- **Status:** Accepted (2026-04-09)

## DECISION-023: Extracted fetchDashboardData with AbortController
- **Context:** DashboardClient useEffect fetches overview + trends data; needs proper cleanup on unmount/re-render
- **Decision:** Extract fetchDashboardData as a standalone async function with AbortController signal passed to all fetch calls
- **Rationale:** Prevents stale fetch responses from updating state after component unmount. AbortController.abort() in effect cleanup ensures no memory leaks
- **Status:** Accepted (2026-04-09)
