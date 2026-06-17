# Citizens Connect — Public API v1

Read-only public directory endpoints that power the Citizens ecosystem
(Citizens Central and other channels).

> **This API is the cross-app contract.** Sibling Citizens apps (Vision, Wear, …) consume
> Connect's commons data through these endpoints — **never** Connect's raw tables. See
> [`docs/SHARED_DB_CONTRACT.md`](./SHARED_DB_CONTRACT.md) Rule 2 for why, and the stability
> policy at the bottom of this file for what counts as a breaking change.

All responses return a consistent envelope:

```json
{ "data": ... , "meta": { ... } }
```

Error responses:

```json
{ "error": "human readable message" }
```

Rate limits:

- Anonymous: **60 requests / minute / IP** per endpoint.
- With a valid API key: **600 requests / minute / key** by default; per-key overrides available.
- Per-resource secondary cap (anonymous only): 120 req/min/slug on detail endpoints, so a rotating-IP DoS can't target a single contributor.

Cache headers (`s-maxage=60, stale-while-revalidate=120`) are set so CDN edges and polling consumers don't hammer the origin.

Authentication (optional): pass an API key via either header:

```
Authorization: Bearer cck_live_...
X-API-Key: cck_live_...
```

API keys start with `cck_live_` and are minted via the `create_api_key`
Supabase RPC (admins or approved contributors). Keys can be scoped
(currently only `read:public`) and revoked via `revoke_api_key`. The raw
token is shown exactly once at creation; only its SHA-256 hash is
stored. Provide no header to stay on the anonymous tier.

These endpoints surface only approved, public-facing data (contributors
with `contributor_status = 'approved'`, events with `visibility = 'public'`
and `status = 'published'`).

---

## GET /api/v1/contributors

Directory of approved contributors.

### Query parameters

| Param    | Type    | Default | Notes                                     |
| -------- | ------- | ------- | ----------------------------------------- |
| `kind`   | enum    | —       | `ministry` \| `organization` \| `business` |
| `q`      | string  | —       | Case-insensitive match on name / bio      |
| `limit`  | integer | 50      | 1..100                                    |
| `offset` | integer | 0       | 0..10000                                  |

### Example response

```json
{
  "data": [
    {
      "id": "…uuid…",
      "full_name": "Rooted Pretoria",
      "role": "contributor",
      "contributor_kind": "ministry",
      "contributor_slug": "rooted-pretoria",
      "bio": "…",
      "avatar_url": null,
      "logo_url": "https://…",
      "website_url": "https://…",
      "instagram_handle": "rootedpta",
      "facebook_url": null,
      "tiktok_handle": null,
      "youtube_url": null,
      "physical_address": "…",
      "physical_latitude": -25.7479,
      "physical_longitude": 28.2293,
      "created_at": "2026-…"
    }
  ],
  "meta": { "count": 42, "limit": 50, "offset": 0 }
}
```

---

## GET /api/v1/contributors/{slug}

Full public view of a single contributor by vanity slug, with upcoming
and past events plus places they own.

### Example response

```json
{
  "data": {
    "profile": { "id": "…", "full_name": "…", ... },
    "upcoming_events": [ { "id": "…", "title": "…", "date": "…", ... } ],
    "past_events":     [ ... ],
    "places":          [ { "id": "…", "name": "…", "latitude": -25.…, ... } ],
    "counts": {
      "followers": 128,
      "events_total": 12,
      "places_total": 3
    }
  },
  "meta": { "generated_at": "2026-…" }
}
```

404 when the slug does not resolve to an approved contributor.

### Fan-out caps

Per-contributor responses cap events at **100 upcoming** and
**100 past**, and places at **100**, to keep the payload bounded.
Ecosystem consumers needing the full history should paginate against
a future `/api/v1/contributors/{slug}/events?before=…` endpoint.

---

## GET /api/v1/contributors/{slug}/stats

Public counts for a single approved contributor, derived only from
public data. Never exposes demographics, `event_views`, or private
events. Backed by the `get_contributor_public_stats` RPC, which returns
`null` for non-approved contributors.

```json
{
  "data": {
    "total_events": 12,
    "upcoming_events": 4,
    "total_rsvps": 318,
    "followers": 128
  },
  "meta": { "generated_at": "2026-…" }
}
```

`400` when the slug is missing, `404` when it does not resolve to an
approved contributor. A per-slug secondary rate cap applies (anonymous
tier) so a rotating-IP client cannot single out one contributor.
Cached `s-maxage=60, stale-while-revalidate=120`.

---

## GET /api/v1/events

Paginated feed of published public events.

### Query parameters

