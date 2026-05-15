# Citizens Connect — Cross-Sphere Project Status Report

> **Snapshot date:** 2026-05-14
> **Branch / HEAD:** `origin/main` @ `d8bc5b0` (docs after Batch S3)
> **Last shipping commit:** `07bb294` — Batch S3 (Weekend derived tag, chip, and filter)
> **Purpose:** Owed end-of-session report covering Product, Engineering, Database, Mobile, Content/Community, Outstanding roadmap, and Continuity. Docs-only; no code or schema changes in this batch.

---

## 1. Product

### Identity & Vision (unchanged)
- Flagship channel of the Citizens ecosystem — map-first community discovery.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- Serves organisers and non-organisers equally; open to non-Christians.
- Roles: individual, ministry, organization, business, contributor (approved), admin.
- See `.github/VISION.md` and `/memories/repo/citizens-ecosystem-vision.md`.

### Shipped product surfaces (all live)
- **Discovery:** full-screen map view (MapLibre GL, MapTiler vector style) + calendar view (FullCalendar day/week/month), shared floating controls, filter drawer, free-text search, free-tier geocoding.
- **Events:** create / edit / cancel, RSVP + "Consider", comments, ratings (inline 5-star), share (WhatsApp/Facebook/native/copy), tags (≤5 per event), indemnity gate before creation, quota banner for non-contributors.
- **Places:** create / edit / delete (contributor+admin), follow/unfollow, reviews, multi-venue contributor locations.
- **Social graph:** follows / friends (bidirectional), public profiles, who's attending (with friend badges), Instagram/Facebook/TikTok profile links.
- **Messaging:** 1:1 conversations from event detail / profile, realtime delivery, unread badge, 2 000-char message cap.
- **Notifications:** in-app bell + dropdown, push tokens stored, realtime Supabase subscription, instant/daily/off digest preference. (FCM/APNs delivery itself still pending — see §7.)
- **Onboarding & profile:** interest wizard (groups → items), location + radius, social links, indemnity acceptance, terms acceptance gate.
- **Manage dashboards:** My Events tabs (Created / Joined), My Places, attendee / consider / view counts.
- **Admin:** category CRUD, tag moderation (official / hidden), contributor application inbox, role elevation with admin approval queue.
- **Security & auth:** email + phone OTP login, Google OAuth, account linking, 2FA via SMS, account deletion, CSP/HSTS/security headers, rate limiting, RLS-first.

### Newest shipped batches (last ~10 days, in order)
| Batch | Commit | Theme |
|-------|--------|-------|
| Batch R | (squashed earlier) | Category icons + media galleries (shared SVG registry, place media RLS) |
| Batch S1 | `8fbd2ce` | Refined event taxonomy to 17 event + 10 place categories |
| Batch S1.1 | `fbb418c` + `449dfe4` + `5e11c2c` | Architect Should-fixes + drift coverage tests + DB migration 064 applied |
| Batch S2 | `6798590` + `e315422` | Lucide-aligned category icon registry redraw |
| Batch S3 | `07bb294` + `d8bc5b0` | Weekend derived tag (`isWeekendEvent`), `<WeekendChip />`, BurgerMenu "Weekend only" filter |

### Product-level open questions / strategic
- **Phase 18 — Content Diversity & Media** is the next major user-facing value driver (multi-photo event galleries, place image upload wiring).
- **Phase 19 — Vendor / Organiser Analytics** is the next retention play for contributors.
- **Phase 22 — Push Delivery** is the next engagement multiplier (everything below the push layer is built).
- No active strategic ambiguity. All in-flight UX questions from S1 (entertainment slug, MCP outage) closed.

---

## 2. Engineering

### Stack snapshot
- Next.js 15 App Router (RSC by default), TypeScript strict.
- Supabase (Postgres + Auth + Storage + Edge Functions + Realtime), dual-client SSR pattern.
- MapLibre GL JS + MapTiler Cloud vector style (UUID `019dba0f-…be8`, env-driven).
- Tailwind CSS v4 (no `tailwind.config`; `@theme inline` in `globals.css`).
- Capacitor 6 wrapper for iOS + Android (single codebase).
- Vitest + Testing Library; Architect subagent in CI loop.

