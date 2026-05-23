# Citizens Connect — Project Status

> Living document. Update after completing each phase or major milestone.
> Full batch history and per-batch validation logs live in `git log`.

## MASTER_DIRECTION Execution (current)

The single source of truth is [.github/MASTER_DIRECTION.md](.github/MASTER_DIRECTION.md).

| Batch | Scope | Status | Notes |
|-------|-------|--------|-------|
| place-panel-fix | Place detail side-panel + image upload RLS + cover-image remove | **Shipped** `aba287a` | PlaceDetailServer RSC; @panel intercepted route; fix_place_images_rls migrations (094+095); is_admin() on places UPDATE/DELETE; removeImage state; label rename. 714 tests. |
| polish-2 | Polish Queue rows 4–5 (places-browse-and-follow + notifications): SQL aggregate RPC; row 5(a) re-deferred | **Shipped** | Migration 094 `get_user_places_with_stats` (file-only, security invoker + `auth.uid()`). `/api/manage/places` refactored. 714 tests. |
| polish-1 | Polish Queue rows 1–3 (onboarding column drop, event-detail metadata cache, profile UUID guards) | **Shipped** `10b4816` | Migration 093 (file-only, idempotent). 714 tests. |
| 14h | Audit fix — P1 notifications + P2 map-core | **Shipped** `01ec87a` + `ff4d9f5` | NotificationBell optimistic revert; LocationPicker AbortController + privacy disclosure. 714 tests. |
| QP1 | Quick-search panel: tab-gated tiles + city chips + proximity sort | **Shipped** `11372b9` | +11 tests. 714 tests total. |
| 1 | Admin panel restructure (FEAT-01 + D15) | **Shipped** | `/admin` dashboard, `/admin/applications` canonical, `/admin/contributors` redirect. 656 tests. |
| 1b | Re-file (archive agents, rewrite copilot-instructions, VISION, README; create FUTURE_IDEAS + .env.example + RUNBOOK) | **Shipped** | Root MASTER_DIRECTION deleted; 11 agent files archived to docs/archive/. |
| 2 | Legacy cleanup + FEAT-02 minimal calendar + BUG-06 advisor fix | **Shipped** | Removed FullCalendar (5 pkgs); added GlassCalendar; migration 065. 656 tests. |
| 3 | FEAT-03 Organisation Profiles & Discovery | **Shipped** | pg_trgm contributor search; `/api/contributors/search`; OrgSearchPanel. Migrations 066/067/068. 668 tests. |
| 4 | FEAT-04 Consider → Convince (`convinces` table) | **Shipped** `a99366d` | New `convinces` table + RLS; `/api/convince`; notify triggers; migrations 069+070. 677 tests. |
| 5 | FEAT-05 Broadcast Updates polish + retroactive migration 030 apply | **Shipped** | EventUpdatesList realtime + DELETE; migration 071. 682 tests. |
| 6 | Extended profiles schema + `content_labels` + monorepo folder prep | **Shipped** `a6d9f1f` | Migrations 072–078. 682 tests. |
| 7a | Staged audit fixes (middleware-and-session + api-surface) | **Shipped** | `redirectWithCookies`; admin-review hardening; rate limits across 9 routes. 683 tests. |
| 7b | Closing deferred DECISIONS items (DB-only) | **Shipped** | Migration 079 provinces FK; migration 080 uuid array check. 683 tests. |
| 8 | FEAT-06 contributor billing foundation | **Shipped** | Migrations 081+082; `contributor_billing` table; `get_my_billing_context()` RPC; `BillPreviewCard`. 683 tests. |
| 9 | Admin Tier B (audit log + rate limits + glass scaffold) | **Shipped** `e6c1df6` | Migration 083 `audit_log`; `requireAdmin`/`logAdminAction`; CategoryManager scaffold. |
| 10 | Admin batch 2 — 8 audit fixes + ConfirmModal a11y + audit-policy | **Shipped** `be0cb77` | ConfirmModal; `/api/admin/categories`; CategoryManager API; `ConfirmModal`; 697 tests. |
| 11 | BUG: Admin contributor approvals 500 | **Shipped** `cf9e00b` | Migration 084 rewrites RPCs to use `data` jsonb; edge function v3; NotificationPanel `data.url`. |
| 12 | BUG: Contributor approve/reject still 500 + Delete control | **Shipped** | Migration 085 widens `notifications.type` CHECK; `delete_contributor_application` RPC. 697 tests. |
| 14a | Audit P1 rsvp-and-comments — CRITICAL safe_rsvp IDOR | **Shipped** `fa1ac6b` | Migrations 086+087; RSVPButton error surfacing; +3 tests. 704 tests. |
| 14b | Audit P1 storage-and-media-uploads — SVG XSS + ProfileEditor RLS | **Shipped** `bc83f3c` | SVG dropped from upload allowlist; ProfileEditor avatar path fixed. 703 tests. |
| 14c | Audit P1 auth-and-signup — filter injection + open redirect | **Shipped** `e38fca5` | PostgREST filter injection allowlist; `safeRedirect()`. 703 tests. |
| 14d | Audit P1 edge-functions — push fan-out attending-only | **Shipped** `7fba70d` | `.eq("status","attending")` across 3 edge functions; `event_reminders` pref parity. 703 tests. |
| 14e | Audit P2 event-create-edit — boundary validation + delete error | **Shipped** `71c9085` | EventForm/EditEventForm boundary guards; handleDelete surfaces RLS errors. 703 tests. |
| 14f | Audit P1 place-create-edit-media — length CHECKs + 6-month delete trigger | **Shipped** `2906189` | Migrations 088–091; CommentSection delete errors surfaced. 703 tests. |
| 14g | Audit P2 messaging-dm — `.maybeSingle()` parity + rate-limit + NaN guard | **Shipped** `94dc675` | 5× `.single()` → `.maybeSingle()`; NaN-safe `?limit=`; PATCH /read rate-limit. 703 tests. |
| 13 | Map perf — basemap pruner + MapTiler Lite checklist + DOM marker culling | **Shipped** | `pruneBasemapLayers`; `cullMarkers`; `docs/MAP_TILER_LITE_CHECKLIST.md`. 701 tests. |
| 1–10 | Earlier batches (FEAT-01..06, Batches 1–10) | All **Shipped** | See git log for full details. |

