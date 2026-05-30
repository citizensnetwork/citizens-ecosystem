# Figma Make prompt — remaining Citizens Connect surfaces

Paste the block below into the **same Figma Make file** as the Glassmorphism
Community Map so the new surfaces inherit the established design system. Then
share the file/link back here and I'll implement each surface against our
Next.js + Supabase code (same approach as the map: real data, glass UI).

> Tip: generate **one surface at a time** (better quality than asking for all at
> once). Start with the Organisation Dashboard — it's the highest-value next
> surface and you already previewed it ("Hearts United Foundation").

---

## PROMPT (copy from here)

You are extending an existing product called **Citizens Connect** — a
glassmorphism community map for a city's Christian organisations, events and
places. Keep the EXACT design language already in this file:

**Design system**
- Palette: gold `#D4AF37` (primary accent), ink black `#111`, white surfaces,
  soft warm background `#F7F4EC`. 60/30/10 — mostly white/neutral, gold accents.
- Glass panels: `rgba(255,255,255,0.74)`, `backdrop-blur(22px) saturate(150%)`,
  1px white border, soft shadow, radius 24px (`rounded-3xl`).
- Type: Montserrat (semibold headings, medium body). Tiny uppercase tracked
  labels for section captions.
- Markers/accents: events = gold, places = black, category colour as a small
  accent dot. Pills and toggles are fully rounded.
- Tone: warm, trustworthy, "Connecting the Kingdom" — Christian community.
- Motion: light, fast, CSS-feel (no heavy 3D). Cards lift slightly on hover.

**Build these surfaces (mobile + desktop), each as its own frame:**

1. **Organisation Dashboard** (contributor's own view) — hero header with cover
   image, org name + category, "High Impact" badge, Support/Follow CTA. Stat
   cards: Active Members, Projects, Impact Score (%), Lives Impacted. Tabs:
   Overview / Projects / Team / Impact. Overview = Mission, Recent Activity
   feed, Founded + Location, Active Projects list with category tags.
2. **Contributor public profile** (`/c/[slug]`) — what a citizen sees: cover,
   logo, name, category, short bio, follow button, upcoming events list, places
   list, "Get involved / Volunteer" call-to-action, contact + socials row.
3. **Event detail** (full page + right-side drawer variant) — image header,
   title, date/time, location w/ mini-map, host org chip, description, the 5
   actions (View / Join / Share / Consider / Visit), attendees, related events.
4. **Place detail** (full page + drawer variant) — image, name, category,
   verified tick, rating + reviews, address w/ directions, volunteer flag,
   hours/contact, events happening here.
5. **Citizen dashboard / "My Citizens"** — saved & joined events, followed orgs,
   considering list, nearby suggestions, a "ways to serve this week" module.
6. **Messages / conversations** — list + thread, glass bubbles, org vs citizen.
7. **Auth-light** — sign-in / apply-to-contribute, matching the landing's frosted
   hero.

For each surface, return a clean desktop frame and a mobile frame, using the
shared components (glass card, pill, stat card, tab bar, badge, CTA button).

## (end prompt)

---

## Notes for implementation (Claude → code)

- Reuse the glass primitives already built in `src/components/map/glass/`
  (`GlassMapHeader`, `*PreviewCard`, panels) and `globals.css` (`.cc-glass`,
  `--glass-*`, `.cc-hex-logo`, pulse/glow).
- Wire to real data: orgs/contributors = `profiles` (contributor_*), events,
  places, rsvps, considerings, conversations.
- The org "Impact Score / Lives Impacted" metrics don't exist in the schema yet
  — decide whether to add columns or compute proxies (followers, events count,
  attendance) before building the dashboard, so we don't ship fabricated stats
  (per VISION: honour real data).
