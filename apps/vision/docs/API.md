# Citizens Vision — API Documentation

## Authentication

All API routes require authentication via Supabase Auth (PKCE flow). Include cookies from the browser session — the Supabase SSR client extracts the JWT automatically.

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signout` | Sign out current user |
| GET | `/auth/callback` | PKCE code exchange callback |

---

## Organisations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orgs` | List organisations for current user |
| POST | `/api/orgs` | Create new organisation |
| GET | `/api/orgs/[id]` | Get organisation detail |
| PATCH | `/api/orgs/[id]` | Update organisation |

### Query Parameters (GET /api/orgs)
None — returns all orgs the authenticated user is a member of.

### Request Body (POST /api/orgs)
```json
{
  "name": "string (required, 2-100 chars)",
  "slug": "string (required, 2-50 chars, lowercase alphanumeric + hyphens)",
  "description": "string (optional, max 500 chars)"
}
```

---

## Activities

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/activities` | List activities with filters |
| POST | `/api/activities` | Create new activity |
| GET | `/api/activities/[id]` | Get activity detail |
| PATCH | `/api/activities/[id]` | Update activity |
| DELETE | `/api/activities/[id]` | Delete activity |

### Query Parameters (GET /api/activities)
| Param | Type | Description |
|-------|------|-------------|
| `org_id` | UUID | Required — organisation scope |
| `type` | string | Filter by activity type |
| `department_id` | UUID | Filter by department |
| `search` | string | Full-text search |
| `from` | date | Start date (YYYY-MM-DD) |
| `to` | date | End date (YYYY-MM-DD) |
| `cursor` | string | Pagination cursor |
| `limit` | number | Items per page (default 20, max 100) |

### Request Body (POST /api/activities)
```json
{
  "org_id": "UUID (required)",
  "title": "string (required, 2-200 chars)",
  "description": "string (optional)",
  "type": "meeting | workshop | outreach | survey | training | report | event | other",
  "date": "YYYY-MM-DD (required)",
  "department_id": "UUID (optional)",
  "latitude": "number (optional, -90 to 90)",
  "longitude": "number (optional, -180 to 180)",
  "impact_score": "number (optional, 0-100)",
  "participants": "number (optional, >= 0)",
  "tags": "string[] (optional)"
}
```

---

## Departments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/departments` | List departments for org |
| POST | `/api/departments` | Create department |
| PATCH | `/api/departments/[id]` | Update department |
| DELETE | `/api/departments/[id]` | Delete department |

---

## Goals & Alignment

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals` | List goals for org |
| POST | `/api/goals` | Create goal |
| GET | `/api/goals/[id]` | Get goal detail with alignment data |
| PATCH | `/api/goals/[id]` | Update goal |
| DELETE | `/api/goals/[id]` | Delete goal |
| GET | `/api/goals/alignment` | Get alignment scores for all goals |

---

## Projects & Milestones

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects for org |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/[id]` | Get project detail |
| PATCH | `/api/projects/[id]` | Update project |
| DELETE | `/api/projects/[id]` | Delete project |
| GET | `/api/projects/[id]/milestones` | List milestones |
| POST | `/api/projects/[id]/milestones` | Create milestone |
| GET | `/api/projects/[id]/goals` | List project-goal links |
| GET | `/api/projects/[id]/activities` | List project activities |

---

## Metrics & Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/metrics/overview` | Dashboard KPI summary |
| GET | `/api/metrics/trends` | Time-series trend data |
| GET | `/api/metrics/comparison` | Side-by-side period comparison |
| GET | `/api/metrics/regression` | Trend regression analysis |
| GET | `/api/metrics/cross-org` | Cross-org partner metrics |

### Common Query Parameters
| Param | Type | Description |
|-------|------|-------------|
| `org_id` | UUID | Required — organisation scope |
| `from` | date | Start date |
| `to` | date | End date |
| `granularity` | string | `day`, `week`, or `month` |

---

## Timeline

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timeline` | Chronological activity stream |

---

## Map

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/map/activities` | Geo-located activities for map |
| GET | `/api/map/boundaries` | Boundary GeoJSON data |

---

## Advisory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/advisory` | List advisories for org |
| GET | `/api/advisory/[id]` | Get advisory detail |
| POST | `/api/advisory/generate` | Trigger advisory generation |

---

## Vision

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vision` | Get org vision statement |
| POST | `/api/vision` | Create/update vision |

---

## Boundaries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/boundaries` | List geo-boundaries |
| POST | `/api/boundaries` | Create boundary |
| GET | `/api/boundaries/[id]` | Get boundary detail |
| PATCH | `/api/boundaries/[id]` | Update boundary |
| DELETE | `/api/boundaries/[id]` | Delete boundary |

---

## Citizens Connect Integration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connect/events` | List synced CC events |
| GET | `/api/connect/events/[id]` | Get CC event detail |
| GET | `/api/connect/places` | List synced CC places |
| GET | `/api/connect/places/[id]` | Get CC place detail |
| POST | `/api/connect/sync` | Trigger CC sync |

---

## Export & Reports

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/export` | Export data as CSV |
| GET | `/api/reports` | List scheduled reports |
| POST | `/api/reports` | Create scheduled report |
| GET | `/api/reports/[id]` | Get report detail |
| PATCH | `/api/reports/[id]` | Update report |
| DELETE | `/api/reports/[id]` | Delete report |

---

## Federation & Partnerships

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/partnerships` | List org partnerships |
| POST | `/api/partnerships` | Create partnership request |
| GET | `/api/partnerships/[id]` | Get partnership detail |
| PATCH | `/api/partnerships/[id]` | Update partnership |
| DELETE | `/api/partnerships/[id]` | Delete partnership |
| GET | `/api/shared-metrics` | List shared metric configs |
| POST | `/api/shared-metrics` | Create shared metric config |

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (validation failed) |
| 401 | Not authenticated |
| 403 | Forbidden (no access to resource) |
| 404 | Resource not found |
| 500 | Internal server error |

---

## Rate Limiting

Rate limiting is handled at the infrastructure level (Vercel + Supabase).

## Multi-Tenant Isolation

All data queries are scoped to the authenticated user's organisation membership via PostgreSQL Row-Level Security (RLS). Cross-org data access is only possible through explicitly configured partnerships.
