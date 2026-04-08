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
- **Status:** Accepted (2026-04-08)