---

## Phase Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Data Foundation | **Complete** |
| 2 | App Shell | **Complete** |
| 3 | Full-Screen Map | **Complete** |
| 4 | Calendar | **Complete** |
| 5 | Reviews & Verification | **Complete** |
| 6 | Capacitor Mobile | **Complete** |
| 7 | Event Enrichment & Discovery | **Complete** |
| 8 | Social Graph | **Complete** |
| 9 | Interest Profile & Onboarding | **Complete** |
| 8.5 | Role Refactor & UX Polish | **Complete** |
| — | Architect Audit Fixes (P8–9) | **Complete** |
| 10 | Smart Notifications + Calendar Sync | **Complete** |
| 11 | In-app Direct Messaging | **Complete** |
| — | UI Maturity Overhaul | **Complete** |
| — | UI Refinement Pass | **Complete** |
| — | Map & Brand Polish | **Complete** |
| — | UX Bug Fixes + Quality Hardening | **Complete** |
| 12A | Security Hardening | **Complete** |
| 12B | Featured Panel | **Complete** |
| 12C | Live Location Foundation | **Complete** |
| — | Phase 12 Architect Review Fixes | **Complete** |
| — | Auth Hardening Sprint | **Complete** |
| — | Category Icons & Media Galleries | **Complete** |
| Batch S | Category Refinement v2 (taxonomy + Lucide icons + Weekend tag) | **Complete** |
| Batches C–Q | Map clustering (3-tier model), admin hardening, media galleries | **Complete** |
| Batch N | Multi-venue contributor profiles + 6-org seed (migration 060–062) | **Complete** |
| Batches 1–14h | MASTER_DIRECTION audit + feature batches | **Complete** |

---

## Current Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 App Router (RSC) |
| Language | TypeScript 5.x |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (Auth + Postgres + Storage + Edge Functions) |
| Maps | MapLibre GL JS 5.x + MapTiler Cloud |
| Mobile | Capacitor 8.x |
| Testing | Vitest + Testing Library (714 tests) |
| Deployment | Vercel |
| Roles | `citizen` / `contributor` (kind: ministry \| organization \| business) / `admin` |
