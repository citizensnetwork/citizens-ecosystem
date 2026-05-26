---
name: ui-system
description: >
  The Citizens Connect design system. Auto-loads when working on any UI
  component, screen layout, or visual design decision.
---

# UI System Skill — Citizens Connect
> **60/30/10 — White · Black · Gold**

## The Rule of Three
- **60% White** — backgrounds, panels, cards (`bg-white`, `#ffffff`)
- **30% Black** — text, borders, structure (`text-black`, `#111111`)
- **10% Gold** — CTAs, active states, brand (`var(--gold)`, `#D4AF37`)

## Tailwind v4
No `tailwind.config`. Configured via `@import "tailwindcss"` + `@theme inline` in `src/app/globals.css`.

## Floating Controls
Controls always accessible (filters, nav, toggle) float above content.
Use `position: fixed` or `absolute` with high z-index. Never inline in scrollable areas.

## Component Patterns

### Glass Panel
```tsx
<div className="bg-white/90 backdrop-blur-sm border border-black/10 rounded-2xl shadow-lg">
```

### Gold CTA Button
```tsx
<button className="bg-[var(--gold)] text-black font-semibold px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all">
```

### Error State
```tsx
<div role="alert" className="text-red-600 text-sm mt-1">{error}</div>
```

## Accessibility Minimums
- Every `<button>` without visible text: `aria-label`
- Form inputs: `<label>` via `htmlFor` / `id`
- Error messages: `role="alert"`
- Toggle buttons: `role="switch"` + `aria-checked`
- No emojis in UI — inline SVGs or Unicode glyphs only

## Right-Panel Pattern (universal content view)
All content views (event detail, place detail, org profile, search results) open as a panel
from the right side. Panels stack — back arrow returns to previous panel.
