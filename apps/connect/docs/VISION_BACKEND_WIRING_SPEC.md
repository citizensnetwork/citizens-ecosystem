# Vision Backend Wiring Specification

> **Purpose:** Plug-and-play reference mapping every Vision backend function, calculation,
> data source, role gate, and UI destination. When the Vision UI is ready to wire,
> each section here is a self-contained unit of work: read the section, build the
> missing pieces, connect to the UI component.
>
> **Companion docs:** [SHARED_DB_CONTRACT.md](SHARED_DB_CONTRACT.md) (schema boundaries),
> [Citizens_Vision_Backend_Architecture.md](../App%20Planning%20Docs/Vision/Citizens_Vision_Backend_Architecture.md)
> (calculation-level design), Citizens Vision Product Blueprint (UI pages).

---

## 0. Principles

### 0.1 Universal org model
Vision serves **every organisation type** — churches, businesses, nonprofits, training orgs,
marketplaces, community groups, any industry with a Christian lean. Metrics, labels, and
advisory copy must never assume a specific org type. The framework is:
1. **Universal base metrics** (Reach, Growth, Retention, Engagement) that work for any org.
2. **Customisable via `metric_definitions`** — orgs define their own named metrics.
3. **Goal-tailored** — `goals.priority_weight` lets each org weight what matters to them.
4. **Space-organised** — each org defines Spaces to group their activities by department,
   ministry, product line, programme, or any structure that makes sense for them.

### 0.2 Three-layer model
- **Connect (write path):** fires data when users act (view, RSVP, follow, review, broadcast).
  Connect never computes derived metrics.
- **Database (shared Postgres):** owns atomic counters, dedup, triggers, and lightweight
  views that are pure functions of Connect's tables with no Vision config needed.
- **Vision (app layer + jobs):** owns everything that depends on Vision-specific config
  (Spaces, Priorities, Goals, org hierarchy) or aggregates across an org. This is where
  "organisational intelligence" happens.

### 0.3 Identity model (RECONCILIATION OWED)
Two org identity systems coexist today:
- `public.profiles.id` — Connect's contributor identity (the org in Connect's world).
- `vision.organisations.id` — Vision's own org entity (richer: hierarchy, departments, RBAC).

**Bridge needed:** When Vision reads Connect data (via `vision.reach_per_event.org_id` which
is `events.created_by` = `profiles.id`), it needs to map that to `vision.organisations.id`.
Options: (a) `vision.organisations.cc_profile_id UUID REFERENCES public.profiles(id)` column,
(b) a bridge table, (c) unify entirely (Vision orgs ARE profile IDs). Decision: **TBD at app
repoint — see RESUME_HERE §3B step 2.5.**

> **✅ RESOLVED (2026-06-21, migration 142 — RESUME_HERE §3F):** option (a) shipped as
> `vision.organisations.connect_contributor_id` (value-ref to `public.profiles.id`, **no**
> cross-schema FK to preserve the exit ramp), set via the ownership-verified
> `POST /api/connect/link` flow (`profile.id === auth.uid`). Sections below that treat the
> bridge as open should read against this column.

### 0.4 Role hierarchy
```
platform_admin          — Citizens Network staff; sees all orgs
  └─ org_admin          — org owner; full CRUD on org, members, config
      └─ org_manager    — department-scoped; CRUD on own department's activities/projects
          └─ org_member — can log activities, view dashboards, search
              └─ org_viewer — read-only access to org data
```
Implemented in `vision.user_org_roles` with RBAC helper functions:
`is_platform_admin()`, `is_org_admin(org_id)`, `is_org_member(org_id)`,
`get_user_org_role(org_id)`, `is_org_or_ancestor_member(org_id)`.

---

## 1. Connect Data Sources (what Vision can read)

Every row below is live data in the shared Supabase project (`xyiajtrvhlxaeplsiajj`).
Vision reads these via `vision.*` aggregate views (service_role) or `/api/v1` (public).

| Connect Table | Key Columns for Vision | Row Count (live) | Vision Signal |
|---|---|---|---|
| `events` | id, created_by, category_id, date, status, impression_count, cancellation_count, latitude, longitude | 191 | Activity reach, timing, geo, engagement denominator |
| `rsvps` | user_id, event_id, status (attending/considering), created_at | — | Attendance, consideration, funnel conversion |
| `rsvp_cancellations` | user_id, event_id, cancelled_at | — | Churn signal, cancellation rate |
| `event_impressions` | user_id, event_id, first_seen_at | — | Unique views, impression→action funnel |
| `places` | id, created_by, category_id, latitude, longitude, volunteer_openings | 40 | Place reach, geo coverage, volunteer demand |
| `profiles` | id, role, contributor_status, timezone, connect_home_province | 21 | Org identity, timezone for period boundaries |
| `follows` | follower_id, followee_id, created_at | — | Org audience, loyalty, network graph |
| `place_follows` | user_id, place_id, created_at | — | Place audience, location loyalty |
| `reviews` | id, event_id, place_id, user_id, rating, created_at | — | Quality signal, satisfaction |
| `broadcast_messages` | id, contributor_id, entity_id, entity_type, audience_size_at_post, created_at | — | Broadcast reach, communication frequency |
| `broadcast_reactions` | broadcast_id, user_id, reaction_type, created_at | — | Broadcast engagement, content resonance |
| `categories` | id, slug, name, emoji, color | 27 | Activity classification, diversity metrics |
| `suggestions` | id, idea_status, vote_threshold, tier, associated_event_id | — | Community ideas pipeline |
| `idea_votes` | suggestion_id, user_id | — | Community engagement, self-organisation signal |
| `conversations` | id, status (pending/active) | — | Connection initiation |
| `messages` | conversation_id, sender_id, created_at | — | Connection health, response patterns |
| `notifications` | id, user_id, type, read | — | Platform engagement depth |
| `event_updates` | id, event_id, created_at | — | Org communication frequency |
| `volunteer_applications` | id, event_id, user_id, status | — | Volunteer supply, service engagement |
| `content_labels` | entity_type, entity_id, label, confidence | — | Auto-tagged content for smart filtering |
| `contributor_analytics` | contributor_id, period, views, followers_gained, events_created | — | Pre-computed Connect-side org stats |

---

## 2. Vision Schema — Existing Objects Inventory

### 2.1 Operational tables (22) — migration 137
All in `vision.*` schema, RLS-enabled, org-scoped.