### Health at HEAD (`d8bc5b0`)
| Gate | Status |
|------|--------|
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` | **653 pass / 2 pre-existing baseline failures** in `EventDetailContent.test.tsx` (RSVP branches stale because `baseEvent.date` is in the past) |
| `npx next lint --dir src` | **clean** (deprecation warning only; non-blocking) |
| Architect audit | Grade **A** on Batch S3 across architecture, API, security, performance, a11y, code quality |
| Supabase advisors | unchanged from pre-S3 baseline (no schema changes in S3) |
| Vibe-security audit | clean across all batches D → S3 |

### Notable engineering invariants (do not violate)
- Never call `e.stopPropagation()` on MapLibre marker DOM — breaks popup toggle wiring. Use `SKIP_COLLAPSE_SELECTOR` target inspection in the canvas click handler instead (Batch Q DECISIONS).
- All client map components dynamic-import with `ssr: false` — MapLibre needs WebGL/`window`.
- `await params` in Next 15 dynamic routes — params is a Promise.
- Public buckets do not need broad SELECT policies on storage objects; rely on table-backed gallery metadata (`event_photos`, `place_media`).
- Calendar `eventDidMount` always writes the native `title` attribute (event title, or `"<title> — Weekend"` when applicable) so FullCalendar DOM recycling can't strand stale suffixes (S3 Should-fix).
- `personalization/percentages.ts` weekend→`conferences-summits` mapping is **deliberately a no-op** now that `isWeekendEvent()` exists (S3 invariant).

### CI / repo hygiene
- One protected branch (`main`). Quality pipeline enforced per `.github/copilot-instructions.md` → "Default session workflow" and `/memories/quality-pipeline.md`.
- Per-batch commit pattern: implementation commit → docs commit (`PROJECT_STATUS` + `DECISIONS` + `RESUME_HERE`).
- Memory pointers under `/memories/repo/batch-*.md` keep continuity across context windows.

---

## 3. Database

### Live schema (HEAD)
- 25+ tables: `profiles`, `events`, `rsvps`, `comments`, `categories`, `places`, `reviews`, `follows`, `event_photos`, `place_media`, `event_views`, `push_tokens`, `notifications`, `place_follows`, `conversations`, `conversation_participants`, `messages`, `event_tags`, `event_tag_assignments`, `indemnity_templates`, `indemnity_signatures`, `contributor_applications`, `contributor_locations`, `featured_listings`, `admin_actions`, `pending_admin_elevations`, `event_reminders`, `user_locations`, plus auth-side `auth.users`.
- Strict RLS on every public table; admin override via `public.is_admin()`.
- `category_id` FK populated via `sync_event_category_id` trigger; text `category` retained for legacy reads (Phase 21 sweep still pending).
- Storage buckets `event-images` and `place-images` (public), uploads namespaced under `${user.id}/`.

### Migrations applied (latest five)
| File | Purpose |
|------|---------|
| 060 | `contributor_locations` table (multi-venue support) |
| 061 | Seed: 6 real-world contributor orgs + 30 events |
| 062 | Tighten `contributor_locations` (split FOR ALL → INSERT/UPDATE/DELETE policies + lat/long CHECKs) |
| 063 | Batch S1 — 17 event + 10 place categories |
| 064 | Batch S1.1 — fix-ups applied via MCP after deferred apply |

### Standing advisor baseline (unchanged since Batch E/F/G)
- **ERROR** ×2 — `security_definer_view` on `directory_contributors`; `rls_disabled_in_public` on `app_settings`.
- **WARN** ×~16 — `function_search_path_mutable` across `is_admin`, `trending_events`, `safe_rsvp`, `cleanup_stale_locations`, `is_approved_contributor`, `generate_contributor_slug`, `approve_contributor_application`, `reject_contributor_application`, `find_conversation`, `update_conversation_timestamp`, `is_organiser`, `sync_event_category_id`, `protect_role_column`, `find_or_create_conversation`, `count_friends`, `handle_new_user`. Fix is mechanical: `SET search_path = public` on each.
- **WARN** `public_bucket_allows_listing` on `place-images`.
- **WARN** `auth_leaked_password_protection` — Supabase Dashboard toggle, not code.

No new advisor delta introduced by Batches S1 → S3.

### Database open items (deferred)
- Phase 21: full UI migration off text `category` → `category_id` FK; `rsvp_with_capacity_check` RPC; friend-count RPC.
- Migration 061 `DISABLE TRIGGER USER` workaround → replace with `SECURITY DEFINER admin_set_profile_role(uuid, text)` helper (portability).
- `contributor_locations.updated_at` + trigger; `CHECK (length(label) > 0)`.

---

## 4. Mobile (Capacitor)

### Status
- iOS + Android projects committed under `ios/` and `android/`.
- Capacitor 6, Java 17, Gradle current. `capacitor.config.ts` wired to `https://*` server URL when set, otherwise bundled web build.
- Native plugins integrated: Share, Push Notifications (token registration only), Camera, Filesystem (planned), Geolocation.
- Single web codebase — no platform-specific React.

