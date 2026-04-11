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

## DECISION-024: Jaccard Keyword Overlap for Goal-Activity Alignment
- **Context:** Phase 4 needs to score how well activities align with goals; could use ML embeddings, TF-IDF, or simpler text matching
- **Decision:** Use Jaccard similarity coefficient on tokenised goal/activity titles+descriptions with stop-word removal
- **Rationale:** Deterministic, explainable, zero extra dependencies. Confidence capped at 0.95 to acknowledge imperfection. Threshold (0.1) and maxResults (5) configurable. ML can replace later if needed
- **Status:** Accepted (2026-04-10)

## DECISION-025: Temporal Decay in SQL Alignment Scoring
- **Context:** compute_alignment_score() needs to weight recent activity links higher than stale ones
- **Decision:** Four-tier temporal decay in SQL: 0–30d = 1.0, 31–90d = 0.7, 91–365d = 0.4, 365d+ = 0.2
- **Rationale:** SQL-level computation avoids client roundtrips. Four tiers balance recency signal with historical context. Tiers align with Phase 2 temporal opacity decision (DECISION-015)
- **Status:** Accepted (2026-04-10)

## DECISION-026: Corrective Migration Pattern (005_goals_security_fixes.sql)
- **Context:** Security review found RLS gaps after Phase 4 core migration (004); needed to patch without altering 004
- **Decision:** Create separate corrective migration (005) that drops/recreates affected policies and functions
- **Rationale:** Keeps 004 as historical record; 005 is additive and idempotent. Avoids editing applied migrations. Pattern reusable for future security hardening
- **Status:** Accepted (2026-04-10)

## DECISION-027: Generic Error Responses on All API Routes
- **Context:** SE Security review found raw Supabase error.message being returned to clients (information leakage)
- **Decision:** All API routes return generic "Internal server error" for 500s; original error logged via console.error with route context prefix
- **Rationale:** Prevents database schema/constraint names from leaking to clients. Server logs retain full detail for debugging
- **Status:** Accepted (2026-04-10)

## DECISION-028: Platform Admin RLS Override
- **Context:** Phase 4 RLS policies only checked org membership; platform admins were locked out
- **Decision:** All Phase 4 RLS policies include `OR is_platform_admin()` clause
- **Rationale:** Platform admins need cross-org visibility for support and auditing. is_platform_admin() is a SECURITY DEFINER function checking user metadata
- **Status:** Accepted (2026-04-10)

## DECISION-029: Org ID Immutability via Trigger
- **Context:** UPDATE RLS policies couldn't prevent org_id column mutation (WITH CHECK insufficient for column-level control)
- **Decision:** Database trigger `prevent_org_id_change()` raises exception if org_id changes on vision_statements or goals
- **Rationale:** Defense-in-depth — even if RLS is bypassed via service role, org_id cannot be mutated. Trigger-level enforcement is authoritative
- **Status:** Accepted (2026-04-10)

## DECISION-030: Materialized View as Scale-Ready Infrastructure (Phase 4)
- **Context:** mv_goal_alignment_matrix created in 004 but API routes query tables directly
- **Decision:** Retain materialized view as infrastructure; API routes use direct queries for now
- **Rationale:** Consistent with DECISION-021 (Phase 3). Direct queries return live data with no refresh lag. Materialized view activates when goal/activity counts exceed query performance thresholds
- **Status:** Accepted (2026-04-10)

## DECISION-031: Forward-Only Status Transitions for Non-Admins
- **Context:** Projects have a lifecycle (planning→active→completed→archived); need to prevent non-admin users from moving projects backwards
- **Decision:** Non-admin users restricted to forward-only transitions via `PROJECT_STATUS_TRANSITIONS` map enforced at API layer; admins can transition freely in any direction
- **Rationale:** Prevents accidental status regression by regular members while giving admins full control for corrections. Enforced at API route level (PATCH /api/projects/[id]) rather than database to keep transition logic visible and testable
- **Status:** Accepted (2026-04-10)

## DECISION-032: Migration Numbering Deviation (006 instead of 005)
- **Context:** ARCHITECTURE.md specified `005_projects.sql` for Phase 5, but 005 was consumed by `005_goals_security_fixes.sql` (Phase 4 corrective migration, DECISION-026)
- **Decision:** Projects migration uses `006_projects.sql` instead of the originally planned 005
- **Rationale:** Migrations are sequential and immutable once applied. 005 was correctly used for security hardening. Numbering deviation documented for traceability
- **Status:** Accepted (2026-04-10)

## DECISION-033: Timeline Activity Cap (500)
- **Context:** Timeline renders individual activity dots per item (not clustered like map). Unbounded queries could return thousands of items, overwhelming non-virtualized DOM rendering
- **Decision:** API hard cap of 500 activities with `truncated: boolean` response flag, vs map's 5000 (DECISION-016). UI can inform users to narrow date range when truncated
- **Rationale:** 500 items is the practical limit for non-virtualized timeline rendering. Virtualized rendering (e.g. tanstack-virtual) needed before raising cap
- **Status:** Accepted (2026-04-10)

## DECISION-034: Timeline-Map Sync Deferred
- **Context:** ARCHITECTURE.md specified bidirectional timeline↔map sync (date range filters map, map click highlights timeline, playback animates both)
- **Decision:** Deferred. `timelineStore` and `mapStore` remain independent. Cross-store subscription planned for future iteration
- **Rationale:** Phase 6 delivers the timeline as a standalone visualization surface. Sync requires cross-store wiring (Zustand subscribe()) which adds coupling. Better to validate timeline UX first, then integrate
- **Status:** Deferred (2026-04-10)