| Table | Purpose | Key Relationships |
|---|---|---|
| `organisations` | Org entity (hierarchy via parent_org_id) | Root entity; self-ref FK |
| `departments` | Org subdivisions | → organisations |
| `user_org_roles` | RBAC membership (user↔org↔role) | → auth.users, → organisations |
| `activities` | Org-logged activities (events, meetings, outreach, etc.) | → organisations, → departments |
| `activity_tags` | Free-form tags on activities | → activities |
| `metric_definitions` | Org-defined custom metrics (name, slug, computation_type) | → organisations |
| `vision_statements` | Org vision/mission statements | → organisations |
| `goals` | Org goals with priority_weight, deadline, target | → organisations, → vision_statements |
| `goal_activity_links` | Links activities to goals (explicit/inferred, confidence score) | → goals, → activities |
| `projects` | Org projects with status lifecycle | → organisations, → departments |
| `milestones` | Project milestones with target_date, completion | → projects |
| `project_goal_links` | Links projects to goals | → projects, → goals |
| `project_activities` | Links projects to activities | → projects, → activities |
| `advisory_templates` | Alert template definitions (type, severity) | Standalone |
| `advisory_rules` | Metric threshold rules triggering advisories | → advisory_templates |
| `advisory_outputs` | Generated advisory alerts for orgs | → organisations, → templates, → rules |
| `geo_boundaries` | GeoJSON boundaries for geographic coverage analysis | → organisations |
| `org_partnerships` | Org-to-org partnerships (status, sharing_level) | → organisations (A + B) |
| `shared_metrics` | Which metrics a partnership shares | → org_partnerships |
| `export_logs` | Audit trail of data exports | → organisations |
| `scheduled_reports` | Recurring report configurations | → organisations |
| `activity_daily_aggregates` | Pre-aggregated daily activity stats per org | → organisations |

### 2.2 Bridge tables (migrations 133-134, 138)

| Table | Purpose | Schema |
|---|---|---|
| `vision.category_space_map` | Maps Connect categories → Vision Spaces per org | vision |
| `vision.vision_period_snapshots` | Stores periodic RGRE snapshots (Growth/Retention source) | vision |
| `vision.cc_event_claims` | Claims Connect events into a Vision org (+ project/activity) | vision |
| `vision.cc_place_claims` | Claims Connect places into a Vision org | vision |

### 2.3 Aggregate views (migrations 133, 139)

| View | Type | Source | Access | Purpose |
|---|---|---|---|---|
| `vision.reach_per_event` | VIEW (SECURITY_INVOKER) | public.events + rsvps | service_role | Activity-level Reach: MAX(impressions, attending+considering+cancellations) |
| `vision.engagement_per_event` | VIEW (SECURITY_INVOKER) | public.events + rsvps + follows + reviews + broadcast_messages + event_updates | service_role | Activity-level Engagement: 6-component weighted score (0-100) |
| `vision.ratings_per_event` | VIEW | public.events + reviews | service_role | Avg rating + review count per event |
| `vision.ratings_per_place` | VIEW | public.places + reviews | service_role | Avg rating + review count per place |

### 2.4 Materialized views (migration 137)

| MV | Refresh | Purpose |
|---|---|---|
| `mv_org_activity_summary` | `refresh_org_dashboard_stats()` or manual | Activity counts by org × type × department × month |
| `mv_department_ranking` | Manual / cron | Department ranking by activity volume, participant reach, type diversity |
| `mv_goal_alignment_matrix` | Manual / cron | Per-goal alignment scores (temporal + confidence weighted) |
| `mv_boundary_activity_coverage` | `refresh_boundary_coverage()` | Geo coverage: activities within each defined boundary |
| `mv_org_dashboard_stats` | `refresh_org_dashboard_stats()` | Top-line dashboard: total activities, projects, goals, departments, members |

### 2.5 Computation functions (migration 137)

| Function | Returns | Purpose |
|---|---|---|
| `compute_org_kpis(org_id, date_from, date_to)` | JSONB | Activity count, participants reached, active departments, growth %, period comparison |
| `compute_alignment_score(goal_id)` | JSONB | Single-goal alignment: temporal-decay × type-weight × participant-normalised score |
| `compute_org_alignment(org_id)` | JSONB | Org-level alignment: priority-weighted average across all active goals |
| `compute_trend_regression(org_id, from, to, granularity)` | TABLE(slope, intercept, r², n) | Linear regression on activity counts (day/week/month buckets) |
| `search_activities_similar(org_id, query, limit)` | TABLE | Trigram fuzzy search across activity titles/descriptions |
| `search_projects_similar(org_id, query, limit)` | TABLE | Trigram fuzzy search across project names/descriptions |
| `search_goals_similar(org_id, query, limit)` | TABLE | Trigram fuzzy search across goal titles/descriptions |
| `get_org_dashboard_stats(org_id)` | TABLE | Reads mv_org_dashboard_stats with membership check |
| `refresh_org_dashboard_stats()` | void | Concurrently refreshes mv_org_dashboard_stats |
| `refresh_activity_daily_aggregates(org_id?)` | void | Full or per-org rebuild of daily aggregates |
| `refresh_activity_day(org_id, day)` | void | Single-day refresh of daily aggregates |
| `refresh_boundary_coverage()` | void | Concurrently refreshes mv_boundary_activity_coverage |

### 2.6 RBAC functions (migration 137)

| Function | Returns | Used By |
|---|---|---|
| `is_org_member(org_id)` | boolean | Almost every RLS policy |
| `is_org_admin(org_id)` | boolean | Write policies (update/delete) |
| `get_user_org_role(org_id)` | text | Manager-level policies |
| `is_platform_admin()` | boolean | Admin override in all policies |
| `is_org_or_ancestor_member(org_id)` | boolean | Tree-read policies (hierarchy) |
| `can_access_goal(goal_id)` | boolean | goal_activity_links SELECT |
| `get_org_ancestors(org_id)` | TABLE(id, depth) | Hierarchy traversal |
| `get_org_descendants(org_id)` | TABLE(id, depth) | Hierarchy traversal |
| `is_in_org_tree(root, target)` | boolean | Sub-org membership checks |
| `prevent_org_hierarchy_cycle()` | trigger | Org self-referential FK guard |

---

## 3. UI Surface → Backend Wiring Map

Each section below is one Vision UI surface. For each:
- **Reads from** = what DB objects power it
- **Writes to** = what the user can create/update from this surface
- **Calculations** = what computation transforms raw data into insight
- **Role gate** = minimum role to access
- **Status** = READY / PARTIAL / BUILD

---

### 3.1 DASHBOARD (Org Overview)

**UI destination:** Landing page after org selection. Top-line KPI cards + trend sparklines
+ recent activity feed + advisory alerts banner.

#### 3.1a — KPI Cards (top-line numbers)

| Metric | Reads From | Calculation | Status |
|---|---|---|---|
| Total Activities | `mv_org_dashboard_stats.total_activities` | Direct read | ✅ READY |
| Activities (last 30d) | `mv_org_dashboard_stats.activities_last_30d` | Direct read | ✅ READY |
| Total Participants Reached | `mv_org_dashboard_stats.total_participants` | Direct read | ✅ READY |
| Active Projects | `mv_org_dashboard_stats.active_projects` | Direct read | ✅ READY |
| Active Goals | `mv_org_dashboard_stats.active_goals` | Direct read | ✅ READY |
| Team Members | `mv_org_dashboard_stats.total_members` | Direct read | ✅ READY |
| Org Alignment Score | `compute_org_alignment(org_id)` | Priority-weighted goal alignment | ✅ READY |
| Activity Growth % | `compute_org_kpis(org_id)→activity_growth_pct` | Period-over-period comparison | ✅ READY |
| Activity Trend | `compute_trend_regression(org_id)` | slope + r² → "trending up/down/flat" | ✅ READY |

