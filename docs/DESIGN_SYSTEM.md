# Citizens design system (working guide)

> **What this is.** The short, practical guide the Builder follows for any UI or visual issue, together with that issue's `## Design spec` comment.
> **What it is not.** It is not the measured reference. Token values, contrast ratios, the drift index and the canon decision live in [`docs/design/DESIGN.md`](design/DESIGN.md). Where the two differ, `DESIGN.md` and the code win, and this guide gets fixed.
> **Canon.** Map v2's tokens in [`apps/connect/src/frontend/assets/map-v2.css`](../apps/connect/src/frontend/assets/map-v2.css) (sections 1 to 3). Vision's `:root` and `[data-theme='dark']` use this set (the Noir control sets `dark`). Wear keeps its own token block until the Wear part of #209. **Gold (founder, 2026-10-31):** the crown logo's colour is the one gold. Connect has it everywhere (the older look's `gold`, `gold-light`, `--gold-deep` and `gold-dark` are its roles: [`DESIGN.md`](design/DESIGN.md), section 3); Vision and Wear move in their own pull requests.

## 1. Tokens (use the names, never the values)

Component CSS reads `var(--…)` only. Raw colours and px values live in the token blocks; 0 and 1 px borders are the only exception (`mapV2Tokens.test.ts` enforces this). You can propose a new token only in an issue spec, by name, and only when nothing below fits.

