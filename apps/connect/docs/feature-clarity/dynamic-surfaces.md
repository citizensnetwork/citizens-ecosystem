# Dynamic Surfaces & Entity Properties

**Citizens Connect — May 2026**

---

## The Core Question

> "If I change a setting in one area, should it automatically change in all areas? Or do I have to manually update every surface?"

The answer should always be: **change it once, it propagates everywhere**. This document maps where we are, where the gaps are, and how we close them.

---

## Part 1: What We Already Have (The Good)

### Entity IDs

Every entity already has a stable UUID primary key:

| Entity | Table | PK column |
|--------|-------|-----------|
| User / Profile | `profiles` | `id` (mirrors `auth.users.id`) |
| Event | `events` | `id` |
| Place | `places` | `id` |
| Conversation | `conversations` | `id` |
| Notification | `notifications` | `id` |

These IDs are the anchors for all feature checks, RLS policies, and deep links.

---

### User Properties (DB-driven)

The `profiles` table stores all user-level capabilities and settings as columns:

| Column | Type | Purpose |
|--------|------|---------|
| `role` | `text` | `citizen` / `contributor` / `admin` — gates creation, admin access |
| `contributor_kind` | `text` | `ministry` / `organization` / `business` — governs contributor UI labels |
| `contributor_status` | `text` | `pending` / `approved` / `rejected` — controls approval gating |
| `billing_tier` | `text` | `free` / `pro` etc — future feature gating |
| `location_sharing` | `boolean` | Whether user shares live location |
| `notification_prefs` | `jsonb` | Per-type notification opt-in/out |
| `preferences` | `jsonb` | Free-form user preferences bag |
| `bio_setup_required` | `boolean` | Forces bio setup flow before first use |
| `needs_re_review` | `boolean` | Admin flag requiring contributor re-review |

These are **correct** — a user's role is stored once and the whole app reads from it.

---

### Event Properties (DB-driven)

The `events` table stores all event-level state:

| Column | Type | Purpose |
|--------|------|---------|
| `status` | `text` | `published` / `cancelled` / `draft` |
| `visibility` | `text` | `public` / `private` |
| `attendees_visible` | `text` | `public` / `authenticated` / `none` |
| `community_contributor` | `boolean` | True = created by a Citizen (not a Contributor) |
| `category` | `text` | Slug linking to event category |

---

## Part 2: Where Things Break Down (The Gap)

### Problem A: DB property defined, DB column missing

**Real example: `visibility`** — the type `EventVisibility` existed in `db.ts`, the UI dropdown was built, but the `visibility` column was never applied to the DB (migration `027` existed locally but was skipped). Result: every save of an event edit threw `Could not find the 'visibility' column in schema cache`.

**Fix applied (May 2026):** Migration `027_event_visibility` applied.

### Problem B: DB property exists but guards are inconsistent across surfaces

**Real example: `community_contributor` badge** — The `community_contributor` boolean is correctly stored in the DB. But the *display guard* ("only show this badge on events NOT created by a Contributor") was applied in `EventsView.tsx` and `EventDetailContent.tsx` but NOT in `EventCard.tsx`. So the same event rendered the badge on the list/card view but not on the detail panel.

**Fix applied (May 2026):** `EventCard.tsx` guard updated to match the other two surfaces.

**Root cause of B:** There is no single function/hook that computes `shouldShowCommunityBadge(event)`. The logic is duplicated inline across 3+ components. When one gets updated, the others drift.

### Problem C: "Labels" are not universally dynamic

Some UI labels and conditions are DB-driven (role, status, visibility). Others are coded as string constants that require a developer change to update. Example: contributor chip labels (`"Community-organised"` / `"Contributor"`) are hard-coded in `ContributorChip.tsx`. This is fine for immutable product vocabulary, but problematic for things like badge names, tier labels, or feature flags that an admin should be able to change without a deploy.

---

## Part 3: The Fix Strategy

### Layer 1: DB is always the source of truth

Every property that affects UI behaviour, access control, or feature availability must be a DB column (or JSONB key within a structured column). Types in `db.ts` must exactly mirror the DB schema — if the column doesn't exist in the DB, remove it from the type until the migration is applied.

**Rule:** Before adding a property to a TypeScript type, apply the migration first.

---

### Layer 2: Centralise display logic — no inline duplication