## DECISION-035: No Schema Changes for Phase 6
- **Context:** Timeline Engine queries existing tables (activities, milestones, project_activities, goal_activity_links, departments, projects)
- **Decision:** No new migration required. Phase 6 is a read-only consumer of existing schema
- **Rationale:** All data needed for timeline visualization already exists in Phases 1-5 tables. Adding a timeline-specific table would be premature abstraction
- **Status:** Accepted (2026-04-10)

## DECISION-036: Activity Type Swim Lane Grouping
- **Context:** ARCHITECTURE.md specified department/project/goal swim lane groupings. Implementation opportunity to add a fourth grouping
- **Decision:** Added "type" (activity type) as a fourth swim lane grouping option
- **Rationale:** Activity type grouping enables cross-department pattern analysis (e.g., seeing all meetings across departments on one timeline). Low implementation cost with high analytical value
- **Status:** Accepted (2026-04-10)

## DECISION-037: Edge Functions for Cross-Project Sync and Advisory Generation
- **Context:** CV needs to pull data from Citizens Connect and generate advisories — both require service-role access and are trigger/cron candidates
- **Decision:** Implement as Supabase Deno Edge Functions (`sync-from-connect`, `generate-advisory`) with service-role key from runtime env
- **Rationale:** Edge Functions run server-side with access to env vars (service role key), can be invoked by cron or API, and keep heavy logic out of Next.js API routes. Deno runtime matches Supabase platform
- **Status:** Accepted (2026-04-11)

## DECISION-038: CC Mirror Table Pattern (Upsert on CC IDs)
- **Context:** CV mirrors CC events and places for cross-platform intelligence; need idempotent sync
- **Decision:** Mirror tables (`cc_events`, `cc_places`) use `cc_event_id`/`cc_place_id` unique columns with upsert-on-conflict semantics
- **Rationale:** Idempotent: re-running sync produces same result. CC IDs as natural keys avoid duplication. Mirror tables decoupled from CC schema — CV controls column selection
- **Status:** Accepted (2026-04-11)

## DECISION-039: Advisory Engine Dual Path (API Route + Edge Function)
- **Context:** Advisory generation needs to be triggered both on-demand (user clicks "Generate") and scheduled (cron)
- **Decision:** Advisory generation logic lives in `src/lib/advisory/engine.ts` (shared); `/api/advisory/generate` route calls it for on-demand; `generate-advisory` Edge Function calls equivalent SQL for scheduled runs
- **Rationale:** Shared engine ensures consistent scoring. API route enables immediate UX feedback. Edge Function enables cron-based background generation without client involvement
- **Status:** Accepted (2026-04-11)

## DECISION-040: Severity Colours as Tailwind Background Classes
- **Context:** Advisory cards need visual severity indicators (critical/high/medium/low/info)
- **Decision:** Map severity levels to Tailwind bg-classes: critical=red-900, high=red-700, medium=yellow-700, low=blue-700, info=gray-700
- **Rationale:** Consistent with existing pattern (GOAL_STATUS_COLOURS, PROJECT_STATUS_COLOURS). Dark theme compatible. No custom CSS needed
- **Status:** Accepted (2026-04-11)

## DECISION-041: Text Labels Over Emoji for Domain Badges
- **Context:** Connect components initially used emoji for source badges ("🔗 CC"); product review flagged inconsistency with design language
- **Decision:** Replace emoji badges with styled text labels (e.g., "CC" badge with bg-blue-600 styling)
- **Rationale:** Consistent with DECISION-012 (emoji retained for activity type icons only). Text labels render identically cross-platform and match the professional dashboard aesthetic
- **Status:** Accepted (2026-04-11)

## DECISION-042: Places Claim Flow as Separate API Route
- **Context:** CC places mirror into CV read-only; orgs need to "claim" a place to assign it to a department
- **Decision:** Dedicated PATCH endpoint on `/api/connect/places/[id]` for claim/promote with department assignment
- **Rationale:** Separates read (sync) from write (claim) concerns. Claim requires admin/member auth and org scoping. Department assignment during claim ensures places enter the org hierarchy immediately
- **Status:** Accepted (2026-04-11)

## DECISION-043: Notification Bell for Critical Advisories
- **Context:** Critical advisories need immediate attention; users may not visit the advisory page regularly
- **Decision:** Add notification bell indicator to Navbar that shows count of critical/high unacknowledged advisories
- **Rationale:** Passive notification without push infrastructure. Consistent with dashboard patterns. Bell icon with count badge is a recognized UX pattern. Scoped to critical+high to avoid notification fatigue
- **Status:** Accepted (2026-04-11)

## DECISION-044: tsconfig Excludes Supabase Functions Directory
- **Context:** Supabase Edge Functions use Deno runtime with different TypeScript config; Next.js tsc was reporting errors on Deno-specific imports
- **Decision:** Add `"supabase/functions"` to tsconfig.json `exclude` array
- **Rationale:** Edge Functions have their own Deno-compatible TypeScript context. Excluding from Next.js tsconfig prevents false compile errors while keeping Edge Function code in the same repo
- **Status:** Accepted (2026-04-11)
