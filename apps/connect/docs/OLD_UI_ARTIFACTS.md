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

## ⏳ Still present — replace then delete
| Artifact | Where | Figma replacement | Notes |
|---|---|---|---|
| **`PageHeader`** (old top-bar chrome: title + back) | `src/components/ui/PageHeader.tsx`; still used by admin pages (`/admin/**`), forms (`contributor/apply`, `contributor/setup`, `places/new`, `events/[id]/edit`, etc.), `messages`, `messages/[id]`, `profile`, `profile/contributor`, `dashboard` | Figma surfaces use an in-hero/in-page back + their own headers | Removed from the 4 Figma detail wrappers (event/place/c/profile) on 2026-06-04. Delete the component once every remaining consumer is reskinned. |
| **Old search bar** | (founder-noted; confirm exact component during Phase 1 audit follow-up) | Figma `GlassMapHeader` search / category pills (already shipped) | Founder note — verify there isn't a stale legacy search input lingering anywhere. |
| **Old "Citizen Central" / Citizens Connect logo** (old mark) | (founder-noted; locate during cleanup) | Figma crown logo (`gold-gradient` + `Crown`) — already in `AppShell` | Ensure no old logo asset/markup remains. |
| **Old burger / hamburger menu** | (founder-noted; locate during cleanup) | Figma sticky sidebar (desktop) + bottom nav (mobile) — already in `AppShell` | The collapsible-rail sidebar replaced any old burger nav. |
| **MessagesPanel bus slide-over** | `AppShell` `OPEN_MESSAGE_THREAD_EVENT` → `MessagesPanel` | Figma `Messages` full page (`/messages`) | Separate old overlay (not part of `@panel`). Decide in Phase 3 (Messages) whether to keep the quick slide-over or route everything to the full page. |

## Process
At the end of the phased Figma transformation, sweep this list: for each artifact confirm the
Figma replacement is live, then delete the old component + all imports, run the full quality
gate, and update this file.