**API route:** `GET /api/vision/dashboard?org_id=<uuid>`
Calls `get_org_dashboard_stats(org_id)` + `compute_org_kpis(org_id)` + `compute_org_alignment(org_id)`.
**Role gate:** `org_member` (read-only surface).
**Status:** ✅ READY — all computation functions exist.

#### 3.1b — Connect Reach/Engagement Cards

| Metric | Reads From | Calculation | Status |
|---|---|---|---|
| Org-level Reach | `vision.reach_per_event` | SUM(reach) WHERE org_id = ? | ⚠️ BUILD — needs aggregation query/view |
| Org-level Engagement | `vision.engagement_per_event` | Weighted re-aggregation per org | ⚠️ BUILD — needs aggregation function |
| Org-level Avg Rating | `vision.ratings_per_event` | AVG(avg_rating) WHERE org_id = ? | ⚠️ BUILD — simple aggregate query |
| Growth (period) | `vision.vision_period_snapshots` | Current vs previous period reach | ❌ BUILD — needs snapshot job + growth fn |
| Retention | `vision.vision_period_snapshots` | Returning distinct persons ratio | ❌ BUILD — needs snapshot job + retention fn |

**What to build:**
1. `vision.reach_per_org(p_org_id, p_from, p_to)` — aggregates `reach_per_event` for an org/period
2. `vision.engagement_per_org(p_org_id, p_from, p_to)` — re-aggregates raw components (not scores) per org
3. `vision.growth_calendar(p_org_id, p_period_kind)` — reads period snapshots, computes % change
4. `vision.retention_rate(p_org_id, p_period_kind)` — reads snapshots, computes distinct-person return rate
5. Daily snapshot cron job (see §6.1)

#### 3.1c — Advisory Alerts Banner

| Component | Reads From | Status |
|---|---|---|
| Active alerts list | `vision.advisory_outputs WHERE org_id = ? AND dismissed = false` | ✅ TABLE READY |
| Dismiss action | UPDATE `advisory_outputs SET dismissed = true` | ✅ RLS READY |
| Alert generation | Advisory evaluation engine (cron) | ❌ BUILD — runner needed |

**What to build:**
1. `vision.evaluate_advisory_rules(p_org_id?)` — iterates `advisory_rules`, checks thresholds
   against current metric values, inserts `advisory_outputs` (respecting `cooldown_hours`).
2. Cron job to run evaluation periodically (or trigger on MV refresh).

#### 3.1d — Recent Activity Feed

| Component | Reads From | Status |
|---|---|---|
| Recent activities | `vision.activities WHERE org_id = ? ORDER BY date DESC LIMIT 10` | ✅ READY |
| Activity with tags | JOIN `vision.activity_tags` | ✅ READY |
| Linked goals badge | JOIN `vision.goal_activity_links` | ✅ READY |

**Role gate:** `org_member`.
**Status:** ✅ READY — direct table reads.

---

### 3.2 ACTIVITIES

**UI destination:** Activity log/timeline view. List, create, edit activities. Per-activity
detail with reach/engagement metrics. Bulk import.

#### 3.2a — Activity List & CRUD

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| List activities | `vision.activities` (RLS: org_member) | org_member | ✅ READY |
| Create activity | INSERT `vision.activities` | org_member (own created_by) | ✅ READY |
| Edit activity | UPDATE `vision.activities` | org_admin / creator / dept manager | ✅ READY |
| Delete activity | DELETE `vision.activities` | org_admin | ✅ READY |
| Search activities | `search_activities_similar(org_id, query)` | org_member | ✅ READY |
| Filter by type/dept/date | WHERE clauses on activities | org_member | ✅ READY |
| Tag management | INSERT/DELETE `activity_tags` | creator / org_admin | ✅ READY |

#### 3.2b — Activity Detail Metrics

| Metric | Source | Calculation | Status |
|---|---|---|---|
| Reach (this activity) | `vision.reach_per_event` WHERE event_id = claimed CC event | Direct view read | ✅ READY (for claimed events) |
| Engagement (this activity) | `vision.engagement_per_event` WHERE event_id = claimed CC event | Direct view read | ✅ READY (for claimed events) |
| Rating | `vision.ratings_per_event` WHERE event_id = claimed CC event | Direct view read | ✅ READY |
| Participant count | `vision.activities.participant_count` | Direct column | ✅ READY (manual entry) |
| Goal alignment | `compute_alignment_score(goal_id)` for linked goals | Per-linked-goal | ✅ READY |

**Note:** Activities that are manually logged (not claimed from Connect) won't have
reach/engagement/rating data from the Connect views — they only have `participant_count`.
The UI should handle both cases: Connect-linked activities get rich metrics; manual-only
activities show what was entered.

#### 3.2c — Claim Connect Events/Places

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| Search claimable events | `/api/v1/events` (public) | org_admin / org_manager | ✅ API READY |
| Claim event → org | INSERT `vision.cc_event_claims` | org_admin / org_manager | ✅ READY |
| Link claim to project/activity | UPDATE `cc_event_claims.cv_project_id/cv_activity_id` | org_admin / org_manager | ✅ READY |
| Claim place → org | INSERT `vision.cc_place_claims` | org_admin / org_manager | ✅ READY |
| View claimed events | SELECT `cc_event_claims` WHERE cv_org_id = ? | org_member | ✅ READY |

**API routes needed:**
- `GET /api/vision/claims/events?org_id=<uuid>` — list claimed events with Connect data joined
- `POST /api/vision/claims/events` — claim a Connect event
- `GET /api/vision/claims/places?org_id=<uuid>` — list claimed places
- `POST /api/vision/claims/places` — claim a Connect place

---

### 3.3 PROJECTS & GOALS

**UI destination:** Project board (kanban or list), goal tracker with alignment visualisation,
milestone timeline.

#### 3.3a — Projects

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| List projects | `vision.projects` (RLS: org_member + tree-read) | org_member | ✅ READY |
| Create project | INSERT `vision.projects` | org_member (own created_by) | ✅ READY |
| Edit project | UPDATE `vision.projects` | org_admin / creator / dept manager | ✅ READY |
| Delete project | DELETE `vision.projects` | org_admin | ✅ READY |
| Search projects | `search_projects_similar(org_id, query)` | org_member | ✅ READY |
| Link to goals | INSERT `vision.project_goal_links` | org_member | ✅ READY |
| Link to activities | INSERT `vision.project_activities` | org_member | ✅ READY |
| Milestones CRUD | `vision.milestones` | org_member (read) / role-based (write) | ✅ READY |

#### 3.3b — Goals & Alignment

