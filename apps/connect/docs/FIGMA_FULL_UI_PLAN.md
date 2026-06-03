# Figma Make → Citizens Connect — Full UI Adaptation Plan

> Source: exported Figma Make app `github.com/citizensnetwork/Christiancommunitymapapp`
> (cloned to `../Christiancommunitymapapp`). Goal: our app looks **exactly** like
> this Figma and operates as smoothly, every page complete and navigating.
> Approach (founder-approved): adopt ALL Figma design techniques; wire to OUR real
> Supabase data; keep OUR map engine + zoom-layering + marker designs + 17 event /
> 10 place categories & their hex colours.

## Founder decisions (locked)
- **Map:** bring pin **selection highlight** + **live pulse ring** + **glass controls /
  quick-filter pills / legend**. DISCARD Figma pin shapes, the 💬 bubble look, AND the
  +/- zoom buttons. Keep our MapLibre engine, markers, map-bubbles, zoom tiering.
- **Navigation:** Figma sidebar + bottom nav. Mobile bar **persistent**; desktop sidebar
  **collapsible — folds into the crown logo top-left** (founder likes the crown).
- **Tokens:** adopt gold **#C9A84C** set (light #E8D48B / dark #8B6914) + fonts
  **Playfair Display** (headings) + **Plus Jakarta Sans** (body). Category colours stay ours.
- **New features:** build UI now with honest real-data proxies; **defer the Impact-Ideas
  voting backend** to its own approved batch (Phase 6). No fabricated stats (VISION).

## Figma surface inventory (every item, mapped to our route)
| Figma page | Our target | Key items to port |
|---|---|---|
| Home (map) | `/events` (EventsView) | glass search, quick-filter pills, filter→CategoryPanel bottom-sheet (cat grid + counts), avatar btn, active-filter pill, **Map Key legend**, Ideas toggle (Phase 6), pin **select highlight** + **live pulse**, preview panel (have cards) |
| EventProfile | `/events/[id]` + `@panel` | hero, HAPPENING-NOW badge, Connect/Consider, info cards, stats, broadcast banner, tabs about/gallery/updates (emoji reactions), organiser card, volunteer CTA, web/msg/share |
| PlaceProfile | `/places/[id]` + `@panel` | hero, cat badge, follow/msg, stats (followers/hours), tabs about/events/gallery, managed-by org, "Serve Here" volunteer CTA |
| ContributorProfile | `/c/[slug]` + `/profile/[id]` | cover+logo, **involvement badge** (proxy), cat badge, bio, stats, follow/msg/web, tabs events/places/team/friends, team list, contact |
| Dashboard | `/c/[slug]/dashboard` | involvement badge, quick stats, tabs overview/events/messages/tools, weekly **bar chart** (recharts), activity feed, event cards (view/edit/broadcast), places, **broadcast composer**, tool tiles |
| Settings | dashboard/account settings | avatar/cover, name/bio, privacy toggle, notif-pref toggles, **interests** chips, **quick-filters chooser (≤5)**, weekly-contribution card, profile sharing, save |
| Messages | `/messages` (+ `/[id]`) | convo list (search, org ✦ badge, unread), thread (glass bubbles, active dot, input/send), empty state |
| Notifications | `/notifications` | unread count, mark-all-read, **filter chips** (all/broadcasts/messages/friends/convince/ideas), rows (icon+photo, unread highlight), deep-link routing |
| Community / Kingdom Projects | **NEW** `/community` | tabs voting/projects/submit; voting cards w/ progress bar; in-process+confirmed; submit form. UI now; voting backend Phase 6 |

## Phased plan (each phase = one batch: build → tsc+vitest+lint → vibe-security → commit → offload → compact)

### Phase 0 — Design foundation (tokens + global chrome)  ← everything depends on this
- globals.css: introduce #C9A84C gold set, Playfair + Plus Jakarta (`next/font`), glass /
  gold-gradient / gold-text utilities, animations (pin-pulse, broadcast-bubble, slide-up,
  fade-in), radius. **Careful global sweep**; keep category hex untouched.
- App shell layout: collapsible desktop sidebar (folds into crown) + persistent mobile
  bottom nav. Real unread counts (notifications, messages). Active-state indicator.
- Verify: nothing else visually regresses; map still renders.

### Phase 1 — Map (Home)
- Quick-filter pills row (driven by user's chosen quick-filters), CategoryPanel bottom-sheet,
  Map Key legend, active-filter pill, glass search polish (reuse GlassMapHeader).
- markers.ts/EventMap: selection highlight (scale + gradient + ring + label tooltip) +
  refined live pulse. Remove/΄keep-out +/- zoom buttons.

### Phase 2 — Detail surfaces
- EventProfile, PlaceProfile reskin (full page + `@panel` drawer variants), real data.
- ContributorProfile reskin; involvement-level badge as a **computed proxy** (followers +
  events + activity → Seed/Shepherd/Pillar/Beacon), documented, no fabricated numbers.

### Phase 3 — Personal surfaces
- Messages (glass bubbles, list, thread, empty state) on our messaging backend.
- Notifications (filter chips, rows, mark-all-read, deep-links) on our notifications.
- Settings (profile, privacy, notif prefs, interests, quick-filters≤5, sharing) wired to prefs.

### Phase 4 — Contributor Dashboard
- Reskin tabs/stats/feed/charts/tools; wire to existing contributor analytics + broadcasts.
- Broadcast composer → existing broadcast API.

### Phase 5 — Kingdom Projects / Community (UI-complete)
- New `/community` route + sidebar entry. Voting/projects/submit tabs rendered with real,
  honest data (no fake vote totals); submit wired to existing suggestion intake if suitable,
  else clearly marked pending Phase 6. Add to nav.

### Phase 6 — Impact-Ideas voting backend (DEFERRED — separate founder approval)
- Schema (ideas, votes w/ thresholds, status machine), RLS, SECURITY-DEFINER RPCs, map
  "Ideas" layer wiring, involvement-level persistence, "convince"/idea notifications.

## Cross-cutting rules
- A+ quality, light/fast, scale-ready (CLAUDE.md). Reuse existing components/APIs; no dupes.
- Vibe-security each batch (no service-role in client, RLS-first, input validation).
- Migrations start at **130**. Quality gate: `npx.cmd tsc --noEmit` ; `npx.cmd vitest run` ;
  `npx.cmd next lint --dir src`.
- VISION alignment re-checked per phase (mutual discovery, real need, honour the small).
