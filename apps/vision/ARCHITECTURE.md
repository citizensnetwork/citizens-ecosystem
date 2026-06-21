# Citizens Vision — System Architecture & Phased Roadmap

> Multi-tenant hierarchical data intelligence platform for organisational alignment, geospatial-temporal analytics, and advisory insight generation.

---

## Table of Contents

1. [Architectural Decision: Not Just a Map App](#1-architectural-decision-not-just-a-map-app)
2. [Infrastructure & Tooling](#2-infrastructure--tooling)
3. [System Architecture & Layering](#3-system-architecture--layering)
4. [Core Functional Systems](#4-core-functional-systems)
5. [Advisory Engines](#5-advisory-engines)
6. [Timeline Engine](#6-timeline-engine)
7. [Citizens Connect Integration](#7-citizens-connect-integration)
8. [File Structure](#8-file-structure)
9. [Phased Roadmap](#9-phased-roadmap)

---

## 1. Architectural Decision: Not Just a Map App

Citizens Vision is **not** a map application. It is a **data intelligence platform** that *uses* maps as one of several visualization surfaces. The map is a critical output layer but represents only one dimension of the system's capability.

**Why a dashboard-centric architecture with modular visualization:**

| Factor | Map-only approach | Dashboard + multi-surface approach |
|--------|------------------|-----------------------------------|
| Alignment metrics | Cannot represent | First-class metric cards & charts |
| Trend analysis | Limited to spatial hotspots | Time-series, comparison, regression |
| Impact scoring | Pin density only | Computed scores with drill-down |
| Advisory outputs | No surface for guidance | Dedicated panels, notifications |
| Timeline navigation | Awkward overlay | Dedicated timeline control + playback |
| Role-based views | Uniform map | Configurable dashboards per role |
| Multi-tenant hierarchy | Flat pins | Org trees, department rollups, scoping |

**Architecture type: Full-stack analytics platform** with three primary visualization surfaces:
1. **Map Canvas** — geospatial-temporal event and entity plotting
2. **Dashboard Panels** — metrics, KPIs, alignment scores, trend charts
3. **Timeline View** — chronological activity stream with playback and filtering

---

## 2. Infrastructure & Tooling

### 2.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 15 (App Router), React 18, TypeScript 5 | Matches Citizens Connect; shared knowledge, patterns, and potential component reuse |
| **Database** | Supabase (PostgreSQL 17) — **separate project, same org** | RLS-first security, Realtime subscriptions, Edge Functions. Separate project ensures schema isolation while enabling cross-project access via service roles |
| **Map Engine** | MapLibre GL JS 5.x | Matches CC; open-source, no key required with OSM; vector tile support for dense data layers |
| **Charts** | Recharts 2.x (or Tremor for dashboard primitives) | React-native charting, composable, supports time-series + bar + radar |
| **Timeline** | Custom component (Canvas/SVG) + vis-timeline as fallback | No off-the-shelf solution handles geospatial-temporal playback well |
| **State Management** | Zustand 5.x | Lightweight, TypeScript-native, supports middleware for persistence and devtools |
| **Data Processing** | Supabase Edge Functions (Deno) + PostgreSQL materialized views + pg_cron | Batch: materialized view refresh via cron; Real-time: Edge Functions on DB webhooks |
| **Styling** | Tailwind CSS 4 | Matches CC; utility-first, no config file needed |
| **Testing** | Vitest + Testing Library + Playwright (E2E) | Matches CC unit testing; adds E2E from the start |
| **Auth** | Supabase Auth (PKCE) — **shared auth provider** | Same user identity across CC and CV; SSO-like experience |
| **Deployment** | Vercel (frontend) + Supabase (backend) | Matches CC deployment model |
| **Mobile** | Capacitor 8.x (Phase 2+) | Deferred; web-first for analytics platform |
| **Package Manager** | npm | Matches CC |
| **Node.js** | 22.x | Matches CC; LTS stability |

### 2.2 Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel Edge Network                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Citizens Vision (Next.js 15)                 │   │
│  │  SSR Dashboard  │  API Routes  │  Static Assets           │   │
│  └──────────┬────────────┬────────────────────────────────┘   │
└─────────────┼────────────┼──────────────────────────────────────┘
              │            │
    ┌─────────▼────────────▼──────────────┐
    │   Supabase Project: citizens-vision  │
    │  ┌─────────────────────────────────┐ │
    │  │   PostgreSQL 17 (RLS-enabled)   │ │
    │  │   • Core schema (orgs, goals…) │ │
    │  │   • Materialized views (metrics)│ │
    │  │   • pg_cron (batch jobs)        │ │
    │  ├─────────────────────────────────┤ │
    │  │   Supabase Auth (shared users)  │ │
    │  ├─────────────────────────────────┤ │
    │  │   Edge Functions (Deno)         │ │
    │  │   • Sync pipeline               │ │
    │  │   • Metric computation           │ │
    │  │   • Advisory generation          │ │
    │  ├─────────────────────────────────┤ │
    │  │   Realtime (postgres_changes)   │ │
    │  └─────────────────────────────────┘ │
    └──────────────┬──────────────────────┘
                   │
        ┌──────────▼──────────────┐
        │  Supabase: citizens-connect │
        │  (read-only service role)   │
        │  Events, Places, Profiles   │
        │  Reviews, RSVPs, Follows    │
        └─────────────────────────────┘
```

---

## 3. System Architecture & Layering

### 3.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                     │
│                                                          │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Map View │  │ Dashboard    │  │ Timeline View     │   │
│  │ (MapLibre│  │ (Recharts +  │  │ (Custom canvas +  │   │
│  │  GL JS)  │  │  Metric Cards│  │  playback control)│   │
│  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘   │
│       │               │                    │              │
│  ┌────▼───────────────▼────────────────────▼──────────┐  │
│  │              Zustand Store (Client State)           │  │
│  │  • Active org/tenant context                        │  │
│  │  • Filter state (date range, entity type, dept)     │  │
│  │  • Map viewport                                     │  │
│  │  • Selected entity / drill-down path                │  │
│  └────────────────────┬───────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│                    PROCESSING LAYER                       │
│                                                          │
│  ┌──────────────────┐  ┌─────────────────────────────┐   │
│  │ API Routes        │  │ Edge Functions (Deno)        │   │
│  │ /api/metrics/*    │  │ • compute-alignment          │   │
│  │ /api/orgs/*       │  │ • sync-from-connect          │   │
│  │ /api/entities/*   │  │ • generate-advisory          │   │
│  │ /api/timeline/*   │  │ • refresh-materialized-views │   │
│  │ /api/advisory/*   │  │ • aggregate-impact-scores    │   │
│  │ /api/sync/*       │  └─────────────────────────────┘   │
│  └──────────────────┘                                    │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Computation Engines (PostgreSQL)                   │   │
│  │ • Materialized views for metric rollups            │   │
│  │ • SQL functions for alignment scoring              │   │
│  │ • Trigger-based incremental aggregation            │   │
│  │ • pg_cron scheduled batch processing               │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│                   DATA / STORAGE LAYER                    │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Primary Schema (citizens_vision)                   │   │
│  │                                                    │   │
│  │  ENTITY TABLES          METRIC TABLES              │   │
│  │  • organisations        • alignment_scores          │   │
│  │  • departments          • impact_scores             │   │
│  │  • goals                • trend_snapshots           │   │
│  │  • projects             • metric_rollups            │   │
│  │  • activities           • advisory_outputs          │   │
│  │  • milestones                                       │   │
│  │                         REFERENCE TABLES            │   │
│  │  RELATIONSHIP TABLES    • categories                │   │
│  │  • goal_alignments      • metric_definitions        │   │
│  │  • project_goals        • scoring_rubrics           │   │
│  │  • activity_projects    • advisory_templates         │   │
│  │  • entity_tags                                      │   │
│  │                         SYNC TABLES                 │   │
│  │  GEO-TEMPORAL TABLES    • cc_sync_log               │   │
│  │  • locations            • cc_events_mirror          │   │
│  │  • time_entries         • cc_places_mirror          │   │
│  │  • geo_boundaries       • cc_profiles_mirror         │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Materialized Views (auto-refreshed)                │   │
│  │ • mv_org_activity_summary                          │   │
│  │ • mv_goal_alignment_matrix                         │   │
│  │ • mv_department_impact_ranking                     │   │
│  │ • mv_temporal_activity_heatmap                     │   │
│  │ • mv_geo_activity_clusters                         │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Hierarchy Model

The system operates on a strict organisational hierarchy that scopes all data access and metric computation:

```
Organisation (Tenant Root)
├── Vision Statement(s)
│   └── Goals (measurable objectives)
│       └── Alignment Links → Activities, Projects
├── Departments
│   ├── Members (Users with roles)
│   ├── Projects
│   │   ├── Milestones
│   │   ├── Activities (from CV or synced from CC)
│   │   └── Goal Alignments
│   └── Sub-departments (recursive)
├── Locations (geo-boundaries + point locations)
└── Settings & Access Control
    ├── Role Definitions
    ├── Data Sharing Policies (what's exposed to other orgs)
    └── CC Sync Configuration
```

### 3.3 Role-Based Access Control (RBAC)

| Role | Scope | Permissions |
|------|-------|-------------|
| `platform_admin` | Global | Full CRUD all orgs; system configuration; advisory template management |
| `org_admin` | Organisation | Full CRUD within org; member management; goal/vision editing; sync config |
| `org_manager` | Department(s) | CRUD within assigned departments; project management; view org-level metrics |
| `org_member` | Self + assigned | Create activities; view assigned projects; view own metrics; read dashboards |
| `org_viewer` | Read-only | View dashboards and metrics only; no data creation |
| `cc_service` | Sync scope | Service role for Citizens Connect integration; read/write to mirror tables only |

Implemented via PostgreSQL RLS policies with `auth.jwt() ->> 'cv_role'` and `auth.jwt() ->> 'cv_org_id'` claims, plus a `user_org_roles` junction table for multi-org membership.

---

## 4. Core Functional Systems

### 4.1 Entity & Activity Tracking

The foundational data system that captures everything that happens within an organisation.

**Core entities:**
- **Activities** — Atomic units of work: events hosted, meetings held, outreach conducted, workshops delivered. Each has: type, timestamp, duration, location (lat/lng), participants, tags, description, and links to projects/goals.
- **Projects** — Collections of activities pursuing a defined outcome. Have: timeline (start/end), milestones, assigned department, budget (optional), status lifecycle.
- **Goals** — Measurable objectives derived from vision statements. Have: target metrics, deadline, progress computation, alignment scoring.
- **Milestones** — Checkpoints within projects. Have: target date, completion status, blocking dependencies.

**Activity ingestion sources:**
1. **Manual entry** — CV web UI forms
2. **Citizens Connect sync** — Events, RSVPs, places claimed by org members (automatic)
3. **Bulk import** — CSV/JSON upload for historical data
4. **API** — External systems push activities via authenticated endpoints

### 4.2 Map Visualization System

Builds on the same MapLibre GL JS stack as CC but adds intelligence layers.

**Map layers (toggleable):**
1. **Activity heatmap** — Density of organisational activity by area (time-filtered)
2. **Entity markers** — Events, places, projects with org-coloured pins
3. **Goal alignment overlay** — Colour-coded regions by alignment score (green → red)
4. **Geo-boundaries** — Org-defined service areas, wards, districts (GeoJSON polygons)
5. **Temporal playback** — Animate activity markers across a time range
6. **CC data layer** — Synced events/places from Citizens Connect (distinct styling)
7. **Cluster aggregation** — Automatic clustering at zoom levels with metric summaries

**Map-specific features:**
- Side-by-side comparison mode (two time periods)
- "Coverage gap" analysis — areas within geo-boundaries with low activity
- Export map view as image / PDF report

### 4.3 Metrics & Insight Dashboards

**Metric categories:**

| Category | Examples | Computation |
|----------|----------|-------------|
| **Volume** | Activities/month, events hosted, participants reached | COUNT/SUM aggregation, materialized views |
| **Alignment** | % of activities linked to goals, goal coverage ratio | Ratio of tagged vs untagged activities per goal |
| **Impact** | Participant growth rate, repeat engagement, geographic reach expansion | Time-series regression, unique participant tracking |
| **Efficiency** | Activities per project milestone, time-to-milestone | Division metrics with temporal bucketing |
| **Social** | CC follower growth, RSVP conversion rate, review sentiment | Synced from CC mirror tables |

**Dashboard composition:**
- **Org-level overview** — KPI cards (total activities, active projects, alignment score, impact trend)
- **Department drill-down** — Per-department metrics with comparison charts
- **Goal tracker** — Progress bars per goal, activity timeline, alignment heatmap
- **Geographic insights** — Map-integrated metrics (activity density, coverage gaps)
- **Trend analysis** — Time-series charts with configurable date ranges, comparison periods
- **Leaderboard** — Department/member activity rankings (opt-in)

### 4.4 Vision-Activity Alignment Engine

The core differentiator: computing how well recorded activities map to declared vision/goals.

**Alignment scoring algorithm:**
```
For each Goal G in Organisation O:
  1. Count activities explicitly linked to G:          linked_count
  2. Count activities auto-tagged (keyword/category):   inferred_count
  3. Weight: linked = 1.0, inferred = 0.5
  4. Compute: raw_score = (linked_count * 1.0 + inferred_count * 0.5) / target_activity_count
  5. Apply temporal decay: recent activities weighted higher (exponential decay, half-life = 90 days)
  6. Normalize to 0–100 scale
  
Organisation Alignment Score = weighted_average(goal_scores, goal_priority_weights)
```

**Auto-tagging heuristic:**
- Keyword matching against goal descriptions and activity titles/descriptions
- Category overlap (goal categories ↔ activity categories)
- Participant overlap (activities with goal-assigned members)
- Configurable per-org; admin can override any auto-tag

---

## 5. Advisory Engines

### 5.1 Architecture

Advisory outputs are **template-driven, rule-based** recommendations (not ML/AI). This keeps the system deterministic, auditable, and explainable.

```
┌─────────────────────────────────────────┐
│          Advisory Engine Pipeline         │
│                                          │
│  ┌──────────┐    ┌──────────────────┐   │
│  │ Metric    │───▶│ Rule Evaluator    │   │
│  │ Snapshot  │    │ (SQL functions)   │   │
│  └──────────┘    └────────┬─────────┘   │
│                           │              │
│                  ┌────────▼─────────┐    │
│                  │ Template Renderer │    │
│                  │ (parameterized    │    │
│                  │  markdown)        │    │
│                  └────────┬─────────┘    │
│                           │              │
│                  ┌────────▼─────────┐    │
│                  │ Advisory Output   │    │
│                  │ (stored, surfaced │    │
│                  │  in dashboard)    │    │
│                  └──────────────────┘    │
└─────────────────────────────────────────┘
```

### 5.2 Advisory Types

| Advisory | Trigger | Template Example |
|----------|---------|-----------------|
| **Alignment gap** | Goal alignment < 30% for 30+ days | "Goal '{goal_name}' has only {score}% alignment. Consider scheduling activities in: {suggested_categories}" |
| **Coverage gap** | Geo-boundary with <5 activities/quarter | "Your {boundary_name} area shows low activity ({count} in {period}). Nearby orgs are active in: {areas}" |
| **Trend alert** | Activity volume dropped >25% month-over-month | "Activity volume decreased {pct}% compared to last month. Departments most affected: {departments}" |
| **Milestone risk** | Project milestone overdue or <2 weeks away with <50% completion | "Milestone '{milestone_name}' in project '{project_name}' is at risk. {days_remaining} days remain, {completion}% complete" |
| **Impact highlight** | Significant metric improvement | "Your {metric_name} improved {pct}% this {period}. Top contributors: {entities}" |
| **CC sync insight** | New CC events matching org interests | "{count} new events on Citizens Connect match your goals. Review and claim: {link}" |

### 5.3 Evaluation Schedule

- **Real-time:** Milestone risk (triggered on activity/milestone changes)
- **Hourly:** Alignment gap, coverage gap (materialized view refresh)
- **Daily:** Trend alerts, impact highlights, CC sync insights (pg_cron @ 6 AM)

---

## 6. Timeline Engine

### 6.1 Design

The timeline is a **horizontal, zoomable, filterable chronological view** of all organisational activity.

**Zoom levels:**
- **Year** — Monthly buckets, annual trends
- **Quarter** — Weekly buckets, seasonal patterns
- **Month** — Daily buckets, operational rhythm
- **Week** — Hourly buckets, granular activity
- **Day** — Individual activity items

**Features:**
- Layered swim-lanes: by department, project, goal, or entity type
- Milestone markers on project timelines
- Activity density heat-strip above the timeline (darker = more activity)
- "Now" indicator line with future projections (dashed) from active project timelines
- Playback mode: auto-scroll through time at configurable speed
- Click any item to see detail pane + jump to map location

### 6.2 Data Model

```sql
-- Activities are the primary timeline items
-- They already have: created_at, date, start_time, end_time, location

-- Timeline query pattern:
SELECT a.*, p.name as project_name, d.name as department_name,
       array_agg(g.name) as aligned_goals
FROM activities a
LEFT JOIN projects p ON a.project_id = p.id
LEFT JOIN departments d ON a.department_id = d.id
LEFT JOIN activity_goals ag ON ag.activity_id = a.id
LEFT JOIN goals g ON ag.goal_id = g.id
WHERE a.org_id = $1
  AND a.date BETWEEN $2 AND $3
GROUP BY a.id, p.name, d.name
ORDER BY a.date, a.start_time;
```

### 6.3 Timeline + Map Synchronization

The timeline and map are linked:
- Selecting a time range on the timeline filters the map to that period
- Hovering a map marker highlights it on the timeline
- Playback mode animates both simultaneously
- Shared Zustand store holds `{ timeRange, selectedEntityId, playbackState }`

---

## 7. Citizens Connect Integration

> ⚠️ **SUPERSEDED (2026-06 ecosystem consolidation).** §7.1–§7.2 below describe the
> original **separate-project pull-sync** model (`sync-from-connect` Edge Function →
> `cc_*_mirror` tables). That model has been removed. Vision now runs **inside the shared
> Citizens Supabase project** under the `vision` schema (one `auth.users`), and reads
> Connect's commons data **live over Connect's public API (`/api/v1`)** — never via mirror
> tables. Org↔Connect-event/place attribution lives in `vision.cc_event_claims` /
> `vision.cc_place_claims`, keyed by the org's linked contributor
> (`vision.organisations.connect_contributor_id`, set via `POST /api/connect/link`).
> See `citizens-connect/docs/strategy/ECOSYSTEM_DECISION_BRIEF.md` and `docs/SHARED_DB_CONTRACT.md`.
> The sections below are kept for historical context only.

### 7.1 Integration Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Citizens Connect   │         │   Citizens Vision    │
│   (Supabase Project) │         │   (Supabase Project) │
│                      │         │                      │
│  events ─────────────┼────────▶│  cc_events_mirror    │
│  places ─────────────┼────────▶│  cc_places_mirror    │
│  profiles ───────────┼────────▶│  cc_profiles_mirror  │
│  rsvps ──────────────┼────────▶│  (joined in mirror)  │
│  reviews ────────────┼────────▶│  (joined in mirror)  │
│  categories ─────────┼────────▶│  cc_categories_mirror│
│  follows ────────────┼────────▶│  (social metrics)    │
│                      │         │                      │
│  auth.users ─────────┼───SSO──▶│  auth.users (shared) │
└──────────────────────┘         └──────────────────────┘
```

### 7.2 Sync Strategy

**Option chosen: Edge Function pull-sync with change tracking**

Rationale: Avoids coupling CC's schema to CV. CV controls when and what it pulls. No CC code changes required initially.

**Sync mechanism:**
1. CV Edge Function `sync-from-connect` runs on pg_cron (every 15 minutes)
2. Connects to CC's Supabase via service role key (read-only)
3. Queries CC tables for records with `updated_at > last_sync_timestamp`
4. Upserts into CV mirror tables
5. Logs sync metadata to `cc_sync_log` (timestamp, record counts, errors)

**Mirror table design:**
```sql
CREATE TABLE cc_events_mirror (
  cc_event_id    UUID PRIMARY KEY,       -- Original CC event ID
  title          TEXT NOT NULL,
  description    TEXT,
  date           TIMESTAMPTZ,
  end_time       TIMESTAMPTZ,
  location       TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  category       TEXT,
  status         TEXT,
  created_by     UUID,                    -- CC user ID (mappable to CV user)
  rsvp_count     INTEGER DEFAULT 0,
  avg_rating     NUMERIC(3,2),
  synced_at      TIMESTAMPTZ DEFAULT now(),
  -- CV-specific enrichment columns:
  cv_org_id      UUID REFERENCES organisations(id),  -- Claimed by org
  cv_project_id  UUID REFERENCES projects(id),       -- Linked to project
  cv_activity_id UUID REFERENCES activities(id)       -- Promoted to activity
);
```

### 7.3 Data Flow: CC Event → CV Activity

```
CC Event Published
        │
        ▼ (sync-from-connect, every 15 min)
  cc_events_mirror (raw copy)
        │
        ▼ (org admin reviews in CV dashboard)
  "Claim" action → sets cv_org_id
        │
        ▼ (optional: link to project)
  "Link to project" → sets cv_project_id
        │
        ▼ ("Promote to activity")
  Creates activity row with source_type = 'citizens_connect',
  source_id = cc_event_id. Now participates in all CV metrics.
```

### 7.4 Shared Auth

Both platforms use the same Supabase Auth provider. Users signing into CV with their CC credentials see their CC activity automatically associated.

**Implementation:** CV's Supabase project configured with the same auth provider (or shared auth via Supabase's multi-project auth, or a shared custom JWT issuer).

**Simpler alternative for Phase 1:** Same Supabase organisation, separate projects, user links via email matching in mirror tables. Full SSO deferred to Phase 2.

### 7.5 Data CV Exposes Back to CC (Future)

| Data Point | Use in CC | Method |
|------------|----------|--------|
| Organisation profiles | "Verified org" badge on CC events | API endpoint |
| Goal categories | CC event creators can tag alignment | Shared category table or API |
| Activity stats | "This org has done X events" on CC profiles | API endpoint |
| Advisory alerts | "Your event aligns with {org}'s {goal}" notification | Webhook to CC |

---

## 8. File Structure

```
citizens-vision/
├── .github/
│   ├── copilot-instructions.md       # AI coding guide
│   ├── VISION.md                     # Product vision & principles
│   ├── PROJECT_STATUS.md             # Phase tracker
│   ├── DECISIONS.md                  # Architecture decisions
│   ├── agents/                       # Copilot agent definitions
│   │   ├── architect.agent.md
│   │   ├── data.agent.md
│   │   ├── metrics.agent.md
│   │   └── testing.agent.md
│   └── instructions/
│       ├── project-architecture.instructions.md
│       ├── supabase-patterns.instructions.md
│       └── dashboard-patterns.instructions.md
│
├── public/
│   ├── manifest.json
│   └── icons/
│
├── src/
│   ├── middleware.ts                  # Auth refresh (same pattern as CC)
│   │
│   ├── app/
│   │   ├── layout.tsx                # Root layout with org context provider
│   │   ├── page.tsx                  # Landing / org selector
│   │   ├── globals.css               # Tailwind v4 config
│   │   ├── error.tsx                 # Error boundary
│   │   ├── loading.tsx               # Global loading state
│   │   │
│   │   ├── auth/
│   │   │   ├── callback/route.ts     # PKCE callback
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   │
│   │   ├── [orgSlug]/                # Tenant-scoped routes
│   │   │   ├── layout.tsx            # Org context loader + nav
│   │   │   ├── page.tsx              # Org overview dashboard
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx          # Main metrics dashboard
│   │   │   │   ├── goals/page.tsx    # Goal alignment view
│   │   │   │   ├── departments/page.tsx
│   │   │   │   └── trends/page.tsx   # Trend analysis
│   │   │   │
│   │   │   ├── map/
│   │   │   │   └── page.tsx          # Full geospatial view
│   │   │   │
│   │   │   ├── timeline/
│   │   │   │   └── page.tsx          # Timeline + playback
│   │   │   │
│   │   │   ├── activities/
│   │   │   │   ├── page.tsx          # Activity list + filters
│   │   │   │   ├── new/page.tsx      # Create activity
│   │   │   │   └── [id]/page.tsx     # Activity detail
│   │   │   │
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx          # Project list
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Project detail + milestones
│   │   │   │       └── activities/page.tsx
│   │   │   │
│   │   │   ├── goals/
│   │   │   │   ├── page.tsx          # Goal management
│   │   │   │   └── [id]/page.tsx     # Goal detail + alignment
│   │   │   │
│   │   │   ├── connect/              # CC integration views
│   │   │   │   ├── page.tsx          # Synced data overview
│   │   │   │   ├── events/page.tsx   # CC events to claim
│   │   │   │   └── sync/page.tsx     # Sync status + config
│   │   │   │
│   │   │   ├── advisory/
│   │   │   │   └── page.tsx          # Advisory feed + history
│   │   │   │
│   │   │   └── settings/
│   │   │       ├── page.tsx          # Org settings
│   │   │       ├── members/page.tsx  # Member management
│   │   │       ├── departments/page.tsx
│   │   │       ├── roles/page.tsx
│   │   │       └── sync/page.tsx     # CC sync configuration
│   │   │
│   │   └── api/
│   │       ├── orgs/
│   │       │   ├── route.ts          # List/create orgs
│   │       │   └── [orgId]/
│   │       │       ├── route.ts      # Get/update org
│   │       │       ├── members/route.ts
│   │       │       └── departments/route.ts
│   │       ├── activities/
│   │       │   ├── route.ts          # CRUD activities
│   │       │   └── [id]/route.ts
│   │       ├── projects/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       └── milestones/route.ts
│   │       ├── goals/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       └── alignment/route.ts
│   │       ├── metrics/
│   │       │   ├── overview/route.ts     # Org-level KPIs
│   │       │   ├── alignment/route.ts    # Goal alignment scores
│   │       │   ├── trends/route.ts       # Time-series data
│   │       │   ├── impact/route.ts       # Impact scores
│   │       │   └── geo/route.ts          # Geospatial metrics
│   │       ├── timeline/
│   │       │   └── route.ts              # Timeline data queries
│   │       ├── advisory/
│   │       │   └── route.ts              # Advisory outputs
│   │       ├── sync/
│   │       │   ├── status/route.ts       # Sync health check
│   │       │   ├── trigger/route.ts      # Manual sync trigger
│   │       │   └── claim/route.ts        # Claim CC entity
│   │       └── map/
│   │           ├── layers/route.ts       # Map layer data
│   │           └── boundaries/route.ts   # Geo boundaries
│   │
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── MetricCard.tsx
│   │   │   ├── KpiRow.tsx
│   │   │   ├── AlignmentGauge.tsx
│   │   │   ├── TrendChart.tsx
│   │   │   ├── DepartmentComparison.tsx
│   │   │   ├── GoalProgressBar.tsx
│   │   │   └── ImpactScoreCard.tsx
│   │   ├── map/
│   │   │   ├── VisionMap.tsx             # Main map component
│   │   │   ├── MapLayerToggle.tsx
│   │   │   ├── GeoFenceEditor.tsx
│   │   │   ├── CoverageOverlay.tsx
│   │   │   └── ActivityHeatmap.tsx
│   │   ├── timeline/
│   │   │   ├── TimelineView.tsx
│   │   │   ├── TimelineControls.tsx
│   │   │   ├── SwimLane.tsx
│   │   │   ├── PlaybackControl.tsx
│   │   │   └── TimelineDensityStrip.tsx
│   │   ├── activities/
│   │   │   ├── ActivityForm.tsx
│   │   │   ├── ActivityCard.tsx
│   │   │   ├── ActivityList.tsx
│   │   │   └── ActivityFilters.tsx
│   │   ├── projects/
│   │   │   ├── ProjectForm.tsx
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── MilestoneTracker.tsx
│   │   │   └── ProjectTimeline.tsx
│   │   ├── goals/
│   │   │   ├── GoalForm.tsx
│   │   │   ├── GoalCard.tsx
│   │   │   ├── AlignmentMatrix.tsx
│   │   │   └── GoalDetail.tsx
│   │   ├── advisory/
│   │   │   ├── AdvisoryCard.tsx
│   │   │   ├── AdvisoryFeed.tsx
│   │   │   └── AdvisoryDetail.tsx
│   │   ├── connect/
│   │   │   ├── SyncStatus.tsx
│   │   │   ├── CCEventCard.tsx
│   │   │   ├── ClaimDialog.tsx
│   │   │   └── SyncConfigPanel.tsx
│   │   ├── org/
│   │   │   ├── OrgSwitcher.tsx
│   │   │   ├── OrgSetupWizard.tsx
│   │   │   ├── MemberTable.tsx
│   │   │   ├── DepartmentTree.tsx
│   │   │   └── RoleEditor.tsx
│   │   └── ui/
│   │       ├── Navbar.tsx
│   │       ├── Sidebar.tsx
│   │       ├── BreadcrumbNav.tsx
│   │       ├── DateRangePicker.tsx
│   │       ├── FilterBar.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ConfirmDialog.tsx
│   │       └── LoadingSkeleton.tsx
│   │
│   ├── hooks/
│   │   ├── useOrg.ts                    # Current org context
│   │   ├── useMetrics.ts               # Metric fetching + caching
│   │   ├── useTimeline.ts              # Timeline data + controls
│   │   ├── useMapLayers.ts             # Map layer state
│   │   ├── useSync.ts                  # CC sync status
│   │   └── useAdvisory.ts              # Advisory feed
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts               # Server client (async, cookies)
│   │   │   └── client.ts               # Browser client (sync)
│   │   ├── map/
│   │   │   ├── config.ts               # Map style, defaults (shared w/ CC)
│   │   │   ├── markers.ts              # CV-specific marker factories
│   │   │   ├── layers.ts               # Heatmap, boundary, overlay layers
│   │   │   └── geo.ts                  # Haversine, bounding box utils
│   │   ├── metrics/
│   │   │   ├── alignment.ts            # Alignment score computation
│   │   │   ├── impact.ts               # Impact score formulas
│   │   │   ├── trends.ts               # Trend detection helpers
│   │   │   └── formatters.ts           # Number/percentage formatting
│   │   ├── advisory/
│   │   │   ├── rules.ts                # Rule definitions
│   │   │   ├── templates.ts            # Advisory templates
│   │   │   └── evaluator.ts            # Rule evaluation engine
│   │   ├── sync/
│   │   │   └── connect.ts              # CC API client helpers
│   │   ├── validation.ts               # Input validation (UUID, etc.)
│   │   └── constants.ts                # App-wide constants
│   │
│   ├── stores/
│   │   ├── orgStore.ts                 # Active org + tenant state
│   │   ├── filterStore.ts              # Global filter state
│   │   ├── mapStore.ts                 # Map viewport + layers
│   │   └── timelineStore.ts            # Timeline range + playback
│   │
│   └── types/
│       ├── db.ts                       # Database types (auto-generated)
│       ├── metrics.ts                  # Metric / chart types
│       ├── advisory.ts                 # Advisory types
│       ├── sync.ts                     # Sync types
│       └── map.ts                      # Map layer types
│
├── supabase/
│   ├── config.toml
│   ├── schema.sql                      # Full idempotent schema
│   ├── seed.sql                        # Demo org + seed data
│   ├── migrations/
│   │   ├── 001_foundation.sql          # Orgs, departments, users, roles
│   │   ├── 002_goals_projects.sql      # Goals, projects, milestones
│   │   ├── 003_activities.sql          # Activities, tagging, geo
│   │   ├── 004_metrics_views.sql       # Materialized views, scoring functions
│   │   ├── 005_advisory.sql            # Advisory tables, templates, rules
│   │   ├── 006_cc_sync.sql             # Mirror tables, sync log
│   │   ├── 007_geo_boundaries.sql      # GeoJSON boundaries, coverage
│   │   └── ...
│   └── functions/
│       ├── deno.json
│       ├── _shared/
│       │   ├── supabase.ts             # Shared Supabase client init
│       │   ├── geo.ts                  # Haversine + bounding box
│       │   └── connect-client.ts       # CC Supabase read-only client
│       ├── sync-from-connect/
│       │   └── index.ts                # Pull CC data → mirror tables
│       ├── compute-alignment/
│       │   └── index.ts                # Recalculate alignment scores
│       ├── generate-advisory/
│       │   └── index.ts                # Evaluate rules → advisory outputs
│       ├── refresh-materialized-views/
│       │   └── index.ts                # Refresh all materialized views
│       └── aggregate-impact-scores/
│           └── index.ts                # Compute per-entity impact scores
│
├── .env.local                          # Supabase credentials (gitignored)
├── .gitignore
├── .nvmrc                              # 22
├── capacitor.config.ts                 # Deferred to Phase 2
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
└── ARCHITECTURE.md                     # This file
```

---

## 9. Phased Roadmap

### Phase Overview

| Phase | Name | Focus | Depends On |
|-------|------|-------|------------|
| **0** | Foundation | Project scaffolding, DB schema, auth, RBAC | — |
| **1** | Entity & Activity Tracking | Core CRUD: orgs, departments, activities, manual entry | Phase 0 |
| **2** | Map Visualization | Geospatial view, markers, clustering, geolocation | Phase 1 |
| **3** | Metrics & Insight Dashboards | KPI cards, metric views, rollup queries, charts | Phase 1 |
| **4** | Goals & Alignment Engine | Vision/goal CRUD, alignment scoring, auto-tagging | Phases 1, 3 |
| **5** | Projects & Milestones | Project lifecycle, milestone tracking, Gantt-style views | Phase 1 |
| **6** | Timeline Engine | Chronological view, swim lanes, playback | Phases 2, 3, 5 |
| **7** | Citizens Connect Integration | Sync pipeline, mirror tables, claim flow, promotion | Phases 1, 2 |
| **8** | Advisory Engine | Rule evaluation, templates, advisory feed | Phases 3, 4 |
| **9** | Geo-Boundaries & Coverage Analysis | GeoJSON boundaries, coverage gap detection, overlays | Phases 2, 4, 8 |
| **10** | Advanced Analytics & Export | Comparison mode, trend regression, PDF/CSV export | Phases 3, 6 |
| **11** | Multi-Org & Cross-Org Insights | Org federation, shared metrics, cross-org dashboards | Phases 4, 7 |
| **12** | Mobile & Polish | Capacitor build, responsive refinement, E2E tests | All |

---

### Phase 0 — Foundation

**Goal:** A deployable skeleton with auth, RBAC, and the complete core schema. No features yet, but every subsequent phase builds on this without re-doing infrastructure.

**Deliverables:**
1. Next.js 15 project scaffolding (App Router, TypeScript 5, Tailwind v4)
2. Supabase project creation (`citizens-vision`)
3. Foundation migration: `001_foundation.sql`
   - `organisations` (id, name, slug, description, logo_url, created_at, updated_at)
   - `departments` (id, org_id, parent_department_id, name, description) — recursive hierarchy
   - `user_org_roles` (user_id, org_id, role, department_id) — multi-org membership
   - RLS policies scoping all reads/writes to org membership
   - `is_org_member(org_id)`, `is_org_admin(org_id)`, `get_user_org_role(org_id)` SQL functions
4. Auth setup: Supabase Auth with PKCE, middleware, login/signup pages
5. Org-scoped routing: `[orgSlug]/layout.tsx` loads org context, validates membership
6. Navbar + Sidebar shell with placeholder nav items
7. Zustand stores: `orgStore`, `filterStore`
8. `.github/` continuity files: copilot-instructions, VISION, PROJECT_STATUS, DECISIONS
9. Vitest configuration + first test (auth middleware)
10. Vercel deployment pipeline

**Schema excerpt:**
```sql
-- organisations
CREATE TABLE organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url    TEXT,
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- departments (recursive)
CREATE TABLE departments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  parent_department_id  UUID REFERENCES departments(id),
  name                  TEXT NOT NULL,
  description           TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- user_org_roles (RBAC junction)
CREATE TABLE user_org_roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('org_admin','org_manager','org_member','org_viewer')),
  department_id  UUID REFERENCES departments(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);
```

**Quality gates:**
- All RLS policies tested with Vitest (service role + anon role assertions)
- Auth flow tested end-to-end (signup → callback → org creation → routing)
- Vercel preview deployment functional
- Zero TypeScript errors, zero ESLint warnings

---

### Phase 1 — Entity & Activity Tracking

**Goal:** Users can create organisations, departments, and log activities. This is the foundational data entry system that everything else reads from.

**Deliverables:**
1. Migration `002_activities.sql`:
   - `activities` (id, org_id, department_id, title, description, type, date, start_time, end_time, latitude, longitude, location_name, participant_count, source_type, source_id, created_by, created_at, updated_at)
   - `activity_tags` (activity_id, tag) — freeform tags for later alignment matching
   - Indexes on (org_id, date), (department_id), (source_type, source_id)
   - RLS: org members read all; members create in own/assigned dept; managers edit dept activities; admins edit all
2. Org setup wizard: create org → add departments → invite initial members
3. Activity CRUD:
   - `/[orgSlug]/activities/new` — Form with: title, description, type, date/time, location (map picker), participant count, tags, department assignment
   - `/[orgSlug]/activities` — Filterable list (by date range, department, type, tag)
   - `/[orgSlug]/activities/[id]` — Detail view with edit capability
4. API routes: `/api/activities` (GET, POST), `/api/activities/[id]` (GET, PATCH, DELETE)
5. Department management: `/[orgSlug]/settings/departments` — CRUD with hierarchy tree
6. Member management: `/[orgSlug]/settings/members` — Invite by email, assign role + department
7. Bulk import: CSV upload → parse → validate → insert activities
8. Activity type taxonomy: event, meeting, outreach, workshop, service, training, other (extensible)

**Quality gates:**
- CRUD operations tested (Vitest: API routes + component rendering)
- RLS policies tested (org isolation, department scoping)
- Form validation (client + server)
- CSV import handles malformed data gracefully
- Pagination on activity list (cursor-based)

---

### Phase 2 — Map Visualization

**Goal:** Full geospatial view of all organisational activity, with intelligence layers beyond simple pins.

**Deliverables:**
1. `/[orgSlug]/map` — Full-viewport MapLibre GL map
2. Activity markers: category-coloured pins, temporal opacity (same pattern as CC)
3. Marker clustering: automatic at higher zoom levels, count badges
4. Layer toggle panel: Activities, Departments (colour-coded), Heatmap
5. Activity heatmap layer: density visualization using WebGL
6. Map location picker: reusable component for activity/project forms
7. Geolocation "center on me" button (Capacitor geolocation or browser API)
8. Marker click → detail panel (slide-out, showing activity/entity details)
9. Map viewport persistence (sessionStorage, same pattern as CC)
10. Search bar: Nominatim geocoding → pan + zoom
11. Shared `lib/map/config.ts` pattern with CC (MapTiler + OSM fallback)

**Quality gates:**
- Map renders with 1000+ markers without jank
- Clustering activates/deactivates at appropriate zoom levels
- Heatmap layer toggles cleanly
- Mobile-responsive (touch gestures work)
- Marker temporal styling matches activity dates

---

### Phase 3 — Metrics & Insight Dashboards

**Goal:** Quantify organisational activity through computed metrics, displayed in an executive-quality dashboard.

**Deliverables:**
1. Migration `003_metrics.sql`:
   - `metric_definitions` (id, org_id, name, slug, computation_type, description)
   - Materialized views:
     - `mv_org_activity_summary` — total activities, by department, by type, by month
     - `mv_department_ranking` — departments ranked by activity volume, participant reach
   - `pg_cron` scheduled refresh (every hour)
   - SQL functions: `compute_org_kpis(org_id, date_from, date_to)`
2. Dashboard page: `/[orgSlug]/dashboard`
   - KPI row: Total activities (period), Active projects, Participants reached, Activity growth %
   - `MetricCard` component — value, label, trend arrow, sparkline
   - Department comparison bar chart
   - Activity type distribution (pie/donut chart)
   - Activity volume over time (line chart with date range selector)
3. `DateRangePicker` component — shared across dashboard, map, timeline
4. `FilterBar` component — department, activity type, tag filters
5. Recharts integration: TrendChart, BarChart, PieChart wrappers
6. `/api/metrics/overview` — returns computed KPIs for authenticated org members
7. `/api/metrics/trends` — time-series data with configurable granularity

**Quality gates:**
- Materialized views refresh in < 5 seconds for orgs with 10,000 activities
- Dashboard loads in < 2 seconds (server-side data fetching)
- Charts render responsively
- All metric queries use materialized views (not raw table scans)
- Date range changes update all charts atomically

---

### Phase 4 — Goals & Alignment Engine

**Goal:** Connect organisational vision to recorded activity through goal declaration and alignment scoring.

**Deliverables:**
1. Migration `004_goals_alignment.sql`:
   - `vision_statements` (id, org_id, title, description, active, created_at)
   - `goals` (id, org_id, vision_id, title, description, target_value, target_unit, deadline, priority_weight, status, created_at)
   - `goal_activity_links` (goal_id, activity_id, link_type ['explicit','inferred'], confidence, created_at)
   - SQL function: `compute_alignment_score(goal_id)` — implements weighted scoring with temporal decay
   - SQL function: `compute_org_alignment(org_id)` — weighted average across goals
   - Materialized view: `mv_goal_alignment_matrix` — precomputed per-goal scores
2. Goal CRUD: `/[orgSlug]/goals` — list, create, edit goals linked to vision statements
3. Goal detail: `/[orgSlug]/goals/[id]` — alignment score, linked activities, trend
4. Alignment dashboard: `/[orgSlug]/dashboard/goals`
   - `AlignmentGauge` — circular gauge showing org-wide alignment (0–100)
   - Per-goal progress bars with colour coding (red < 30, yellow 30–70, green > 70)
   - `AlignmentMatrix` — goals × departments heatmap
5. Activity → Goal linking: explicit link in activity form + auto-inference
6. Auto-tagging engine (lib/metrics/alignment.ts):
   - Keyword matching (goal description tokens against activity title + description)
   - Category overlap
   - Stores inferred links with confidence score; admin can approve/reject
7. `/api/goals/[id]/alignment` — returns alignment breakdown

**Quality gates:**
- Alignment score computation is deterministic and reproducible
- Auto-tagging precision > 70% on test data (measured via seed data)
- Temporal decay correctly weights recent activities higher
- Admin can override any auto-inferred link
- Goal alignment refreshes within 1 minute of new activity insertion

---

### Phase 5 — Projects & Milestones

**Goal:** Group activities into projects with defined timelines and trackable milestones.

**Deliverables:**
1. Migration `005_projects.sql`:
   - `projects` (id, org_id, department_id, name, description, status, start_date, end_date, created_by, created_at)
   - `milestones` (id, project_id, title, target_date, completed_at, sort_order)
   - `project_goal_links` (project_id, goal_id)
   - `project_activities` (project_id, activity_id) — many-to-many
2. Project CRUD: `/[orgSlug]/projects` with status lifecycle (planning → active → completed → archived)
3. Project detail: `/[orgSlug]/projects/[id]`
   - Milestone tracker with completion toggle
   - Activity list (linked activities)
   - Simple Gantt-style horizontal bar visualization
   - Goal alignment indicator
4. Activity form update: add "Link to project" dropdown
5. Project dashboard integration: "Active projects" KPI, project status distribution chart

**Quality gates:**
- Project-activity many-to-many correctly maintained
- Milestone completion dates recorded accurately
- Project status transitions validated (no backwards movement without admin)
- Projects visible on map (markers for project-linked activities grouped)

---

### Phase 6 — Timeline Engine

**Goal:** Navigate organisational history and future through a chronological, interactive timeline.

**Deliverables:**
1. `/[orgSlug]/timeline` — dedicated timeline page
2. `TimelineView` component:
   - Horizontal zoomable timeline (year → quarter → month → week → day)
   - Swim lanes: by department, by project, by goal
   - Activity items plotted by date with type-coloured dots
   - Milestone markers (diamond icons) on project swim lanes
   - Density strip: colour-intensity bar above timeline showing activity volume
3. `PlaybackControl`: auto-scroll through time, speed selector (1x, 2x, 4x)
4. `TimelineControls`: zoom buttons, date range selector, swim lane toggle
5. Timeline ↔ Map synchronization:
   - Selecting time range on timeline filters map markers
   - Clicking map marker highlights on timeline
   - Playback animates both views
   - Shared `timelineStore` (Zustand) for state
6. `/api/timeline` — optimized query returning activities bucketed by time + swimlane

**Quality gates:**
- Timeline smooth with 5,000+ activity items (virtualized rendering)
- Zoom transitions animated smoothly
- Map sync is instantaneous (shared store, no API round-trip for filter changes)
- Playback mode works consistently across browsers

---

### Phase 7 — Citizens Connect Integration

**Goal:** Pull data from Citizens Connect, display synced entities, and allow orgs to claim and promote CC activity into their CV.

**Deliverables:**
1. Migration `006_cc_sync.sql`:
   - `cc_events_mirror` — schema as defined in Section 7.2
   - `cc_places_mirror` — (cc_place_id, name, address, lat, lng, category, verified, avg_rating, cv_org_id, synced_at)
   - `cc_profiles_mirror` — (cc_user_id, email, full_name, avatar_url, synced_at)
   - `cc_sync_log` — (id, sync_type, started_at, completed_at, records_synced, errors)
   - RLS: org members see only claimed records + unclaimed public records
2. Edge Function `sync-from-connect`:
   - Connects to CC Supabase via service role (read-only)
   - Pulls events, places, profiles updated since last sync
   - Upserts into mirror tables
   - Logs to `cc_sync_log`
   - Scheduled via pg_cron (every 15 minutes)
3. `/[orgSlug]/connect` — Synced data overview
   - CC events list with "Claim for org" button
   - CC places list with "Associate with org" button
   - Claim flow: select CC entity → assign department → optionally link to project → promote to activity
4. `/[orgSlug]/connect/sync` — Sync status dashboard (last run, records synced, errors)
5. Sync configuration: org admin can set CC sync preferences (which categories to pull, geographic radius)
6. Map integration: CC-sourced activities shown with distinct styling (dashed border, CC badge)

**Quality gates:**
- Sync handles CC API downtime gracefully (retry with exponential backoff)
- Mirror tables don't duplicate records (upsert on CC IDs)
- Claimed CC entities immediately appear in org's activity feed
- Sync runs within 30 seconds for orgs with 1,000 CC entities
- CC service role has READ-ONLY access (no writes to CC from CV)

---

### Phase 8 — Advisory Engine

**Goal:** Surface actionable, template-driven recommendations based on computed metrics.

**Deliverables:**
1. Migration `007_advisory.sql`:
   - `advisory_templates` (id, type, title_template, body_template, severity, active)
   - `advisory_rules` (id, template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
   - `advisory_outputs` (id, org_id, template_id, rule_id, title, body, severity, data, dismissed, created_at)
   - Seed: templates and rules for 6 advisory types (Section 5.2)
2. Edge Function `generate-advisory`:
   - Evaluates all active rules against current metric snapshots
   - Generates advisory outputs for triggered rules
   - Respects cooldown periods (no duplicate alerts)
   - Scheduled via pg_cron (daily @ 6 AM + triggered on metric refresh)
3. `/[orgSlug]/advisory` — Advisory feed
   - `AdvisoryCard`: severity badge, title, body, timestamp, dismiss button
   - Filtering: by type, severity, date range
   - "Mark as addressed" action with optional notes
4. Dashboard integration: advisory summary card on main dashboard (count by severity)
5. Notification hooks: critical advisories surface in navbar bell icon

**Quality gates:**
- Advisory rules are idempotent (same state = same output, no duplicates)
- Cooldown periods prevent alert fatigue
- Templates render correctly with all parameter combinations
- Dismissing advisory persists across sessions
- Advisory generation completes in < 10 seconds for 100 rules

---

### Phase 9 — Geo-Boundaries & Coverage Analysis

**Goal:** Define service areas as geographic boundaries and analyze activity coverage within them.

**Deliverables:**
1. Migration `008_boundaries.sql`:
   - `geo_boundaries` (id, org_id, name, description, boundary_geojson, area_km2, created_at)
   - Materialized view: `mv_boundary_activity_coverage` — per-boundary activity count, participant reach, gaps
   - PostGIS extension activation (if available on Supabase plan, otherwise bounding-box approximation)
2. `GeoFenceEditor`: draw/import GeoJSON boundaries on map
3. `CoverageOverlay`: colour-coded boundary fill (green = well-covered, red = gap)
4. Coverage gap advisories: integrate with advisory engine (Phase 8)
5. Boundary-scoped metrics: filter all dashboards by geographic boundary
6. Map layer: "Boundaries" toggle showing org service areas

**Quality gates:**
- GeoJSON editor works with complex polygons (multi-polygon, holes)
- Coverage computation handles edge cases (activities on boundary)
- Performance: boundary queries < 500ms for 50 boundaries with 10K activities

---

### Phase 10 — Advanced Analytics & Export

**Goal:** Comparative analysis tools and data export for reporting.

**Deliverables:**
1. Comparison mode: side-by-side metric comparison (two periods, two departments, two orgs)
2. Trend regression: linear + moving average trend lines on all time-series charts
3. Export:
   - Dashboard → PDF report (server-rendered via Puppeteer or react-pdf)
   - Activity data → CSV export with filters applied
   - Map view → PNG snapshot
4. Scheduled reports: weekly email digest of org KPIs (pg_cron + Edge Function)
5. Custom metric definitions: org admins can define custom computed metrics

**Quality gates:**
- PDF export renders charts correctly (not just screenshots)
- CSV export handles 50K+ rows without timeout
- Comparison mode layout responsive on desktop + tablet

---

### Phase 11 — Multi-Org & Cross-Org Insights

**Goal:** Organisations can share selective data with partner orgs for federated insights.

**Deliverables:**
1. Migration `010_federation.sql`:
   - `org_partnerships` (org_a_id, org_b_id, status, sharing_level)
   - `shared_metrics` (partnership_id, metric_slug, visible)
   - Views: cross-org aggregated metrics for partnered orgs
2. Data sharing policies: org admin configures what metrics are visible to partners
3. Cross-org dashboard: aggregated view across partnered orgs
4. "Community" view: anonymized regional aggregate metrics (opt-in)
5. API: `/api/orgs/[orgId]/partnerships` — manage partnerships and sharing levels

**Quality gates:**
- Sharing is strictly opt-in with granular control
- Anonymized data is genuinely non-identifiable
- Cross-org queries respect both orgs' sharing policies via RLS

---

### Phase 12 — Mobile & Polish

**Goal:** Production-ready mobile experience and final quality bar.

**Deliverables:**
1. Capacitor build: iOS + Android native shells
2. Responsive refinement: all views optimized for mobile viewports
3. Playwright E2E test suite: critical user journeys
4. Performance audit: Lighthouse scores, bundle size optimization
5. Accessibility audit: WCAG 2.1 AA compliance
6. Documentation: API docs, user guide, admin guide

**Quality gates:**
- Lighthouse performance score > 90 on mobile
- E2E tests cover: auth, activity CRUD, dashboard rendering, map interaction, CC sync
- Zero critical/high accessibility violations
- App Store / Play Store submission readiness

---

## Appendix A: Database Schema Summary (All Tables)

| # | Table | Phase | Purpose |
|---|-------|-------|---------|
| 1 | `organisations` | 0 | Tenant root entities |
| 2 | `departments` | 0 | Recursive org hierarchy |
| 3 | `user_org_roles` | 0 | RBAC junction |
| 4 | `activities` | 1 | Atomic work units |
| 5 | `activity_tags` | 1 | Freeform tagging |
| 6 | `metric_definitions` | 3 | Custom metric registry |
| 7 | `vision_statements` | 4 | Org visions |
| 8 | `goals` | 4 | Measurable objectives |
| 9 | `goal_activity_links` | 4 | Alignment junction |
| 10 | `projects` | 5 | Activity groups |
| 11 | `milestones` | 5 | Project checkpoints |
| 12 | `project_goal_links` | 5 | Project-goal alignment |
| 13 | `project_activities` | 5 | Project-activity junction |
| 14 | `cc_events_mirror` | 7 | CC event cache |
| 15 | `cc_places_mirror` | 7 | CC place cache |
| 16 | `cc_profiles_mirror` | 7 | CC profile cache |
| 17 | `cc_sync_log` | 7 | Sync audit trail |
| 18 | `advisory_templates` | 8 | Alert templates |
| 19 | `advisory_rules` | 8 | Rule definitions |
| 20 | `advisory_outputs` | 8 | Generated advisories |
| 21 | `geo_boundaries` | 9 | Service areas (GeoJSON) |
| 22 | `org_partnerships` | 11 | Cross-org federation |
| 23 | `shared_metrics` | 11 | Federation sharing config |

## Appendix B: Materialized Views

| View | Phase | Refresh | Purpose |
|------|-------|---------|---------|
| `mv_org_activity_summary` | 3 | Hourly | Volume KPIs per org |
| `mv_department_ranking` | 3 | Hourly | Department comparison |
| `mv_goal_alignment_matrix` | 4 | Hourly | Per-goal alignment scores |
| `mv_boundary_activity_coverage` | 9 | Hourly | Geo coverage analysis |
| `mv_temporal_activity_heatmap` | 6 | Hourly | Timeline density data |

## Appendix C: Edge Functions

| Function | Phase | Trigger | Purpose |
|----------|-------|---------|---------|
| `sync-from-connect` | 7 | pg_cron (15 min) | Pull CC data into mirror tables |
| `compute-alignment` | 4 | pg_cron (hourly) + webhook | Recalculate alignment scores |
| `generate-advisory` | 8 | pg_cron (daily) + post-metric-refresh | Evaluate rules, create advisories |
| `refresh-materialized-views` | 3 | pg_cron (hourly) | Refresh all materialized views |
| `aggregate-impact-scores` | 3 | pg_cron (daily) | Compute impact metrics |

## Appendix D: Citizens Connect → Citizens Vision Data Map

| CC Table | CV Mirror | Key Fields Synced | CV Usage |
|----------|-----------|-------------------|----------|
| `events` | `cc_events_mirror` | title, date, location, lat/lng, category, status, created_by | Claim → activity; map overlay; volume metrics |
| `places` | `cc_places_mirror` | name, address, lat/lng, category, verified, avg_rating | Org location association; map layer |
| `profiles` | `cc_profiles_mirror` | email, full_name, avatar_url | User identity matching; member association |
| `rsvps` | Aggregated into `cc_events_mirror.rsvp_count` | COUNT per event | Engagement metrics |
| `reviews` | Aggregated into `cc_places_mirror.avg_rating` | AVG(rating) per place | Trust/verification metrics |
| `categories` | Mapped to CV activity types | name, slug, emoji | Category alignment |
