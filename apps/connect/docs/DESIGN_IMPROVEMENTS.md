# Citizens Connect — UI / Design Improvements

> Recorded: April 2026  
> Scope: Full-platform design review — icons, colours, map, calendar, navigation, event panels

---

## Summary

A senior digital-design review was conducted across all Citizens Connect screens. Changes were
benchmarked against:

- **WCAG 2.1 AA** contrast requirements for interactive text
- **Material Design 3 / Apple HIG 2023** principles for icon clarity
- **Popular 2024–2025 web-app patterns** — neutral-map basemaps, glassmorphism controls, gradient
  accent buttons for discoverability

The 60 % white / 30 % black / 10 % gold brand ratio was **preserved throughout**.

---

## 1 — Category Icons (`src/lib/map/markers.ts`)

### Problem
Several icons were ambiguous, identical, or misleading at 19–40 px marker scale:

| Category | Old Icon | Issue |
|----------|----------|-------|
| `mens` | Generic person silhouette | Identical to `womens` — indistinguishable |
| `womens` | Generic person silhouette | Identical to `mens` |
| `kids` | Sun / starburst | Not associated with children |
| `recovery` | Clock | Confused with time/schedule; overlapped with `weekend` |
| `equip` | 5-point star polygon | Same as the "Featured" star UI metaphor |
| `sport-fun` | Globe with equator | Near-identical to `missional` globe at marker scale |
| `entertainment` | Smiley face | Too generic; entertainment spans concerts, arts, film |
| `missional` | Globe with meridians | Conflated with sport-fun globe |
| Default fallback | Church icon | Misleading for non-church uncategorised events |

### Changes Made

| Category | New Icon | Rationale |
|----------|----------|-----------|
| `entertainment` | Music note | Universally understood entertainment symbol |
| `sport-fun` | Trophy | Unambiguous competitive / sport symbol |
| `mens` | Mars symbol ♂ (circle + arrow) | International gender symbol; instantly distinct |
| `womens` | Venus symbol ♀ (circle + cross) | International gender symbol; instantly distinct |
| `kids` | 4-point sparkle star | Playful, childlike, distinct from 5-point equip star |
| `recovery` | Refresh / rotate arrows | Renewal and healing metaphor; no temporal confusion |
| `equip` | Wrench / tools | Practical skills and equipping; no confusion with Featured star |
| `missional` | Compass rose | Navigation/direction metaphor; very distinct from sport trophy |
| Default fallback | Map pin (generic) | Neutral location icon — no false category implication |

Unchanged (appropriate): `social-fun` (coffee cup), `community-upliftment` (group), `education`
(book), `church` (building), `marriage-and-couples` (heart), `weekend` (calendar), `members-only`
(lock).

---

## 2 — Map Style (`src/lib/map/config.ts`)

### Problem
- **MapTiler `streets-v4`**: Full-colour commercial style (green parks, blue water, red roads).
  Competed visually with category-coloured markers and gold cluster badges.
- **OpenStreetMap raster fallback**: Similarly vivid, noisy at suburb zoom levels.

### Changes Made

| | Before | After |
|--|--------|-------|
| MapTiler style | `streets-v4` (full-colour) | `dataviz-light` (minimal, clean data-viz palette) |
| OSM fallback | OpenStreetMap tiles | **CartoDB Positron** — greyscale, elegant, widely used |

CartoDB Positron is the industry standard for data-overlay maps (used by Airbnb, Uber, Mapbox
examples). It lets markers and popups read at a glance without basemap noise.

---

## 3 — Calendar Toggle Button (`src/components/events/EventsView.tsx`)

### Problem
The calendar icon in the top-right floating bar was a plain white-background button — visually
identical to surrounding controls. Easy to miss at a glance.