| Group             | Tokens                                                                                                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces          | `--surface-0` (app), `--surface-1` (sheet, card), `--surface-2` (raised, placeholder), `--logo-bg` (white in both looks)                                                                                                                                                                              |
| Text              | `--text-1`, `--text-2`                                                                                                                                                                                                                                                                                |
| Gold              | `--accent` (fill, the crown logo's `#f2bd22`) with `--accent-contrast` (its label, near-black), `--accent-ink` (gold text, rings, icons: `#836100` in the light look, the crown gold in dark). Never plain gold text on white (1.74:1), never a white label on a gold fill                            |
| Status            | `--ok`, `--closed`, `--error`, `--live`: always with words, never colour alone                                                                                                                                                                                                                        |
| Lines, focus, dim | `--divider`, `--focus-ring`, `--focus-w`, `--focus-offset`, `--scrim`, `--viewer-bg`, `--viewer-fg`                                                                                                                                                                                                   |
| Spacing (4-pt)    | `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-7` 32 · `--space-8` 48                                                                                                                                                                   |
| Radii             | `--radius-sm` 8 · `--radius-md` 12 · `--radius-lg` 20 (`--sheet-radius`) · `--radius-full`                                                                                                                                                                                                            |
| Type              | `--fs-1/--lh-1` 12/16 · `--fs-2/--lh-2` 14/20 · `--fs-3/--lh-3` 18/24 · `--fw-regular`, `--fw-semibold` · `--font-display`, `--font-body`                                                                                                                                                             |
| Elevation         | `--elev-1` (controls), `--elev-2` (sheets, dialogs)                                                                                                                                                                                                                                                   |
| Z-index           | `--z-pin` 10 · `--z-controls` 20 · `--z-sheet` 120 · `--z-viewer` 300 (dialogs, viewer) · `--z-toast` 400                                                                                                                                                                                             |
| Motion            | `--dur-fast` 120 · `--dur-base` 200 · `--dur-slow` 320 ms · `--ease-enter`, `--ease-exit`. JS twins: `MapV2.motion`, `MapV2.dur()`                                                                                                                                                                    |
| Sizes             | `--hit` 44 px (minimum target), `--avatar-peek`, `--avatar-half`, `--sheet-*`, `--pin-*`, `--hrow-card-w`, `--hrow-peek`, `--disabled-opacity`                                                                                                                                                        |
| Category groups   | `--cat-worship`, `--cat-serve`, `--cat-culture`, `--cat-learn`, `--cat-audiences`, `--cat-business`: one muted colour per group (#210), light and dark; read through `[data-cat]` as `--cat-c`                                                                                                        |
| Glass and nav     | `--glass-bg`, `--glass-blur` (frosted controls over the map), `--nav-dim`, `--accent-soft` (the selected nav item), `--select-w` (gold ring and selection outline), `--nav-btn` 56 px, `--nav-zone`, `--explore-card-w` 280 px (the Discover page's cards)                                            |
| Map-first sizes   | v4, founder 2026-10-30: `--explore-row-card-w` 236 px and `--explore-cover-ratio` 5 / 2 (the home panel's cards), `--explore-grab-h` 24 px, `--explore-head-h` 36 px, `--explore-body-min`, `--ctrl-btn` 36 px (the map's zoom and locate buttons), `--icon-sm`, `--sheet-half-h` 40dvh, `--card-ink` |

Light is `:root` and dark is `[data-theme='dark']`. Dark is set from the phone's own setting by `app/map-v2-lib.jsx`.

## 2. Layout and spacing

- **Spacing:** use only the `--space-*` scale. Inside a card, gap `--space-2` and padding `--space-3`. Between sections, `--space-5`. Page side padding is `--space-4`.
- **Type:** at most three sizes (`--fs-1` to `--fs-3`) and two weights per screen. Titles use `--fs-3` semibold, body `--fs-2`, meta `--fs-1` in `--text-2`.
- **Radii:** only 8, 12, 20 or full.
- **Icons:** one family (`window.Icon`, `app/icons.jsx`), stroke 2.
- **Copy:** every Map v2 string goes in `app/map-v2-strings.jsx`. Write South African English in sentence case, 12 words or fewer per label.

## 3. Cards

There is one anatomy everywhere (#222): **media → category chip → title → meta → excerpt → actions**. A slot is left out when its data is missing, never shown empty.

- **Box:** `--surface-1`, 1px `--divider`, `--radius-md`, padding `--space-3`.
- **Title:** clamped to 2 lines. **Excerpt:** clamped to 3 lines.
- **Category:** an 8 px dot in the category's `hex` (decorative) plus its **label** in `--fs-1` / `--text-2`. The label carries the meaning, so no category colour has to pass contrast. Use the category icon only in an avatar disc or on a pin. With no category, show the `kind` label.
- **Variants:**

  | Variant         | Media and meta                                                     |
  | --------------- | ------------------------------------------------------------------ |
  | `text` (news)   | optional 16:9 image; "posted ago"                                  |
  | `image`         | 16:9 `cover`                                                       |
  | `video`         | 16:9 poster + 44 px play disc on `--scrim`; never autoplay         |
  | `audio` / radio | 56 px artwork + "Listen"; "Live" in words with `--live`            |
  | `event`         | 56 px date block on `--surface-2`; starts-in, place, hosts         |
  | `listing`       | 56 px logo on `--logo-bg`; category, open state in words, distance |

- **Whole-card tap:** when there is one destination, make the card a `<button>` or `<a>` named by the title plus meta. Hover `--surface-2`, pressed `scale(0.97)`, shared focus ring. Inner actions sit in an action row outside it.
- **Images:** keep the aspect ratio in the box (`aspect-ratio`) so nothing shifts. If an image fails, drop it or show a neutral tile. Never show a broken-image icon.

### Sideways rows

A list that grows with the Contributor's activity (News, Nearby) is **one row of cards that scrolls sideways**, never a stack that makes the sheet endless. `app/map-v2-row.jsx` (`MapV2Row.Row`) lays out whatever cards it is given; it does not know the variants.

- **Size rule:** every card has the **same width**, `min(--hrow-card-w, row width − --hrow-peek)`, and the row is as tall as its tallest card. Portrait cards (text, image, video) keep their media on top; landscape cards (listing, event, audio) keep it on the left. One card alone fills the width. The next card always peeks at the edge, so no arrow is needed to say "more".
- **Cap and See all:** at most 10 cards are drawn (the newest). With more, a header shows "Newest 10 of N" and **See all N**, which opens the same cards as the plain vertical list in place (`aria-expanded`, **Show fewer** returns). No dialog, route or history entry. A list that can never exceed the cap (Nearby holds 8) has no See all.
- **Snap:** `scroll-snap-type: x mandatory`, cards snap to their start, `scroll-padding-inline` is the sheet gutter. The row bleeds to the sheet's edge so a card slides under the screen edge.
- **Keyboard and screen reader:** the wrapper is a `role="region"` with a name; cards stay real buttons in their order, Tab walks them and the browser scrolls the focused one into view. There is no roving tabindex and no trap.
- **Arrows:** Previous and Next appear only on a fine pointer and only while the row overflows. They use `aria-disabled` at the ends (never `disabled`, so focus is not lost) and move a whole number of cards. They glide unless `prefers-reduced-motion: reduce` (decided in the script; the stylesheet never sets `scroll-behavior`).
- **Touch:** a scroller ends the `touch-action` chain, so the row and everything in it use `--mv2-ta-row`, which is the sheet's `--mv2-ta` plus `pan-x`. A vertical swipe is still the sheet's or the page's. Also `overscroll-behavior-x: contain`. Check any change with real touch (`e2e/support/touch.ts`), not a mouse.

### Category colour (#210)

Every category belongs to exactly one **group**, and each group has one muted colour token. Gold is never a category colour: it stays the brand and the selection colour. The mapping lives in `app/map-v2-explore.jsx` (`GROUP_OF`; a unit test checks that every event category, place category and Contributor type is in it).

| Group       | Pill               | Light     | Dark      | Holds                                                                                          |
| ----------- | ------------------ | --------- | --------- | ---------------------------------------------------------------------------------------------- |
| `worship`   | Churches & worship | `#6e5a8f` | `#b3a2d6` | worship and prayer, church services, conferences, churches and ministries                      |
| `serve`     | Serve & care       | `#3f7a6a` | `#86c2b0` | outreach, community upliftment, care and recovery, health, safe spaces, retreat, clinic, rehab |
| `culture`   | Culture & fun      | `#a65a3c` | `#e0a084` | markets, sport and recreation, arts, social gatherings, media                                  |
| `learn`     | Learn & grow       | `#46699a` | `#93b3e0` | education and equipping, marriage and family, training                                         |
| `audiences` | Audiences          | `#9a4f72` | `#dc9cbb` | men, women, youth, kids, members only                                                          |
| `business`  | Business           | `#66713a` | `#b5c27f` | Christian businesses, hospitality and cafés, retail                                            |

- Each is at least 4.4:1 on the card, the raised surface and the app background in light, and at least 6.8:1 in dark (`scripts/map-v2/contrast.mjs`). It is still decoration: the category **name** carries the meaning.
- On a card the colour is a dot, a 1 px outline on the category chip and a `--select-w` top edge. Pass `cat` (the group) to `MapV2Card`. On a pill it is a dot.

### The Explore panel (#210; version 4, founder 2026-10-30)

The map home's bottom panel (`app/map-v2-explore.jsx`): a handle, then "Explore" and "See all", then the shared sideways row (above) of cards (`--explore-row-card-w`, a flatter picture, tighter padding: about a fifth less of the screen than the first version): cover photo (or a neutral tile with the category icon), category chip, name, and distance in km. Nearest first, at most 20. The home screen has **no pill row over the map**: the categories live in this panel.

- **Categories:** "Explore" is a switch (a chevron turns over; `aria-expanded`). It swaps the cards for a list of compact rows, two across, scrolled vertically inside the same box (so the panel is exactly as tall for either): All, the six groups with their dots, Events, Ideas; a check marks what is on (never colour alone). A pick filters the cards and the pins and goes back to the cards; Ideas is a switch beside them and leaves the list open. What the panel is filtered to is named beside the title. Escape goes back.
- **A pin tap** scrolls the row to that listing's card and outlines it in gold (`--accent-ink`, `--select-w`); a gold badge over its picture says "Tap again to open" (it takes no space, so the row never resizes) and the card carries aria-current. If the listing was further than the row's 20, it is added at the end, so no other card moves. Nothing opens.
- **A card tap chooses it**: the same outline and badge, the **row stays exactly where it is** (no scroll, no reshuffle: the ranking is held while a listing is chosen), and the map eases to its pin, kept clear of the search bar and the panel, and never left zoomed out past 14.
- **The second tap on the chosen card** opens the expanded listing (below). It never moves the map, and closing it returns to the very same panel and map. The panel hides while the listing is open (it stays mounted, so focus returns to the card). **Only one bottom area ever shows.**
- **The handle** (tap, or a short swipe down or up) lowers the panel to its title strip and raises it again. A pin tap raises it.
- **The map's zoom, un-zoom and locate buttons** (`--ctrl-btn`, 36 px) are hidden on a phone while the panel is up and come back when it is lowered; the Map nav (the clean map) and a laptop (room and a mouse) always show them. Only those two groups hide: the "Online in this area" globe is a feature and stays. The credit and the MapTiler logo are never hidden.
- The panel reports its height as `--explore-h`, so the logo, the credit and the "frame the data" padding stay clear of it.
- **See all** opens the Discover page (below). The card itself is `MapV2Explore.cardFor`, shared by both: never copy it.

### The Discover page (#210)

"See all" and the nav's Explore open it at `/explore` under Map v2 (`app/map-v2-discover.jsx`). The old map (`?map=v1`) shows Kingdom Exploration at that address, and `/discover` stays Kingdom Exploration everywhere (the sidebar's item).

- **Layout:** a sticky bar on the solid app background, never a blur (title, account button, the pills without Ideas), then sideways rows of the Explore card: **Near you** (closest first, at most 20), **Popular** (at most 20, with a one-line hint saying what it means), then one row per group with listings, in the groups' order, titled with the group name and its dot. Group rows hold every listing of the group, closest first; the row's own "See all N" opens past 20. An empty row is left out.
- **Pills:** All shows every row; a group keeps Near you, Popular and that group's row, each filtered to the group; Events keeps events in every row. A new pill starts at the top.
- **Popular honours the small** (VISION.md): one point per thing going on, never per amount (an event in the next 30 days, news in the last 30 days, an event live now), one card per host, and equal scores in fair turns drawn afresh each day from the listing id. No counts are shown or used.
- **Distance:** from the person (the map's position, or one silent read when the browser already allows it; the page never asks), else the map centre, else the city centre, and the words say which.
- **A card tap** opens the listing's full page at once (event, place or Contributor profile; founder 2026-10-30). The pill and every scroll position are kept on the page's own history entry (`history.state.mv2discover`) and written just before leaving, so Back restores them.
- **Touch:** outside the sheet a row keeps the browser's own touch handling (the sheet's `--mv2-ta-row` rule does not reach it), so a vertical swipe that starts on a card scrolls the page and a sideways one scrolls only that row, which snaps. The pills take `pan-x pan-y` here.

### The map sheet at half and peek, and a Place's or an Event's body (#210; version 4)

The clean map's pin opens the three-state sheet. Founder 2026-10-30: **half is a little lower (`--sheet-half-h` 40dvh, was 46)** and every listing shows the same composition there, so no card shows more or less than another: one line each for the name and the subtitle, **one row of action pills that scrolls sideways**, no bio and no sort bar, then the tab bar (a Contributor) or the facts (a Place, an Event) at the same height. Full shows everything. **Peek is the header strip and nothing else**: the content is hidden once the sheet has slid down (the peek is taller than its header on a phone with a home indicator, and the first row of actions used to show below the name).

A Place and an Event follow the Contributor's rules (`ListingBody`): the same pills (Directions, then Follow for a Place or Connect for an Event, Save or Consider, Share, Website, Call, Message the organiser), the description as the bio, the facts as a plain list (address, hours or date, counts, followers from 100), the organiser and accepted co-hosts as links, socials, and (an upcoming event, signed in) the Convince note. No white box and no second Follow button. Convince keeps a light surface (`--card-bg`, `--card-ink`) because its text is drawn for one.

### The expanded listing sheet (#210)

What a chosen Explore card opens on its second tap: the map sheet (`app/map-v2-sheet.jsx`, `expanded`) at **full**, with no half or peek, and it never moves the map. A pin on the clean map (the nav's Map) opens the half sheet instead (next section).

- **Bar:** fixed above the content, `--hit` tall: the grab bar to the eye, ✕ (44 px, "Close details") to a thumb.
- **Header**, at the top of the content so it scrolls with the items: the cover in the card's own 16:9 media box (a neutral `--surface-2` tile with the category icon in the group colour when there is none or it fails), the name (focus lands here), then the card's category chip (group dot and outline, `data-cat`) and the facts: distance in km in the Explore row's words, measured from where the map was looking when the card was tapped, then open state and followers.
- **Tabs:** Events, News, Gallery in that order, only those with content, then Today while a Moment is live. No content, no tab bar. The first item of the first tab is in view on open.
- **Swipe:** a sideways swipe on the tab block (touch or pen, at least 48 px and 1.5 times more sideways than vertical) moves one tab, no wrap; the new panel slides in from that side over `--dur-base`. A swipe that **starts** on a sideways row (News) is the row's, wherever it goes. A vertical swipe scrolls the items.
- **Close:** ✕, Escape, Back (the one `useBackGuard` entry), or a swipe down with the content at its top: a flick, or a release past a quarter of the sheet's height (shorter springs back). It returns to the row with the card still outlined and focused.

## 4. Overlays, dialogs and sheets

The pattern is #216's news reader. `MapV2QR.Dialog` and `MapV2Gallery.Viewer` are being brought up to it in #223.

- **No stacked sheets.** The map sheet is the only bottom sheet. Anything opened from it is a **centred dialog**, portalled into `document.body` (a fixed box inside the sheet would follow the sheet's transform).
- **Layer:** `z-index: var(--z-viewer)`. Backdrop `--scrim` (optionally blurred), card `--surface-1`, `--sheet-radius`, `--elev-2`.
- **Semantics:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its title.
- **Focus:** on open, move focus in (to the title, or to the first control in a form). On close, return it to the element that opened the dialog, if that element `isConnected`. **Trap focus** with `inert` on `#root` plus a Tab wrap as fallback.
- **Close:** ✕ (44 px, with `aria-label`), Escape (a capture-phase listener with `stopPropagation`, so the sheet doesn't close too), Back (`useBackGuard(true, onClose)`; guards unwind newest first), and a backdrop tap (`e.target === e.currentTarget`).
- **Scroll lock:** set `overflow: hidden` on `<html>` while open and restore it on close. Scroll inside the card with `overscroll-behavior: contain`.
- **Pointer:** put `onPointerDown: e => e.stopPropagation()` on the dialog root. React portals bubble events to the sheet, which would otherwise start a drag.
- **URL:** change the address only when a route for the content already exists in `app/routes.jsx`.
- **Motion:** enter with opacity plus a `translateY(--space-3)` over `--dur-base` and `--ease-enter`. Exit is immediate.

## 5. Tabs

The pattern is #217 on the map sheet.

- **Semantics:** `role="tablist"` with `aria-label`; `role="tab"` with `aria-selected`, `aria-controls` and roving `tabIndex`; Arrow keys, Home and End; and `role="tabpanel"` with `aria-labelledby` and `tabIndex=0`.
- **Look:** the bar is `--hit` tall with a 1px `--divider` underline. The selected tab is `--text-1` with an `--accent-ink` underline.
- **The tabbed block:** the bar and panel sit in one wrapper that ends with a 1px `--divider` hairline and `--space-5` of space. Content below it never changes on a tab switch. There is no wrapper when there are no tabs.
- **Sticky:** the bar is sticky only inside its wrapper (`top: 0`, `--surface-1` background), so it leaves with the block. A tab switch while stuck snaps the block back to the top, instantly.
- **Swipe (map sheet, #210):** on touch, a sideways swipe on the block moves one tab; a sideways row inside the panel keeps its own swipe (see "The expanded listing sheet").

## 6. Accessibility and mobile (standing rules for every UI PR)

- **Targets:** at least 44 × 44 px (`--hit`). Inline text links are the only exception (WCAG 2.5.8).
- **Focus:** every control shows a visible `:focus-visible` ring (`--focus-w` solid `--focus-ring`, `--focus-offset`).
- **Contrast:** text at least 4.5:1, icons, rings and borders that matter at least 3:1, in both looks. Use only the pairs that `docs/audit/contrast.md` already measures, or add the new pair to the contrast test.
- **Never colour alone:** status, category and selection always have words, a shape or a position too.
- **Reduced motion:** build motion from the `--dur-*` tokens, which collapse to 0 under `prefers-reduced-motion`. Nothing loops except the skeleton shimmer.
- **Mobile first:** use safe areas (`env(safe-area-inset-*)`) on anything fixed. Allow pinch zoom on reading surfaces. Inputs are at least 16 px so iOS doesn't zoom on focus.
- **States:** every spec covers default, hover, focus-visible, pressed, loading (a skeleton in the final box), empty, error (`role="alert"` plus a way to retry), long text and no image, as relevant.
- **Proof in the PR:** screenshots at **375, 768 and 1280 px**, in **light and dark**, attached to the PR so they show on GitHub (not linked behind a login). Plus the e2e checks the spec lists.
- **Public repo:** fixture data only. No personal names, emails or private links in code, tests, screenshots or PR text.

## 7. When to ask the Designer

1. Any UI or visual issue needs `design-ready` (a `## Design spec` comment from the Designer) before it is built.
2. The Builder builds from **this guide plus the issue's spec** and does not need a design review for work that matches them.
3. Ask for a Designer review only when the build **deviates** from the spec or this guide. That includes a new token, a new component pattern, a changed layout, or a state the spec didn't cover. To ask, comment on the PR with what differs and why.
4. Questions of brand (which gold, fonts, the logo), category lists and policy belong to the product owner, not this guide.

## 8. Navigation and pills (#210)

- **Folding nav (phone):** one round frosted button (`--nav-btn`, `--glass-bg`, a `--select-w` ring of `--accent`), bottom centre, showing the current place's icon and a small dot when anything is unread (also in its name). A tap opens a frosted bar: **Home** (the map with the Explore panel), **Explore** (the Discover page; Kingdom Exploration on the old map), **Map** (the same map, clean: no pills, no row), **Profile** (the account menu, which also lists Projects, Messages and Alerts with counts). Every item is at least `--nav-btn` square; the current one sits on `--accent-soft` with `aria-current="page"`. The map dims behind it (`--nav-dim`). It folds back after 5 s untouched, on a tap outside, Escape or Back, and on any new screen. Wide screens keep the sidebar; the old map (`?map=v1`) keeps its bar. `app/map-v2-nav.jsx`.
- **Category pills (the Discover page only):** one sideways row (`role="group"`, `aria-pressed` on each): All, Churches & worship, Events, Business, Serve & care, Culture & fun, Learn & grow, Audiences. At least `--hit` tall (the Discover page keeps them at their size). The selected pill is an `--accent` fill with its `--accent-contrast` label; the rest are `--surface-1` with a 1 px `--divider`. **On the map home the same choices are the Explore panel's category list** (see "The Explore panel"); a choice filters the cards and dims the other pins (Ideas toggles the idea pins).
- **Home controls:** search and the account button are round and frosted (`--glass-bg`), with an `--accent-ink` ring when focused or chosen.