Every entity-property → display-decision mapping should live in one place and be imported everywhere.

**Pattern: event capability utilities** (`src/lib/events/capabilities.ts`)

```ts
// Single source of truth for all "should we show X for this event?" decisions
export function isCommunityEvent(event: Event): boolean {
  return !!event.community_contributor && event.creator?.role !== "contributor";
}

export function isPrivateEvent(event: Event): boolean {
  return event.visibility === "private";
}

export function canEditEvent(event: Event, userId: string): boolean {
  return event.created_by === userId;
}
```

**Pattern: user capability utilities** (`src/lib/profiles/capabilities.ts`)

```ts
export function isApprovedContributor(profile: Profile): boolean {
  return profile.role === "contributor" && profile.contributor_status === "approved";
}

export function isAdmin(profile: Profile): boolean {
  return profile.role === "admin";
}
```

Components import these utilities. When the logic changes, it changes in one file and every surface picks it up.

---

### Layer 3: Platform-level feature flags (future)

For features that should be togglable by an admin without a deploy, add an `app_settings` table (we already have one from `037_community_event_rate_limit.sql`). This is the right place for:

- Toggling whole features on/off (e.g. `messaging_enabled`, `learn_module_enabled`)
- Setting thresholds (rate limits, max attendees defaults)
- Enabling beta features for specific user roles

```sql
-- Already exists in the DB:
-- table: app_settings (key text PK, value jsonb)
-- Example rows:
-- { key: 'community_event_rate_limit', value: { max: 1, window_days: 30 } }
```

An admin UI can update these rows. Edge Functions and API routes read them. UI can optionally read them via a context provider loaded at app start.

---

## Part 4: Immediate Gaps to Address

| # | Gap | Location | Priority |
|---|-----|----------|----------|
| 1 | No `src/lib/events/capabilities.ts` — logic duplicated inline | EventCard, EventsView, EventDetailContent, EventMap | High |
| 2 | No `src/lib/profiles/capabilities.ts` — `isAdmin`, `isContributor` etc. duplicated | Multiple API routes and components | Medium |
| 3 | `EventForm.tsx` sends `visibility` on insert — verify it now works post-migration | EventForm line 330 | ✅ Fixed by migration |
| 4 | `app_settings` reads not centralised — each feature reads its own key | API routes | Low |
| 5 | No admin UI for `app_settings` flags | Admin panel | Low |

---

## Part 5: Answers to Your Questions

**"Are our labels in table form, ie boolean DB columns?"**

Yes, for the important ones — `role`, `visibility`, `status`, `community_contributor`, `contributor_status`, `billing_tier`. Some cosmetic labels (`"Community-organised"` text) are still hardcoded in components, which is acceptable for fixed vocabulary.

**"If something is deactivated in one area, should it de-activate in another?"**

Yes — that is the correct design. The DB column is the off/on switch. Every surface reads it. The current gap is that the *reading logic is duplicated* across surfaces rather than imported from a shared utility. Layer 2 above closes this.

**"Can we assign IDs to users and places?"**

We already have them — UUID primary keys on every entity. Every user is `profiles.id`, every place is `places.id`, every event is `events.id`. These are used today for RLS policies, deep links, and API routes. What we should build on top of them is the capability utilities (Layer 2) and platform flags (Layer 3) described above.

**"Is our UI dynamic or hardcoded?"**

Mostly dynamic, with specific gaps. The architecture is correct (DB → API → component). The bug you found (visibility column missing, community badge inconsistent) came from two failure modes:
1. A migration that existed locally but was never applied.
2. Display logic duplicated across components without a shared utility.

Both are now patched. Layer 2 prevents them recurring.

---

## Next Action Items

1. **Create `src/lib/events/capabilities.ts`** — extract `isCommunityEvent`, `isPrivateEvent`, `canEditEvent`, `isLiveEvent` from inline usage.
2. **Create `src/lib/profiles/capabilities.ts`** — extract `isApprovedContributor`, `isAdmin`, `canCreateEvents`.
3. **Audit all inline `event.community_contributor` checks** — replace with `isCommunityEvent(event)`.
4. **Add a type-check CI rule** — `npx tsc --noEmit` must pass before every push; type drift (type without DB column) is caught immediately.

---

*Written after Batch fixing visibility migration + EventCard badge guard drift — May 24, 2026.*
