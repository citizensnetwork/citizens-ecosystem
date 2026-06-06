# Old UI artifacts — to delete at the END of the Figma UI transformation

> Founder directive (2026-06-04): we are replacing the ENTIRE old UI/navigation with
> Figma's. Per the rule of thumb, every old visual/navigational element that Figma
> provides an equivalent for must eventually be **deleted** — keeping none of the old.
> This file tracks the remaining old artifacts so that, once all phases are reskinned,
> we can do a single confident cleanup sweep. **Do NOT delete these ad-hoc mid-phase** —
> only when their Figma replacement is in place and verified.

## ✅ Already removed
- **Old `@panel` side-drawer system** — `src/app/@panel/**`, `SidePanel.tsx`,
  `lib/map/panelBus.ts`, the `panel` slot in `layout.tsx`. Replaced by Figma's full-page
  detail navigation (event/place/profile open full-page in the content column with an
  in-hero back arrow). Removed 2026-06-04.
- **Legacy floating map header chrome** — the `GlassMapHeader` burger menu, the
  Sparkles hex brand + tagline, the calendar toggle, the notifications bell, and the
  rainbow personalise "?" were all removed (2026-06-06). The header now matches the
  latest Figma map exactly: `[search] [filter] [avatar]`. Brand/nav/notifications live in
  `AppShell` (sidebar + bottom nav); the calendar moved to a sidebar entry
  (`/events?view=calendar`); personalise moved to Settings → "Personalise my feed".
- **`BurgerMenu` (the burger panel) — DELETED** (`src/components/events/BurgerMenu.tsx`).
  Categories already lived in the Filters sheet. ⚠️ Its other features (trending events,
  favourite orgs, friends-considering + "convince"-from-map) were dropped and need a
  Figma-faithful home in a later phase. `useBurgerMenuData` is KEPT (still powers the map
  preview/quick panels + header avatar/personalisation).
- **`MapStatsFooter` — DELETED** (Organizations / Members / Active Projects pill). Not in
  the current Figma. Removed 2026-06-06.
- **Map visualisation layers — DELETED** (`mapLayers.ts`, the "Impact Glow / Activity
  Pulse / Connections" block in `MapFiltersPanel`, and their `globals.css` rules). Not in
  the current Figma. Removed 2026-06-06.

## ⏳ Still present — replace then delete
| Artifact | Where | Figma replacement | Notes |
|---|---|---|---|
| **`PageHeader`** (old top-bar chrome: title + back) | `src/components/ui/PageHeader.tsx`; still used by admin pages (`/admin/**`), forms (`contributor/apply`, `contributor/setup`, `places/new`, `events/[id]/edit`, etc.), `messages`, `messages/[id]`, `profile`, `profile/contributor`, `dashboard` | Figma surfaces use an in-hero/in-page back + their own headers | Removed from the 4 Figma detail wrappers (event/place/c/profile) on 2026-06-04. Delete the component once every remaining consumer is reskinned. |
| ~~**Old search bar**~~ | — | Figma `GlassMapHeader` search | ✅ Resolved 2026-06-06 — the floating legacy search bar was the `GlassMapHeader` itself; it's now the clean Figma `[search][filter][avatar]` row. |
| ~~**Old "Citizen Central" / Citizens Connect logo**~~ | — | Figma crown logo in `AppShell` | ✅ Resolved 2026-06-06 — the map header's Sparkles hex brand + tagline were removed; brand lives only in the `AppShell` crown. |
| ~~**Old burger / hamburger menu**~~ | — | `AppShell` sidebar + bottom nav | ✅ Resolved 2026-06-06 — the header burger and the `BurgerMenu` panel were deleted. |
| **MessagesPanel bus slide-over** | `AppShell` `OPEN_MESSAGE_THREAD_EVENT` → `MessagesPanel` | Figma `Messages` full page (`/messages`) | Separate old overlay (not part of `@panel`). Decide in Phase 3 (Messages) whether to keep the quick slide-over or route everything to the full page. |

## Process
At the end of the phased Figma transformation, sweep this list: for each artifact confirm the
Figma replacement is live, then delete the old component + all imports, run the full quality
gate, and update this file.
