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
  **collapsible to a sticky 72px icon-only rail** (`w-64` ↔ `w-[72px]`), bottom chevron
  toggle, hover tooltips + corner badge dots when collapsed. **(Updated 2026-06-04 to match
  the adjusted Figma `Root.tsx` @ `193fd45`; supersedes the earlier "fold into the crown
  logo top-left" decision — the rail now stays visible and the crown-reopen button was
  removed.)** Shipped in `AppShell.tsx`.
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

## Role surfaces from the adjusted Figma (`193fd45`) — NOTES FOR FUTURE PHASED IMPLEMENTATION
> Founder request (2026-06-04): the adjusted Figma adds admin/contributor/citizen role
> surface examples. **Record now, build later in the phases below — NOT ad-hoc.** Pull the
> design straight from the sibling repo `../Christiancommunitymapapp/src/app` when each
> phase reaches it. These are *examples for role implementation*, not immediate work.

| Figma source (sibling repo) | What it is | Lands in |
|---|---|---|
| `context/UserContext.tsx` | Role-driven layout state (citizen / contributor / admin) + a **demo role switcher** (`setRole`). In Figma it drives which nav tabs + surfaces show. **Our** roles already come from Supabase (`profiles.contributor_status`, admin role) — adopt the *layout gating*, NOT the client-set demo switcher (the switcher is a Figma demo affordance only). | Cross-cutting: **role-gated nav** (AppShell tabs), wired to our real role source. Revisit when Phase 4 (Dashboard) + admin surfaces land. |
| `components/layout/ProfilePanel.tsx` | Floating profile panel (cover photo, role badge, bio, **View Profile / Settings** links, role switcher) opened from the **sidebar avatar AND the top-of-map avatar** — the founder's "Profile button click in nav and map". Closes on outside click. | **Phase 3** (Personal surfaces) — replaces the plain `/profile` link with the rich panel; wire the demo role-switcher only if/when a real role-preview is wanted (else omit). The top-of-map avatar already exists in `GlassMapHeader`. |
| `pages/AdminDashboard.tsx` | **Admin Panel** — contributor application review: search, filter by status (pending/approved/rejected), applicant bio + reason, optional note, Approve/Reject with a confirm step; persisted. | We already have admin review at `/admin` (suggestions, reported, contributor approvals). **Reskin** our existing admin surfaces to this Figma look — fold into a later admin-reskin batch (after Phase 4), reusing our real RLS-backed admin APIs. NOT a new backend. |
| Role-gated tabs (`Root.tsx`) | citizen → base nav + "Become a Contributor" CTA; contributor → **+ Dashboard**; admin → **+ Dashboard + Admin Panel**. | Cross-cutting nav gating — apply in the AppShell when the Dashboard (Phase 4) + admin reskin are built. Today AppShell shows Dashboard to all; gate it by real role then. |

> ⚠️ **Honesty (VISION):** the Figma role switcher fabricates role state client-side for demo.
> Our implementation must derive role from the authenticated Supabase profile — never a
> client toggle that grants admin/contributor surfaces. The switcher is a design reference
> for *what each role sees*, not a feature to ship.

## Phased plan (each phase = one batch: build → tsc+vitest+lint → vibe-security → commit → offload → compact)

### Phase 0 — Design foundation (tokens + global chrome)  ← everything depends on this
- globals.css: introduce #C9A84C gold set, Playfair + Plus Jakarta (`next/font`), glass /
  gold-gradient / gold-text utilities, animations (pin-pulse, broadcast-bubble, slide-up,
  fade-in), radius. **Careful global sweep**; keep category hex untouched.
- App shell layout: collapsible desktop sidebar (sticky 72px icon rail — see updated nav
  decision above) + persistent mobile
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

## ⚠️ OVERRIDING DIRECTIVE (founder, Phase 1) — WHOLE REPLACEMENT
**The UI must FULLY, COMPLETELY, WHOLLY replace our current design with the Figma
design (sibling repo `Christiancommunitymapapp`). NO surface, panel, control or nav
element may be left in the old visual style.** "Reuse" of an existing component is only
acceptable if that component is restyled to match the Figma look. Where we retain
*functionality* Figma doesn't depict (locate-me, compass, calendar, "For me",
personalization, org search), it must be re-dressed in the Figma visual language
(glass, #C9A84C gold, Playfair/Jakarta, fully-rounded) — never left untouched. Each phase
must AUDIT every existing element on its surfaces and adapt or remove it; nothing
"non-discussed" is silently kept.

## Cross-cutting rules
- A+ quality, light/fast, scale-ready (CLAUDE.md). Reuse existing components/APIs; no dupes.
- Vibe-security each batch (no service-role in client, RLS-first, input validation).
- Migrations start at **130**. Quality gate: `npx.cmd tsc --noEmit` ; `npx.cmd vitest run` ;
  `npx.cmd next lint --dir src`.
- VISION alignment re-checked per phase (mutual discovery, real need, honour the small).