| Param         | Type    | Default | Notes                                           |
| ------------- | ------- | ------- | ----------------------------------------------- |
| `category`    | slug    | —       | Event category slug (e.g. `worship`)            |
| `from`        | ISO-8601| —       | Earliest event date (inclusive)                 |
| `to`          | ISO-8601| —       | Latest event date (inclusive)                   |
| `lat`, `lng`  | number  | —       | Centre point for proximity filter               |
| `radius_km`   | integer | 25      | 1..500, only used when `lat`+`lng` present      |
| `created_by`  | uuid    | —       | Filter to one contributor                       |
| `limit`       | integer | 50      | 1..100                                          |
| `offset`      | integer | 0       | 0..10000                                        |

Only `status = 'published'` AND `visibility = 'public'` events are
returned. Draft, private and cancelled events are never exposed.

### Example

```bash
curl "https://citizens-connect.app/api/v1/events?category=worship&lat=-25.7479&lng=28.2293&radius_km=15"
```

```json
{
  "data": [
    {
      "id": "…uuid…",
      "title": "Night of Worship",
      "date": "2026-03-12T18:30:00+00:00",
      "end_time": null,
      "location": "Pretoria CBD",
      "category": "worship",
      "image_url": "https://…",
      "latitude": -25.7479,
      "longitude": 28.2293,
      "created_by": "…uuid…",
      "community_contributor": false
    }
  ],
  "meta": { "count": 17, "limit": 50, "offset": 0 }
}
```

---

## GET /api/v1/events/{id}

Full public view of a single event with aggregated stats.

```json
{
  "data": {
    "id": "…",
    "title": "Night of Worship",
    "description": "…",
    "date": "2026-…",
    "stats": {
      "going": 128,
      "considering": 34,
      "views": 2104,
      "average_rating": 4.7,
      "review_count": 22
    }
  },
  "meta": { "generated_at": "2026-…" }
}
```

404 when the event does not exist, is private, or is not published.

---

## GET /api/v1/places

Public, read-only directory of places (venues, churches, creative
spaces…). Places have no draft/private lifecycle like events — the
`places` RLS policy permits public SELECT, so every place is
intentionally public here.

### Query parameters

| Param        | Type    | Default | Notes                                       |
| ------------ | ------- | ------- | ------------------------------------------- |
| `created_by` | uuid    | —       | Owning contributor (`places.created_by`)    |
| `q`          | string  | —       | Case-insensitive match on name / description |
| `limit`      | integer | 50      | 1..100                                      |
| `offset`     | integer | 0       | 0..10000                                    |

Each row flattens its category into `category` (slug) +
`category_emoji` / `category_color`, so a map can colour pins without a
second round-trip. `category` is `null` for places using a free-text
`custom_category`.

```json
{
  "data": [
    {
      "id": "…uuid…",
      "name": "Rooted House",
      "description": "…",
      "address": "Pretoria CBD",
      "custom_category": null,
      "image_url": "https://…",
      "phone": "…",
      "website": "https://…",
      "latitude": -25.7479,
      "longitude": 28.2293,
      "created_by": "…uuid…",
      "verified": true,
      "volunteer_openings": 2,
      "category": "creative",
      "category_emoji": "🎨",
      "category_color": "#c8a24f"
    }
  ],
  "meta": { "count": 40, "limit": 50, "offset": 0 }
}
```

Cached `s-maxage=60, stale-while-revalidate=120`.

---

## GET /api/v1/categories

Lists event/place categories plus a denormalised `event_count` per slug.

### Query parameters

| Param        | Type | Default | Notes                                   |
| ------------ | ---- | ------- | --------------------------------------- |
| `applies_to` | enum | —       | `events` \| `places` \| `both`          |

```json
{
  "data": [
    {
      "id": "…",
      "name": "Worship",
      "slug": "worship",
      "emoji": "🎵",
      "color": "#c8a24f",
      "applies_to": "both",
      "sort_order": 4,
      "event_count": 32
    }
  ],
  "meta": { "count": 8 }
}
```

Cached for 5 minutes at the edge (`s-maxage=300`).

---

## GET /api/v1/analytics/community

Platform-wide aggregated analytics (no PII). Individual contributor
analytics stay private; only `org_id IS NULL` rows are returned here.

### Query parameters

| Param    | Type    | Default | Notes                              |
| -------- | ------- | ------- | ---------------------------------- |
| `metric` | string  | —       | Filter to a single `metric_key`    |
| `days`   | integer | 30      | Lookback window, 1..365            |

```json
{
  "data": [
    { "day": "2026-03-11", "metric_key": "events_published", "metric_value": 14 }
  ],
  "meta": { "days": 30, "from": "2026-02-10", "to": "2026-03-12" }
}
```

Cached for 5 minutes at the edge.

---

## Stability policy

- Additive changes (new fields, new endpoints) are **not** a breaking
  change. Consumers must tolerate unknown fields.
- Removal or type changes bump the path prefix (`/api/v2/...`).
- `role`, `contributor_kind`, `contributor_slug`, `id` are guaranteed
  to be present on every contributor payload.