### Mobile open items (Phase 22 + 23)
- **Phase 22 — Push Delivery:** Firebase Cloud Messaging (FCM) + APNs configuration; `_shared/push.ts` currently writes notification rows but does **not** invoke FCM/APNs. Edge Functions deployable but not yet on a cron schedule in production.
- **Phase 23 — Store Readiness:** Universal Links (`apple-app-site-association` + `assetlinks.json`), 1024 px branded icons, store screenshots (iPhone + iPad + Play feature graphic), descriptions / keywords, privacy policy URL, Supabase production auth Site URL + Redirect URLs.

---

## 5. Content / Community

### Taxonomy (Batches S1 → S3)
- **17 event categories** (final): church-services, social-gatherings, education-equipping, care-recovery, mens-fellowship, womens-fellowship, marriage-couples, kids-family, youth-young-adults, music-arts, missional-outreach, prayer-worship, conferences-summits, retreats, sports-recreation, business-marketplace, other.
- **10 place categories** (final): church, ministry-base, community-centre, retreat-centre, school-college, market, cafe-eatery, bookshop-resource, counselling-care, other.
- Lucide-aligned shared SVG icon registry across map markers, cards, BurgerMenu, EventForm.
- Derived **Weekend** tag (Fri ≥17:00 UTC, Sat any, Sun any) — UTC-deterministic, 366-day defensive guard, exposed as `isWeekendEvent()`, rendered as gold-outline `<WeekendChip />`, filterable from BurgerMenu, AND-combined with category filters, bypassed during free-text search.

### Brand / UX
- 60/30/10 white / black / gold visual system codified in `.github/instructions/connect-ui-system.instructions.md`.
- Full-screen map / calendar as the primary surface; floating glass-panel controls.
- Indemnity templates: 4 seeded (`platform-terms-v1`, `organiser-event-liability`, `attendee-participation-waiver`, `venue-listing-waiver`).
- Terms acceptance gate is a global blocking modal in root layout (a11y-hardened: focus trap, scroll lock, autofocus, aria-describedby).

### Community open items
- Phase 19 organiser analytics (engagement metrics for contributors).
- Phase 20 social graph expansion (followers/following pages, mutual friends, friend suggestions).
- Progressive profiling fallback after first RSVP if user skipped onboarding (Phase 9 deferred).

---

## 6. Outstanding Roadmap (priority-ordered)

| Phase | Theme | Why next |
|-------|-------|----------|
| **Phase 18** | Content Diversity & Media | Biggest user-facing visual upgrade — multi-photo galleries on events + place image upload wiring. Buckets and table metadata already exist. |
| **Phase 21** | Database & Performance | `rsvp_with_capacity_check` RPC (atomic capacity), friend-count RPC, full `category_id` UI sweep, index audit. Foundational stability before scaling. |
| **Phase 20** | Social Graph Expansion | Followers/following pages, mutual friends, suggestions. Community depth + retention. |
| **Phase 19** | Analytics & Organiser Tools | VendorAnalytics dashboard, event performance comparison, attendee CSV export. Contributor retention. |
| **Phase 22** | Push Notification Delivery | FCM + APNs wiring, Edge Function deploys, cron schedules. Engagement multiplier. |
| **Phase 23** | Mobile Store Readiness | Universal Links, branded icons, store assets, production auth config. Distribution. |
| **Phase 25+** | Ecosystem Readiness | Shared identity layer across Citizens Wear / Central / Impact; cross-app deep links. Long-term vision. |