| Operation | DB Object / Function | Role Gate | Status |
|---|---|---|---|
| List goals | `vision.goals` (RLS: org_member + tree-read) | org_member | ✅ READY |
| Create goal | INSERT `vision.goals` | org_admin | ✅ READY |
| Edit goal (priority_weight, deadline, target) | UPDATE `vision.goals` | org_admin | ✅ READY |
| Search goals | `search_goals_similar(org_id, query)` | org_member | ✅ READY |
| Link activity to goal | INSERT `vision.goal_activity_links` | org_admin | ✅ READY |
| Single goal alignment score | `compute_alignment_score(goal_id)` | org_member | ✅ READY |
| Org-wide alignment | `compute_org_alignment(org_id)` | org_member | ✅ READY |
| Alignment matrix (all goals) | `mv_goal_alignment_matrix` via reader fn | org_member | ✅ READY |

#### 3.3c — Vision Statements

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| List vision statements | `vision.vision_statements` | org_member | ✅ READY |
| Create/edit/delete | CRUD on `vision_statements` | org_admin | ✅ READY |
| Goals linked to vision | `vision.goals.vision_id` FK | org_member | ✅ READY |

**API routes needed:**
- `GET /api/vision/projects?org_id=<uuid>` — with milestones, linked goals
- `POST/PUT/DELETE /api/vision/projects`
- `GET /api/vision/goals?org_id=<uuid>` — with alignment scores
- `POST/PUT/DELETE /api/vision/goals`
- `GET /api/vision/alignment?org_id=<uuid>` — full alignment matrix + org score

---

### 3.4 ANALYTICS (RGRE Deep Dive)

**UI destination:** The core intelligence surface. Charts, breakdowns, period comparisons.
This is where the bulk of the missing calculations live.

#### 3.4a — Reach Analytics

| Metric | Reads From | Calculation | Status |
|---|---|---|---|
| Activity-level Reach | `vision.reach_per_event` | MAX(impressions, att+con+cancel) | ✅ READY |
| Org-level Reach (total) | `reach_per_event` aggregated | SUM(reach) for org's events | ⚠️ BUILD — aggregation view |
| Space-level Reach | `reach_per_event` + `category_space_map` | SUM grouped by Space | ❌ BUILD — needs `spaces` table |
| Reach over time | `vision_period_snapshots.reach_total` | Time series from snapshots | ❌ BUILD — needs snapshot job |
| Distinct-person Reach (v2) | rsvps ∪ follows ∪ place_follows | UNION DISTINCT count | ❌ BUILD — Tier 2 future |
| Impression→Action funnel | event_impressions → rsvps | impression / consider / attend conversion | ❌ BUILD — new |

**What to build:**
```sql
-- Org-level reach (simple aggregate)
CREATE OR REPLACE FUNCTION vision.reach_per_org(
  p_org_id UUID, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL
) RETURNS TABLE (total_reach BIGINT, event_count INT, avg_reach NUMERIC)
-- Aggregates reach_per_event for the org, optionally filtered by date range

-- Space-level reach (needs spaces table first)
CREATE OR REPLACE FUNCTION vision.reach_per_space(
  p_org_id UUID, p_space_id UUID, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL
) RETURNS TABLE (total_reach BIGINT, event_count INT, avg_reach NUMERIC)
-- Joins reach_per_event → category_space_map → filters by space

-- Citizen journey funnel (new intelligence)
CREATE OR REPLACE FUNCTION vision.activity_funnel(
  p_org_id UUID, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL
) RETURNS TABLE (
  event_id UUID, impressions INT, considering INT, attending INT,
  reviews INT, new_follows INT,
  impression_to_consider_pct NUMERIC, consider_to_attend_pct NUMERIC
)
-- For each event: impression_count, considering_count, attending_count,
-- review count, follows gained after event date → conversion percentages
```

#### 3.4b — Growth Analytics

| Metric | Reads From | Calculation | Status |
|---|---|---|---|
| Calendar Growth (reach) | `vision_period_snapshots` | (current.reach - prev.reach) / prev.reach × 100 | ❌ BUILD |
| Calendar Growth (engagement) | `vision_period_snapshots` | Same formula on engagement_score | ❌ BUILD |
| Calendar Growth (participants) | `vision_period_snapshots` | Same formula on attending_count | ❌ BUILD |
| Series Growth | `vision_period_snapshots` + recurring event detection | Previous occurrence of same category/type | ❌ BUILD |
| Activity volume growth | `compute_org_kpis()→activity_growth_pct` | Period-over-period activity count | ✅ READY |
| Trend direction | `compute_trend_regression()` | slope sign + r² confidence | ✅ READY |

**What to build:**
```sql
-- Calendar growth: compares current period to previous
CREATE OR REPLACE FUNCTION vision.calendar_growth(
  p_org_id UUID,
  p_period_kind TEXT DEFAULT 'month',  -- day/week/month
  p_space_id UUID DEFAULT NULL         -- NULL = whole org
) RETURNS TABLE (
  metric_name TEXT,          -- 'reach', 'engagement', 'participants', 'distinct_persons'
  current_value NUMERIC,
  previous_value NUMERIC,
  growth_pct NUMERIC,        -- ((curr - prev) / prev) × 100; NULL if prev = 0
  current_period_start DATE,
  previous_period_start DATE
)
-- Reads the two most recent vision_period_snapshots for the org/space/kind,
-- computes % change for each stored metric.

-- Series growth: compares to the previous occurrence of the same activity type
CREATE OR REPLACE FUNCTION vision.series_growth(
  p_org_id UUID,
  p_category_id UUID,        -- which activity type/category
  p_current_event_id UUID    -- the event to compare
) RETURNS TABLE (
  metric_name TEXT,
  current_value NUMERIC,
  previous_value NUMERIC,
  growth_pct NUMERIC,
  previous_event_id UUID
)
-- Finds the previous event with the same category_id for this org,
-- compares reach/engagement/attendance.
```

#### 3.4c — Retention Analytics

| Metric | Reads From | Calculation | Status |
|---|---|---|---|
| Period retention rate | `vision_period_snapshots` | distinct_persons(current ∩ previous) / distinct_persons(previous) | ❌ BUILD |
| Returning vs new | rsvps + follows per period | Distinct users in both periods vs only current | ❌ BUILD |
| Churn detection | rsvps + follows | Users active in prev period, absent in current | ❌ BUILD |
| Org-level retention | Aggregate across events | Weighted by reach | ❌ BUILD |

**What to build:**
```sql
-- Retention rate: what % of last period's people came back?
CREATE OR REPLACE FUNCTION vision.retention_rate(
  p_org_id UUID,
  p_period_kind TEXT DEFAULT 'month',
  p_space_id UUID DEFAULT NULL
) RETURNS TABLE (
  current_distinct INT,
  previous_distinct INT,
  returning_count INT,
  new_count INT,
  churned_count INT,
  retention_pct NUMERIC,     -- returning / previous × 100
  acquisition_pct NUMERIC,   -- new / current × 100
  churn_pct NUMERIC          -- churned / previous × 100
)
-- For the current and previous periods:
-- 1. Get distinct user sets (from rsvps + follows for org's events/profile)
-- 2. returning = intersection count
-- 3. new = current - previous
-- 4. churned = previous - current
```

#### 3.4d — Engagement Analytics

