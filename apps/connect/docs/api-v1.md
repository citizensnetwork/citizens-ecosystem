# Citizens Connect — Public API v1

Read-only public directory endpoints that power the Citizens ecosystem
(Citizens Central and other channels). All responses return a
consistent envelope:

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

## Stability policy

- Additive changes (new fields, new endpoints) are **not** a breaking
  change. Consumers must tolerate unknown fields.
- Removal or type changes bump the path prefix (`/api/v2/...`).
- `role`, `contributor_kind`, `contributor_slug`, `id` are guaranteed
  to be present on every contributor payload.