### Smaller deferred items (logged for next-touch opportunity)
- **EventDetailContent test failures (×2)** — pre-existing baseline; bump `baseEvent.date` to future or mock `Date.now()`. (Queued as Batch 2 in current session.)
- **S2 nice-to-haves** — delete or test unused `getIconBySlug`; split mixed-intent `QUICK_ACCESS_ICON_IDS`; harmonise helper fallback IDs (`church` vs `pin`).
- **S3 nice-to-haves** — `role="switch"` + `aria-checked` on Weekend toggle; `useCallback` on `onToggleWeekend`; inline Weekend chip icon as JSX SVG (drop one `dangerouslySetInnerHTML`).
- **Contributor admin-notification email** — DB webhook on `INSERT INTO contributor_applications` (Resend + HMAC) or pg_cron sweep. Edge Function `submit-contributor-application` may already exist; verify and wire.
- **Refactor:** extract `useClusterExpansion` hook from `EventMap.tsx` (file is 1500+ LoC with five interlocking refs).
- **Tests to add (Architect Should-fix #5 from Batch E/F/G):** admin role-elevation queueing path, pending-elevations admin guard, contributor setup flow.

---

## 7. Continuity

### Recovery / resume protocol
1. Read [RESUME_HERE.md](RESUME_HERE.md) first — always current within ~1 batch.
2. Cross-check `/memories/repo/batch-*.md` for the most recent invariants (latest: `batch-s3-weekend-tag-shipped.md`).
3. Follow `/memories/quality-pipeline.md` for the per-batch quality gate procedure.
4. Architecture orientation: `.github/instructions/project-architecture.instructions.md` (file map) → `.github/instructions/connect-ui-system.instructions.md` (UI rules) → `.github/instructions/maplibre-maps.instructions.md` (MapLibre patterns) → `.github/instructions/supabase-patterns.instructions.md` (data layer).
5. Standing decisions log: `.github/DECISIONS.md`.

### Windows-specific reminders
- Always prepend `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` to every terminal command.
- Use `;` not `&&` in PowerShell.
- `create_file` fails on existing paths — `Remove-Item -Force` first when re-writing.

### Project IDs / env
- **Supabase project:** `xyiajtrvhlxaeplsiajj` (URL: `https://xyiajtrvhlxaeplsiajj.supabase.co`).
- **MapTiler style:** UUID `019dba0f-b49b-73bb-bf6a-f9d820f43be8` (env-driven, fallback OSM raster).
- **Default map centre:** Pretoria, South Africa `[-25.7479, 28.2293]`.
- **Citizens Network identity:** `citizensnetworkpbo@gmail.com` for git commit author.

### Risks worth surfacing
- Push delivery infrastructure (FCM/APNs) is the largest unfinished piece between "feature complete" and "production retention loop running". Notifications are stored and surfaced in-app, but devices are not yet receiving real pushes.
- Two ERROR-level Supabase advisors (`security_definer_view`, `rls_disabled_in_public` on `app_settings`) remain at baseline — both pre-existing, scoped, and documented, but worth resolving before any production launch.
- `EventMap.tsx` size (>1500 LoC, 5 interlocking refs) is the largest single source of cognitive load in the codebase. Refactor to `useClusterExpansion` hook is queued but not yet booked into a batch.

---

## 8. Bottom line

Citizens Connect at `d8bc5b0` is **feature-complete across Phases 1 → 17**, with Batches S1 → S3 closing the taxonomy + iconography + weekend-discovery refinement loop. The product is internally usable end-to-end (browse → discover → RSVP → consider → message → review → manage). The remaining roadmap is dominated by **delivery infrastructure** (push, app stores) and **organiser-side depth** (analytics, social graph expansion, content galleries) rather than missing user-facing primitives. The quality gate is intact, advisors are stable at baseline, and continuity artefacts (`RESUME_HERE.md`, batch memory files, DECISIONS log) are current.

The next-most-valuable batch to ship is **Phase 18 — Content Diversity & Media** for user-facing payoff, or **Phase 22 — Push Delivery** for retention payoff. Both have all prerequisites in place.