| Metric | Reads From | Calculation | Status |
|---|---|---|---|
| Activity-level Engagement | `vision.engagement_per_event` | 6-component weighted (0-100) | ✅ READY |
| Org-level Engagement | `engagement_per_event` aggregated | Re-aggregate raw components at org level | ⚠️ BUILD |
| Space-level Engagement | `engagement_per_event` + `category_space_map` | Re-aggregate grouped by Space | ❌ BUILD (needs spaces) |
| Priority-Weighted Engagement | Engagement × `goals.priority_weight` | Space scores × priority config | ❌ BUILD |
| Component breakdown | `engagement_per_event` raw columns | 6-bar chart: attending/considering/followers/reviews/broadcasts/updates | ✅ READY (data exists) |
| Engagement trend | `vision_period_snapshots.engagement_score` | Time series | ❌ BUILD (needs snapshot job) |
| Broadcast effectiveness | `broadcast_messages` + `rsvps` + `follows` | RSVPs/follows within N days after broadcast | ❌ BUILD — new intelligence |

**What to build:**
```sql
-- Org-level engagement (re-aggregation, not simple average of scores)
CREATE OR REPLACE FUNCTION vision.engagement_per_org(
  p_org_id UUID, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL
) RETURNS TABLE (
  attending_total INT, considering_total INT, followers_total INT,
  reviews_total INT, broadcasts_total INT, updates_total INT,
  engagement_score NUMERIC, event_count INT
)
-- Sums the raw components across all org events, re-applies the
-- 35/20/15/10/10/10 weights to the org-level totals (capped per-event).

-- Priority-weighted engagement
CREATE OR REPLACE FUNCTION vision.engagement_priority_weighted(
  p_org_id UUID
) RETURNS TABLE (
  space_id UUID, space_name TEXT,
  raw_engagement NUMERIC,
  priority_weight NUMERIC,
  weighted_engagement NUMERIC
)
-- For each Space:
--   1. Compute Space-level engagement (via category_space_map)
--   2. Look up the priority weight (from goals linked to Space activities)
--   3. Return raw × weight

-- Broadcast effectiveness (new intelligence)
CREATE OR REPLACE FUNCTION vision.broadcast_effectiveness(
  p_org_id UUID, p_lookback_days INT DEFAULT 90
) RETURNS TABLE (
  broadcast_id UUID, sent_at TIMESTAMPTZ, audience_size INT,
  rsvps_within_48h INT, follows_within_48h INT,
  reaction_count INT, conversion_pct NUMERIC
)
-- For each broadcast by this org:
--   audience = audience_size_at_post
--   rsvps_within_48h = RSVPs for org events created within 48h after broadcast
--   follows = new follows within 48h after broadcast
--   reactions = count of broadcast_reactions
--   conversion = (rsvps + follows) / audience × 100
```

#### 3.4e — Recency-Weighted Pulse (Tier 2)

| Metric | Source | Calculation | Status |
|---|---|---|---|
| Pulse score | All recent signals | Exponential decay on recency × event-distance tiers | ❌ BUILD |

**What to build:** Application-layer (not SQL) — near-real-time presentation math.
Reads raw counters via Supabase Realtime, applies decay function in Vision's frontend/API:
```
pulse(signal, age_hours) = signal_weight × e^(-λ × age_hours)
```
Where `λ` varies by tier: recent events (high weight, fast decay), older events
(lower weight, slower decay). This is a UI-rendering concern, not stored data.

---

### 3.5 SPACES

**UI destination:** Space configuration + per-Space analytics breakdowns.

#### 3.5a — Spaces CRUD

| Operation | What's Needed | Status |
|---|---|---|
| Create Space | `vision.spaces` table | ❌ BUILD — table doesn't exist |
| Edit Space (name, description, colour) | UPDATE `vision.spaces` | ❌ BUILD |
| Delete Space | DELETE `vision.spaces` (cascades to category_space_map) | ❌ BUILD |
| Map categories to Spaces | `vision.category_space_map` CRUD | ✅ TABLE READY |
| View Space members (categories) | SELECT `category_space_map` WHERE space_id = ? | ✅ READY |

**What to build:**
```sql
CREATE TABLE vision.spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT,
  colour      TEXT DEFAULT '#4a90d9',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX idx_spaces_org ON vision.spaces(org_id);

ALTER TABLE vision.spaces ENABLE ROW LEVEL SECURITY;
-- RLS: org_member SELECT, org_admin INSERT/UPDATE/DELETE

-- Add FK to existing tables:
ALTER TABLE vision.category_space_map
  ADD CONSTRAINT fk_csm_space FOREIGN KEY (space_id) REFERENCES vision.spaces(id) ON DELETE CASCADE;
ALTER TABLE vision.vision_period_snapshots
  ADD CONSTRAINT fk_vps_space FOREIGN KEY (space_id) REFERENCES vision.spaces(id) ON DELETE SET NULL;
```

#### 3.5b — Space Analytics (per-Space breakdown)

Once Spaces exist, every RGRE metric can be broken down by Space:

| Metric | Calculation | Dependency |
|---|---|---|
| Space Reach | `reach_per_event` JOIN `category_space_map` GROUP BY space_id | spaces table + `reach_per_space()` |
| Space Engagement | `engagement_per_event` JOIN `category_space_map` GROUP BY space_id | spaces table + `engagement_per_space()` |
| Space Growth | `vision_period_snapshots` WHERE space_id = ? | snapshot job writing per-Space rows |
| Space Retention | Same | snapshot job |
| Space comparison chart | All Spaces side-by-side | All the above |

---

### 3.6 GEOGRAPHIC COVERAGE

**UI destination:** Map view showing activity distribution within defined boundaries,
coverage gaps, and heatmap of participant reach.

| Component | Reads From | Status |
|---|---|---|
| Boundary CRUD | `vision.geo_boundaries` | ✅ READY |
| Activity markers (Vision activities) | `vision.activities` WHERE lat/lng NOT NULL | ✅ READY |
| Activity markers (claimed CC events) | `cc_event_claims` JOIN `/api/v1/events` | ✅ READY (join in app) |
| Coverage analysis | `mv_boundary_activity_coverage` | ✅ MV READY |
| Coverage refresh | `refresh_boundary_coverage()` | ✅ READY |
| Coverage level badges | `coverage_level` column: gap/low/moderate/well-covered | ✅ READY |
| Heatmap data | `activities` + `claimed CC events` lat/lng + participant_count | ✅ DATA READY (render in frontend) |

**API routes needed:**
- `GET /api/vision/geo/boundaries?org_id=<uuid>` — list with coverage stats
- `POST/PUT/DELETE /api/vision/geo/boundaries`
- `GET /api/vision/geo/coverage?org_id=<uuid>` — boundary coverage analysis
- `GET /api/vision/geo/activities?org_id=<uuid>&bounds=<bbox>` — activities in bbox

**Role gate:** `org_member` (read), `org_admin/org_manager` (boundary CRUD).
**Status:** ✅ READY — tables, MV, RLS, and refresh function all exist.

---

### 3.7 ADVISORY SYSTEM