### Changes Made
- Applied a **purple → rose → amber gradient** background when in map view (showing "switch to
  calendar").
- White icon stroke on gradient background creates strong visual affordance.
- When already in calendar view the button reverts to a plain white map icon (no gradient needed —
  the calendar is already open).

**Design basis**: Gradient accent buttons are a recognised "primary action" signal in 2024–2025
design systems (Notion, Linear, Vercel). The purple→amber arc echoes spectrum / time concepts
appropriate for a calendar metaphor.

---

## 4 — Filter Drawer Category Colours (`src/components/events/BurgerMenu.tsx`)

### Problem
Category filter chips in the left drawer turned plain gold when active — losing all connection to
the category colour visible on map markers and calendar events. Users scanning back to the map after
filtering couldn't correlate the chip to the marker colour.

### Changes Made
- Each category row now shows a **2.5 px colour dot** (matching `CATEGORY_HEX`) to the left of the
  label — visible in both active and inactive states.
- Active state: subtle category-colour tinted background + left border stripe + checkmark in
  category colour, instead of gold full background.
- This creates a visual bridge: the dot in the drawer matches the marker border on the map and the
  event block colour in the calendar.

---

## 5 — Calendar Event Text Contrast (`src/components/events/EventCalendar.tsx`)

### Problem
All non-RSVP calendar events used `textColor: "#fff"` regardless of background. Light categories
failed WCAG AA:

| Category | Hex | Old contrast (white text) |
|----------|-----|--------------------------|
| `kids` | `#00BCD4` (cyan) | ≈ 1.7 : 1 ❌ |
| `womens` | `#F39C12` (amber) | ≈ 2.1 : 1 ❌ |
| `weekend` | `#FF9800` (orange) | ≈ 2.2 : 1 ❌ |

### Changes Made
Added `calendarTextColor(hex)` — a luminance-based helper (ITU-R BT.601 coefficients) that returns
`#111` for backgrounds above luminance 155, `#fff` otherwise. All calendar events now meet contrast
requirements automatically for any future category additions too.

---

## 6 — Calendar "Today" Visual Emphasis (`src/app/globals.css`)

### Problem
- `cc-marker-today` CSS overrode the inline `CATEGORY_HEX` border with `#000 !important`. Today
  events lost their category-colour encoding — the only differentiator at marker scale.
- Today's calendar column had only a subtle `gold-soft` background — easy to miss in a busy month.

### Changes Made
- Removed `border-color: #000 !important` from `.cc-marker-today` — category colour is now
  preserved.
- Added a **gold outer glow ring** (`box-shadow: … 0 0 0 2px rgba(212,175,55,.45)`) to mark
  today's events on the map.
- Today's column in the calendar grid now has a **gold top border** accent (`border-top: 2px solid
  rgba(212,175,55,.5)`).
- Calendar `--fc-today-bg-color` changed from opaque `gold-soft` to a very subtle
  `rgba(212,175,55,0.08)` — more refined and less blocky.
- Calendar events gained a slightly bolder left-border + subtle hover lift (`translateY(-1px)`) for
  better interactivity feedback.

---

## 7 — Geolocation Dot (`src/components/map/EventMap.tsx`)

### Problem
User location indicator used Google Maps blue (`#4285F4`) — a competing brand colour, entirely
outside the white/black/gold palette.

### Change
Replaced with **gold dot** (`#D4AF37`, 14 px) with white ring and gold glow — fully on-brand.

---

## 8 — SVG Hamburger & Close Buttons

### Problem
- Burger trigger used `☰` (Unicode text character) — rendered inconsistently across OS/browsers.
- Three close controls used `✕` (Unicode × character) — same inconsistency.

### Changes Made
All controls now use proper `<svg>` elements with `strokeWidth="2.5"` matching the app's icon weight:
- Burger trigger → three horizontal lines SVG (`EventsView.tsx`)
- Featured panel close → × SVG (`EventsView.tsx`)
- Detail panel close → × SVG (`EventsView.tsx`)
- Burger menu close → × SVG (`BurgerMenu.tsx`)

---

## 9 — Mobile Detail Panel Scroll (`src/components/events/EventsView.tsx`)

### Problem
Mobile detail panel had no `max-height` — long event descriptions pushed content off-screen with no
scroll recovery.

### Change
Added `max-h-[78dvh] overflow-y-auto` on mobile; desktop retains `sm:max-h-full sm:h-full`.

---

## 10 — Navbar Events Link (`src/components/ui/Navbar.tsx`)

### Problem
`/events?view=calendar` forced calendar mode every time a user navigated from the Navbar —
overriding the default map experience.

### Change
`href` changed to `/events` — preserves the map as the canonical landing view.

---

## 11 — EventDetailContent Colour Tokens (`src/components/events/EventDetailContent.tsx`)

### Problem
Full-detail page used raw Tailwind gray utilities (`text-gray-600`, `text-gray-700`,
`rounded-md`, `border`) while the rest of the app uses brand opacity tokens (`text-black/60`,
`text-black/70`, `rounded-xl`).

### Changes Made
- `text-gray-600` / `text-gray-700` → `text-black/60` / `text-black/70`
- RSVP-disabled messages: `text-gray-400` → `text-black/40`
- Calendar export buttons: restyled to `rounded-xl border-(--gold)/40 bg-(--gold-soft)` to match
  gold accent system
- Edit Event link: `rounded-md` → `rounded-xl`, removed emoji prefix, consistent hover state

---

## Best Practice References

| Pattern | Source |
|---------|--------|
| Neutral basemap for data overlays | Airbnb Maps, Strava, CartoDB documentation |
| Luminance-based text contrast | WCAG 2.1 Success Criterion 1.4.3 |
| Gradient accent for discovery buttons | Linear.app, Notion, Vercel dashboard |
| Gender symbols for mens/womens | ISO 7000, Unicode standard |
| Color dot + text in filter drawers | Google Maps filter chips, Apple Maps categories |
| Compass rose for "missional/direction" | Standard cartographic iconography |
| Glow ring for "today" markers | Google Calendar, Apple Maps today indicator |
| CartoDB Positron | Industry standard neutral basemap (Mapbox, Observable, Flourish) |
