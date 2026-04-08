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