**UI destination:** Insights/advisories panel (dashboard banner + dedicated advisories page).
Template-driven alerts that fire when metric thresholds are crossed.

#### 3.7a — Advisory Display & Management

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| View active advisories | `advisory_outputs WHERE dismissed = false` | org_member | ✅ READY |
| Dismiss advisory | UPDATE `advisory_outputs SET dismissed = true, dismissed_notes` | org_admin / org_manager | ✅ READY |
| View history | `advisory_outputs ORDER BY created_at DESC` | org_member | ✅ READY |
| Filter by severity | WHERE `severity = 'critical'/'warning'/'info'` | org_member | ✅ READY |

#### 3.7b — Advisory Configuration (Platform Admin)

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| Manage templates | CRUD on `advisory_templates` | platform_admin | ✅ READY |
| Manage rules | CRUD on `advisory_rules` | platform_admin | ✅ READY |
| Set thresholds | `advisory_rules.threshold`, `operator`, `lookback_days` | platform_admin | ✅ READY |
| Set cooldown | `advisory_rules.cooldown_hours` | platform_admin | ✅ READY |

#### 3.7c — Advisory Evaluation Engine (❌ BUILD)

**What to build:**
```sql
CREATE OR REPLACE FUNCTION vision.evaluate_advisory_rules(
  p_org_id UUID DEFAULT NULL   -- NULL = evaluate all orgs
) RETURNS INT                  -- count of new advisories generated
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
DECLARE
  v_count INT := 0;
  v_rule RECORD;
  v_metric_value NUMERIC;
  v_fires BOOLEAN;
BEGIN
  FOR v_rule IN
    SELECT r.*, t.title_template, t.body_template, t.severity AS template_severity
    FROM vision.advisory_rules r
    JOIN vision.advisory_templates t ON t.id = r.template_id
    WHERE r.active = true AND t.active = true
  LOOP
    -- For each org (or just p_org_id):
    -- 1. Compute the metric value (metric_slug → lookup against org KPIs / MV stats)
    -- 2. Apply operator + threshold
    -- 3. Check cooldown (no recent output for same rule+org within cooldown_hours)
    -- 4. If fires: INSERT advisory_output with template-substituted title/body
    -- v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
```
Plus a **cron job** (see §6.2) to run this periodically.

**Metric slug resolution** — the engine needs a way to resolve `advisory_rules.metric_slug`
to an actual value. Options:
- Hardcoded slug → query mapping in the function (simplest).
- `metric_definitions` table as the registry (more flexible, org-customisable).
Recommendation: start hardcoded for the universal metrics (reach, engagement, growth,
alignment, activity_count), add custom metric resolution later.

---

### 3.8 PARTNERSHIPS

**UI destination:** Partner management — invite orgs, manage sharing, view partner metrics.

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| List partnerships | `org_partnerships` (RLS: member of A or B) | org_member | ✅ READY |
| Invite partner | INSERT `org_partnerships` (status=pending) | org_admin | ✅ READY |
| Accept/reject | UPDATE `org_partnerships.status` | org_admin of B | ✅ READY |
| Set sharing level | UPDATE `org_partnerships.sharing_level` | org_admin of A or B | ✅ READY |
| Configure shared metrics | CRUD on `shared_metrics` | org_admin of A or B | ✅ READY |
| View partner's shared data | Read partner's metrics WHERE shared=true | org_member (limited by sharing_level) | ⚠️ BUILD — read function needed |

**What to build:**
```sql
-- Read partner's shared metrics (respects sharing_level)
CREATE OR REPLACE FUNCTION vision.get_partner_metrics(
  p_partnership_id UUID
) RETURNS JSONB
-- 1. Verify caller is member of org_a or org_b
-- 2. Get sharing_level (none/summary/detailed)
-- 3. Get shared_metrics list
-- 4. For each shared metric_slug, compute value for the OTHER org
-- 5. If sharing_level = 'summary': return totals only
--    If sharing_level = 'detailed': return breakdowns
```

