---
applyTo: "src/app/**/*.tsx,src/components/**/*.tsx,src/app/globals.css"
description: "Use when editing Citizens Connect frontend. Enforces the visual system, full-screen map-first events experience, and floating controls pattern."
---
# Citizens Connect UI System

This instruction is the canonical UI baseline for Citizens Connect. Keep these rules unless the user explicitly requests a change.

## 1) Brand Ratio and Color Direction

Use the visual ratio:
- 60% white/off-white surfaces
- 30% black/charcoal typography and contrast elements
- 10% gold accents for primary actions and highlights

Implementation baseline:
- Prefer CSS variables in `src/app/globals.css`
- Keep primary CTA emphasis on gold
- Avoid returning to blue-primary UI patterns unless explicitly requested

### Monochrome + Gold Design Language
- **No emojis in UI.** All icons are inline SVGs or Unicode glyphs.
- **Category colors are an alternating white/grey palette** (`#d4d4d4` to `#f5f5f5`), defined in `CATEGORY_COLORS` in `src/lib/categories.ts`. These are used for un-RSVP'd calendar events; RSVP'd events use gold (#D4AF37).
- **Event map markers**: Black (#111) SVG icon inside white circle with 2px gold (#D4AF37) outline. 40px base size.
- **Place map markers**: Bare gold (#D4AF37) SVG pin icon with no background or bubble. 28px size, CSS drop-shadow for visibility.
- **Cluster badges**: Black circle with gold (#D4AF37) border and text.
- **Calendar events**: White/grey category backgrounds for un-RSVP'd, gold (#D4AF37) background for RSVP'd events.
- **Burger menu**: Gold SVG section icons (`text-(--gold)`), thin black separator lines (`border-black/[.12]`).
- **Notifications**: Simple Unicode glyphs (●, ◆, ✕, ○, ▸) for type indicators, no emojis.
- Category icons are defined as inline SVGs in `CATEGORY_ICONS` in `src/lib/map/markers.ts`.

## 2) Events Map Experience (Google Maps Style)

The `/events` map view is map-first and full screen.
- No traditional page header blocks above the map
- No extra spacers reducing viewport map area
- Primary controls float above the map

Required floating controls in map view:
- Search bar at top
- Citizens Connect floating title chip
- Calendar icon button at top-right to switch view
- Burger button left of title that opens a vertical filter drawer

## 3) Floating Filter Drawer

Filter behavior:
- Opens from left side as vertical panel
- Includes category filters and event count
- Includes vendor create action when applicable
- Closes on outside click and explicit close control

## 4) Responsive and Motion Standards

- Mobile-first layout first, then scale to tablet/desktop
- Preserve smooth but subtle transitions (no heavy animation)
- Loading states should use skeletons instead of plain text where practical
- Keep controls touch-friendly on mobile

## 5) Implementation Guardrails

- Preserve existing business logic and validation while restyling
- Do not introduce backend/database changes for UI tasks
- Keep MapLibre GL integration pattern from map instructions (`src/components/map/**`)
- All map components use shared config from `src/lib/map/config.ts` — never hardcode API keys

## 6) Completion Checklist for UI Tasks

Before finishing a UI task, verify:
1. Brand ratio still reads as white/black/gold
2. `/events` map view remains full-viewport
3. Floating controls are usable on mobile and desktop
4. Search/filter/view switch still function
5. Loading states feel smooth and intentional
