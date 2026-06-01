# Map Navigation Surfaces — inspection & close-behaviour map

> Purpose: one place to reason about every "window" that can open over the map
> (`/events`, `EventsView.tsx`), how each opens, how each closes, and where the
> surfaces have historically collided ("X reopens the panel / surfaces get
> confused"). Built 2026-05-31 while fixing the image-upload + panel-close bugs.

## The two kinds of overlay

There are **two independent open mechanisms** over the map. The bugs all came
from these two getting out of sync:

| # | Mechanism | What it is | State / driver | z-index |
|---|-----------|------------|----------------|---------|
| A | **Inline glass cards** | `EventPreviewCard`, `PlacePreviewCard` (Figma glass) | React state in `EventsView`: `selectedEvent` / `selectedPlace` | `z-1200` |
| B | **Intercepted route panel** | `SidePanel` drawer rendering `/events/[id]`, `/places/[id]`, `/profile/[id]`, `/c/[slug]`, `/messages/...` | The URL + the `@panel` parallel-route slot (`src/app/@panel/(.)…`) | `z-1700` |

Key point: **A is state, B is the router.** Closing one does **not** close the
other unless we explicitly keep them in sync.

## Surface inventory (over the map)

| Surface | Open trigger | Close trigger(s) | Driver | z |
|---------|--------------|------------------|--------|---|
| EventPreviewCard | marker click → `handleSelectEvent` | its X → `closeDetail`; Esc; selecting a place | `selectedEvent` | 1200 |
| PlacePreviewCard | marker click → `handleSelectPlace` | its X → `closeDetail`; Esc | `selectedPlace` | 1200 |
| SidePanel (detail) | "View" action / deep link → `router.push('/events/[id]')` → `@panel` intercept | header **Back** (`router.back`), header **X** (`router.push(fallback)`), backdrop, Esc | URL / `@panel` slot | 1700 |
| MapFiltersPanel | Filters pill | its X → `setMapFiltersOpen(false)`; Esc | `mapFiltersOpen` | glass |
| MapLayersPanel | Layers pill | its X; Esc | `mapLayersOpen` | glass |
| Burger / Filters drawer | burger | `setFiltersOpen(false)`; Esc | `filtersOpen` | drawer |
| GlassCalendar | calendar pill | `closeCalendar`; Esc | `calendarOpen` | overlay |

Esc precedence is centralised in `EventsView.tsx` (`handleEscape`, ~line 329):
layers → filters → burger → calendar → detail cards. The SidePanel has its own
Esc handler (it's a route, not EventsView state).

## The collisions (and current status)

### 1. "X reopens the side panel" — FIXED ✅
**Cause:** the **View** action (`handleQuickAction` case `"view"`) did
`router.push('/events/[id]')` to open the SidePanel (B) but left `selectedEvent`
(A) set. So the glass card stayed mounted at z-1200 *under* the SidePanel at
z-1700. Closing B revealed A (and vice-versa) → "X reopens the panel".
**Fix:** `"view"` now clears `selectedEvent`/`selectedPlace` **before**
`router.push`, so only one surface is ever open. (`EventsView.tsx`.)

### 2. Marker image square-in-circle — FIXED ✅
Unrelated to nav; logo marker img was `80%/contain`. Now `100%/cover` so it
fills the gold ring (`src/lib/map/markers.ts`).

### 3. SidePanel close "bugs out / feels stuck" — MITIGATED, watch ⚠️
Historically a **leaked `inert`** on a `<body>` child froze the map (icons don't
appear / events won't open). `SidePanel.tsx` already:
  - tags every frozen node `data-cc-inert-by-panel` and sweeps strays on the
    next open (belt-and-suspenders against interrupted navigations);
  - on **X** (`handleDismiss`) animates out then `router.push(fallbackHref)` —
    a clean forward nav to `/events` that discards the panel depth and restores
    the live map (this matches the founder's ask: "clear history, restore touch,
    continue on the map").
  - on **Back** (`handleBack`) pops a single intercepted step.

This should now behave. If "stuck" recurs, the prime suspects, in order:
  1. An `inert` that wasn't swept — check `document.querySelectorAll('[inert]')`
     in devtools after a close; anything on a `<body>` child is the culprit.
  2. The 300 ms close animation racing a fast re-open (double-tap). The
     `animateThen` timeout is fixed at 300 ms.
  3. A nested intercept (`/events/[id]` → `/profile/[id]`) where `router.back`
     unwinds only one level but the user expected a full close — prefer the **X**
     (full dismiss) over **Back** for "get me out".

### Hardening applied (2026-06-01) ✅
- **SidePanel X also clears EventsView card state.** A tiny singleton bus
  (`src/lib/map/panelBus.ts`, mirrors `easterEggs/bus`) — `handleDismiss`
  publishes `publishPanelClosed()`, `EventsView` subscribes and runs
  `closeDetail()`. Removes the last way surfaces A and B can desync on a
  deep-linked / nested panel.
- **Close hand-off is driven by `transitionend`, not a fixed timer.**
  `animateThen` listens for the drawer's `transform` `transitionend` before
  navigating, with a guarded 400 ms fallback (reduced motion / unmounted node /
  `display:none`). A slow device can no longer navigate mid-animation.

## Quick mental model
- **Card open** = a piece of React state (`selectedEvent`/`selectedPlace`).
  Close it by nulling the state (`closeDetail`).
- **Panel open** = a URL (`/events/[id]`) caught by the `@panel` slot. Close it
  by navigating away (`router.back` / `router.push('/events')`).
- **Never have both open at once.** Opening the panel must first close the card.