**API routes needed:**
- `GET /api/vision/partnerships?org_id=<uuid>`
- `POST /api/vision/partnerships/invite`
- `PUT /api/vision/partnerships/:id` (accept/reject/sharing)
- `GET /api/vision/partnerships/:id/metrics` (partner's shared data)

---

### 3.9 REPORTS & EXPORTS

**UI destination:** Report builder, scheduled reports management, export history.

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| Export to CSV/PDF/PNG | INSERT `export_logs` + generate file | org_member | ⚠️ BUILD — generation logic needed |
| View export history | SELECT `export_logs` | org_member | ✅ READY |
| Create scheduled report | INSERT `scheduled_reports` | org_admin | ✅ READY |
| Edit/delete scheduled report | UPDATE/DELETE `scheduled_reports` | org_admin | ✅ READY |
| List scheduled reports | SELECT `scheduled_reports` | org_member | ✅ READY |
| Report delivery | Email with PDF/CSV attachment | — | ❌ BUILD — delivery engine |

**What to build:**
1. **Export generation function** (app layer): accepts report_config JSONB, queries the
   relevant views/functions, renders to CSV/PDF/PNG. Can use `pdf-lib` (already in Connect
   for funder reports) or a dedicated report renderer.
2. **Scheduled report cron** (see §6.3): checks `scheduled_reports WHERE active AND next_run_at <= now()`,
   generates the report, delivers via email (Supabase Edge Function + Resend/SendGrid),
   updates `last_sent_at` and computes `next_run_at`.

**API routes needed:**
- `POST /api/vision/export` — trigger export, return download URL
- `GET /api/vision/exports?org_id=<uuid>` — export history
- `GET/POST/PUT/DELETE /api/vision/reports` — scheduled report CRUD

---

### 3.10 SETTINGS & CONFIGURATION

**UI destination:** Org settings panel — org profile, Spaces, Priorities, custom metrics, timezone.

| Setting | DB Object | Role Gate | Status |
|---|---|---|---|
| Org profile (name, logo, description) | UPDATE `vision.organisations` | org_admin | ✅ READY |
| Org hierarchy (parent org) | UPDATE `organisations.parent_org_id` | org_admin | ✅ READY (cycle-prevention trigger) |
| Department CRUD | `vision.departments` | org_admin | ✅ READY |
| Spaces CRUD | `vision.spaces` | org_admin | ❌ BUILD (table owed) |
| Category→Space mapping | `vision.category_space_map` | org_admin | ✅ READY |
| Custom metric definitions | `vision.metric_definitions` CRUD | org_admin | ✅ READY |
| Goal priorities | `vision.goals.priority_weight` | org_admin | ✅ READY |
| Timezone | `public.profiles.timezone` (via Connect profile) | org_admin | ✅ READY |

---

### 3.11 TEAM MANAGEMENT

**UI destination:** Team member list, invite, role assignment, department assignment.

| Operation | DB Object | Role Gate | Status |
|---|---|---|---|
| List team members | `vision.user_org_roles` (RLS: org_member) | org_member | ✅ READY |
| Invite member (assign role) | INSERT `user_org_roles` | org_admin | ✅ READY |
| Change member role | UPDATE `user_org_roles.role` | org_admin | ✅ READY |
| Assign to department | UPDATE `user_org_roles.department_id` | org_admin | ✅ READY |
| Remove member | DELETE `user_org_roles` | org_admin (or self-remove) | ✅ READY |
| Bootstrap (first admin) | INSERT with `role='org_admin'` when no roles exist for org | authenticated (self) | ✅ READY (bootstrap policy) |
| View member's title/founder status | `user_org_roles.title`, `.is_founder` | org_member | ✅ READY |

**Status:** ✅ FULLY READY.

---

## 4. New Intelligence Functions (Beyond Original Spec)

These leverage Connect data that the RGRE spec didn't fully exploit.
All are org-type-agnostic — they work for any organisation.

### 4.1 Citizen Journey Funnel
```
Impression → Consider → Attend → Review → Follow
```
**Source:** `event_impressions` → `rsvps(considering)` → `rsvps(attending)` → `reviews` → `follows`
**Value:** "72% of people who saw your event considered it, 40% attended, 15% reviewed, 8% followed you"
**Applies to:** Any org that runs events — the universal conversion metric.

### 4.2 Cross-Pollination Index
```
Are citizens discovering NEW orgs/categories over time?
```
**Source:** For each citizen: distinct org_ids they've engaged with (rsvps+follows) per period.
**Calculation:** Average new-org-discovery rate across citizens engaging with this org.
**Value:** Measures "de-scattering" — the core Citizens mission. "Your events introduced
45 citizens to orgs they'd never engaged with before."

### 4.3 Community Network Graph
```
Which orgs share audiences? Who could collaborate?
```
**Source:** For org pairs: count of citizens who've engaged with both (mutual attendees + followers).
**Value:** "You and Grace Foundation share 23 community members — consider partnering."
Feeds into the partnerships feature naturally.

### 4.4 Category Health / Diversity
```
Is the city's Kingdom activity balanced across categories?
```
**Source:** Events per category, attendance distribution, category coverage by geography.
**Value:** Platform-level insight (platform_admin view): "Pretoria has 47 worship events but
only 2 youth events — there's a gap the community should fill."

### 4.5 Dormancy / Churn Early Warning
```
Which previously active orgs/citizens have gone quiet?
```
**Source:** Last activity date per org (from events.created_at, broadcast_messages.created_at).
**Calculation:** Days since last activity; flag if > threshold (e.g., 60 days).
**Value:** "3 contributors haven't posted events in 60+ days" — early intervention signal.

### 4.6 Volunteer Supply/Demand
```
Where are volunteer needs vs available volunteers?
```
**Source:** `places.volunteer_openings` (demand) + `volunteer_applications` (supply).
**Value:** "5 organisations need youth volunteers but only 2 applied this month."

### 4.7 Community Self-Organisation Pipeline
```
Ideas → Votes → Threshold → Events
```
**Source:** `suggestions` (idea_status lifecycle) + `idea_votes` + `associated_event_id`.
**Value:** "The community successfully self-organised 4 events from ideas this quarter."

---

## 5. Display Convention: Counts Beside Percentages (#8)

Every backend function that returns a ratio MUST also return its numerator and denominator.

**Pattern:**
```sql
-- WRONG: returns only percentage
SELECT 92.0 AS retention_pct

-- RIGHT: returns all three
SELECT 11 AS returning_count, 12 AS previous_count, 91.67 AS retention_pct
-- Frontend renders: "92% (11/12)"
```

This is already implemented in:
- `reach_per_event` — returns impression_count, attending_count, considering_count, cancellation_count alongside reach
- `engagement_per_event` — returns all 6 raw components alongside engagement_score
- `vision_period_snapshots` — stores all count columns

Must be applied to every new function in §3.4 and §4.

---

## 6. Cron Jobs & Scheduled Processes

### 6.1 Daily Snapshot Job (CRITICAL — unblocks Growth + Retention)

**Purpose:** Populate `vision.vision_period_snapshots` once per org-day.
**Schedule:** Runs hourly; for each org, checks if org-local midnight has passed since
the last snapshot; if yes, computes and inserts the snapshot.
**Mechanism:** pg_cron calling a Postgres function (consistent with existing cron jobs 1-10).

```sql
CREATE OR REPLACE FUNCTION vision.run_daily_snapshots()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = vision, public, pg_catalog AS $$
DECLARE
  v_org RECORD;
  v_org_now TIMESTAMPTZ;
  v_today DATE;
  v_yesterday DATE;
BEGIN
  -- For each org that has a Connect profile with timezone
  FOR v_org IN
    SELECT DISTINCT csm.org_id, p.timezone
    FROM vision.category_space_map csm
    JOIN profiles p ON p.id = csm.org_id
  LOOP
    v_org_now := now() AT TIME ZONE COALESCE(v_org.timezone, 'Africa/Johannesburg');
    v_today := v_org_now::date;
    v_yesterday := v_today - 1;

    -- Skip if yesterday's snapshot already exists
    IF EXISTS (
      SELECT 1 FROM vision.vision_period_snapshots
      WHERE org_id = v_org.org_id AND period_kind = 'day'
        AND period_start = v_yesterday AND space_id IS NULL
    ) THEN CONTINUE; END IF;

    -- Compute and insert whole-org snapshot for yesterday
    INSERT INTO vision.vision_period_snapshots (
      org_id, space_id, period_kind, period_start, period_end,
      reach_total, impression_count, attending_count, considering_count,
      cancellation_count, engagement_score, distinct_persons, active_events
    )
    SELECT
      v_org.org_id, NULL, 'day', v_yesterday, v_yesterday,
      COALESCE(SUM(r.reach), 0),
      COALESCE(SUM(r.impression_count), 0),
      COALESCE(SUM(r.attending_count), 0),
      COALESCE(SUM(r.considering_count), 0),
      COALESCE(SUM(r.cancellation_count), 0),
      COALESCE(AVG(e_eng.engagement_score), 0),
      -- distinct_persons: count distinct users across rsvps+follows for this org's events on this day
      (SELECT COUNT(DISTINCT u) FROM (
        SELECT rsvp.user_id AS u FROM rsvps rsvp
        JOIN events ev ON ev.id = rsvp.event_id
        WHERE ev.created_by = v_org.org_id AND ev.date = v_yesterday
        UNION
        SELECT f.follower_id FROM follows f WHERE f.followee_id = v_org.org_id
      ) sub),
      COUNT(r.event_id)
    FROM vision.reach_per_event r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN vision.engagement_per_event e_eng ON e_eng.event_id = r.event_id
    WHERE r.org_id = v_org.org_id AND e.date = v_yesterday;

    -- TODO: also insert per-Space snapshots (iterate category_space_map groups)
  END LOOP;
END;
$$;

-- Register cron (hourly check, resolves per-org midnight internally)
-- SELECT cron.schedule('vision-daily-snapshots', '15 * * * *',
--   $$SELECT vision.run_daily_snapshots()$$);
```

### 6.2 Advisory Evaluation Cron

**Purpose:** Run `evaluate_advisory_rules()` periodically to generate new advisories.
**Schedule:** Every 6 hours (advisory rules have `cooldown_hours` for dedup).
**Mechanism:** pg_cron.

```sql
-- SELECT cron.schedule('vision-advisory-eval', '0 */6 * * *',
--   $$SELECT vision.evaluate_advisory_rules()$$);
```

### 6.3 Scheduled Report Delivery Cron

**Purpose:** Check `scheduled_reports` for due reports, generate and deliver.
**Schedule:** Every hour (check `next_run_at <= now()`).
**Mechanism:** Supabase Edge Function (needs email sending + PDF generation — beyond what
pg_cron can do alone). The Edge Function reads due reports, generates them, sends via
email API, updates `last_sent_at` / `next_run_at`.

### 6.4 MV Refresh Cron

**Purpose:** Keep materialized views current.
**Schedule:** Every 2 hours for dashboard stats; daily for alignment matrix + boundary coverage.
**Mechanism:** pg_cron.

```sql
-- SELECT cron.schedule('vision-mv-refresh-frequent', '30 */2 * * *', $$
--   SELECT vision.refresh_org_dashboard_stats();
--   SELECT vision.refresh_activity_daily_aggregates();
-- $$);
-- SELECT cron.schedule('vision-mv-refresh-daily', '0 3 * * *', $$
--   SELECT vision.refresh_boundary_coverage();
--   REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_goal_alignment_matrix;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_department_ranking;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_org_activity_summary;
-- $$);
```

---

## 7. API Routes Summary

All Vision API routes live under `/api/vision/` in the Vision app (separate from Connect's `/api/`).
Auth: Bearer JWT (same Supabase auth as Connect — shared `auth.users`).
The `vision` schema must be added to PostgREST "Exposed schemas" first.

| Route | Method | Purpose | Role | Priority |
|---|---|---|---|---|
| `/api/vision/dashboard` | GET | Dashboard KPIs + Connect metrics + alerts | org_member | P0 |
| `/api/vision/activities` | GET/POST/PUT/DELETE | Activity CRUD + search | org_member+ | P0 |
| `/api/vision/activities/:id/metrics` | GET | Per-activity reach/engagement/rating | org_member | P0 |
| `/api/vision/claims/events` | GET/POST | Claim Connect events | org_admin | P0 |
| `/api/vision/claims/places` | GET/POST | Claim Connect places | org_admin | P1 |
| `/api/vision/projects` | GET/POST/PUT/DELETE | Project CRUD + milestones | org_member+ | P0 |
| `/api/vision/goals` | GET/POST/PUT/DELETE | Goal CRUD + alignment | org_admin | P0 |
| `/api/vision/alignment` | GET | Alignment matrix + org score | org_member | P0 |
| `/api/vision/analytics/reach` | GET | Reach breakdown (org/space/time) | org_member | P0 |
| `/api/vision/analytics/engagement` | GET | Engagement breakdown + components | org_member | P0 |
| `/api/vision/analytics/growth` | GET | Growth (calendar + series) | org_member | P1 |
| `/api/vision/analytics/retention` | GET | Retention rate + churn | org_member | P1 |
| `/api/vision/analytics/funnel` | GET | Citizen journey funnel | org_member | P1 |
| `/api/vision/analytics/trends` | GET | Trend regression | org_member | P1 |
| `/api/vision/analytics/broadcast` | GET | Broadcast effectiveness | org_member | P2 |
| `/api/vision/spaces` | GET/POST/PUT/DELETE | Spaces CRUD | org_admin | P0 |
| `/api/vision/geo/boundaries` | GET/POST/PUT/DELETE | Boundary CRUD + coverage | org_admin | P1 |
| `/api/vision/geo/coverage` | GET | Coverage analysis | org_member | P1 |
| `/api/vision/advisories` | GET/PUT | Advisory list + dismiss | org_member+ | P1 |
| `/api/vision/partnerships` | GET/POST/PUT | Partnership CRUD | org_admin | P2 |
| `/api/vision/partnerships/:id/metrics` | GET | Partner shared metrics | org_member | P2 |
| `/api/vision/export` | POST | Trigger export | org_member | P2 |
| `/api/vision/exports` | GET | Export history | org_member | P2 |
| `/api/vision/reports` | GET/POST/PUT/DELETE | Scheduled report CRUD | org_admin | P2 |
| `/api/vision/team` | GET/POST/PUT/DELETE | Team member CRUD | org_admin | P0 |
| `/api/vision/settings` | GET/PUT | Org settings | org_admin | P0 |
| `/api/vision/search` | GET | Cross-entity search (activities, projects, goals) | org_member | P1 |

---

## 8. Build Order (Critical Path)

### Phase A — Foundation (unblocks all UI pages)
1. **`vision.spaces` table** + RLS + FK wiring → unblocks Space-level analytics
2. **Identity bridge** (organisations ↔ profiles) → unblocks Connect data in Vision context
3. **PostgREST exposure** of `vision` schema → unblocks all authenticated API access
4. **Core API routes**: dashboard, activities, projects, goals, team, settings, claims

### Phase B — Intelligence Engine (the calculations)
5. **Daily snapshot cron job** → unblocks Growth + Retention
6. **Org/Space reach + engagement aggregation functions**
7. **Growth + Retention calculation functions**
8. **Advisory evaluation engine + cron**
9. **Priority-weighted engagement function**
10. **MV refresh cron jobs**

### Phase C — Deep Analytics (competitive advantage)
11. **Citizen journey funnel** function
12. **Broadcast effectiveness** function
13. **Cross-pollination index** (new intelligence)
14. **Dormancy/churn detection** function
15. **Community network graph** data

### Phase D — Operational Features
16. **Export generation** (CSV/PDF)
17. **Scheduled report delivery** (Edge Function + email)
18. **Partner metric sharing** function
19. **Recency-weighted Pulse** (frontend math)

---

## 9. Open Decisions

| # | Question | Options | Impact |
|---|---|---|---|
| 1 | Identity bridge method | (a) `organisations.cc_profile_id` column, (b) bridge table, (c) unify | Affects every Connect→Vision query |
| 2 | Vision app framework | (a) Separate Next.js, (b) module in Connect, (c) standalone HTML like Connect | Affects where API routes + crons live |
| 3 | Snapshot job mechanism | (a) pg_cron, (b) Supabase Edge Function, (c) external scheduler | pg_cron is simplest (already used) |
| 4 | Advisory metric resolution | (a) Hardcoded slug→query map, (b) `metric_definitions` registry | Start hardcoded, extend later |
| 5 | Scheduled report email | (a) Supabase Edge Function + Resend, (b) external service | Depends on Supabase plan |
| 6 | goals.status — add 'achieved'? | Currently CHECK allows draft/active/completed/archived only | `mv_org_dashboard_stats.achieved_goals` is always 0 |

---

*Generated 2026-06-18. Companion to Citizens_Vision_Backend_Architecture.md.*
*Verified against live DB (project xyiajtrvhlxaeplsiajj, head migration 141).*
