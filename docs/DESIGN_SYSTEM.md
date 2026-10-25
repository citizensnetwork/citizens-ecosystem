# Citizens design system (working guide)

> **What this is.** The short, practical guide the Builder follows for any UI or visual issue, together with that issue's `## Design spec` comment.
> **What it is not.** It is not the measured reference. Token values, contrast ratios, the drift index and the canon decision live in [`docs/design/DESIGN.md`](design/DESIGN.md). Where the two differ, `DESIGN.md` and the code win, and this guide gets fixed.
> **Canon.** Map v2's tokens in [`apps/connect/src/frontend/assets/map-v2.css`](../apps/connect/src/frontend/assets/map-v2.css) (sections 1 to 3). Vision and Wear keep their own token blocks until #209.

## 1. Tokens (use the names, never the values)

Component CSS reads `var(--…)` only. Raw colours and px values live in the token blocks; 0 and 1 px borders are the only exception (`mapV2Tokens.test.ts` enforces this). You can propose a new token only in an issue spec, by name, and only when nothing below fits.

| Group             | Tokens                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces          | `--surface-0` (app), `--surface-1` (sheet, card), `--surface-2` (raised, placeholder), `--logo-bg` (white in both looks)                       |
| Text              | `--text-1`, `--text-2`                                                                                                                         |
| Gold              | `--accent` (fill) with `--accent-contrast` (its label), `--accent-ink` (gold text, rings, icons). Never plain gold text on white               |
| Status            | `--ok`, `--closed`, `--error`, `--live`: always with words, never colour alone                                                                 |
| Lines, focus, dim | `--divider`, `--focus-ring`, `--focus-w`, `--focus-offset`, `--scrim`, `--viewer-bg`, `--viewer-fg`                                            |
| Spacing (4-pt)    | `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-7` 32 · `--space-8` 48            |
| Radii             | `--radius-sm` 8 · `--radius-md` 12 · `--radius-lg` 20 (`--sheet-radius`) · `--radius-full`                                                     |
| Type              | `--fs-1/--lh-1` 12/16 · `--fs-2/--lh-2` 14/20 · `--fs-3/--lh-3` 18/24 · `--fw-regular`, `--fw-semibold` · `--font-display`, `--font-body`      |
| Elevation         | `--elev-1` (controls), `--elev-2` (sheets, dialogs)                                                                                            |
| Z-index           | `--z-pin` 10 · `--z-controls` 20 · `--z-sheet` 120 · `--z-viewer` 300 (dialogs, viewer) · `--z-toast` 400                                      |
| Motion            | `--dur-fast` 120 · `--dur-base` 200 · `--dur-slow` 320 ms · `--ease-enter`, `--ease-exit`. JS twins: `MapV2.motion`, `MapV2.dur()`             |
| Sizes             | `--hit` 44 px (minimum target), `--avatar-peek`, `--avatar-half`, `--sheet-*`, `--pin-*`, `--hrow-card-w`, `--hrow-peek`, `--disabled-opacity` |

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
