# Citizens design reference

> **Status:** built 2026-10-17 as phase 1 of the Designer role ([`../../apps/connect/docs/handoffs/DESIGNER_ROLE_HANDOFF.md`](../../apps/connect/docs/handoffs/DESIGNER_ROLE_HANDOFF.md)). **Derived from the code, never invented:** every number has the command that produced it beside it, and was measured on `origin/main` at `f14b0c8` (2026-10-17). **Provisional canon:** Map v2's tokens, pending the founder's answer to inbox card `d-design-canon` (section 2). Nothing in this file changes a token, a screen or `packages/ui`.
> **Who reads it:** the Designer role (every run), the Builder and the Reviewer (for a design issue or a diff under `src/frontend/`), and any session that touches how Citizens looks. **Vision link:** `apps/connect/VISION.md`: the small are honoured (one visual weight for every contributor), Kingdom-clear, excellence as stewardship, intuitive service.
> **To change it:** a value here changes only when the code changes (then update the number and its commit). A change of _canon_ (which gold, which fonts, which tokens win) is the founder's decision, by card, never an edit.

---

## 1. How the system is organised today

Citizens has **one written, tested design system and four others that were written separately**:

| System                                                                                                   | Where                                                                                                                        | State                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map v2 tokens** (surfaces, text, gold fill and ink, status, scales, motion, a dark look)               | `apps/connect/src/frontend/assets/map-v2.css`, sections 1 to 3                                                               | Live on the default map; contrast-tested; signed off on a real phone (tracker 12.3). The most recent and the only one with a test                                             |
| **Connect's older look** (Tailwind Play CDN config, a `--gold` ramp, a crown gold, Playfair and Jakarta) | `apps/connect/src/frontend/index.html`, `app/ui.jsx`, `app/data.jsx`                                                         | Everything outside the map. The Tailwind config and `:root` there are Connect's token blocks                                                                                  |
| **Vision's design-system tokens** (a ten-step gold ramp, warm neutrals, light and "noir" looks, Manrope) | `apps/vision/src/frontend/index.html`, `:root` and its dark block                                                            | Live; its own gold (`#f0c024`)                                                                                                                                                |
| **Wear's page variables** (its own gold, paper and ink greys, Manrope)                                   | `apps/wear/src/frontend/index.html`, `:root` (a stylesheet `apps/wear/src/styles/globals.css` exists but nothing imports it) | Live; its own gold (`#f2ba1b`)                                                                                                                                                |
| **`packages/ui` tokens** (gold `#c9a24a`, Cormorant Garamond display face)                               | `packages/ui/src/tokens.ts`, `packages/ui/tailwind-preset.cjs`                                                               | **Has no consumer** (the shipped Wear and Connect frontends do not import it). Its own comment calls it "the single source of truth"; today it is one more, unused definition |

Section 5 measures how far apart they are. Section 2 says which one the Designer treats as the target.

## 2. The canon, and the decision still open

**Provisional canon (decision D1 of the Designer handoff, applied as the recommended default on 2026-10-17 while the founder was away; reversible):** the Map v2 tokens in section 3. They are the look the founder approved on a real phone, they carry contrast data and a test, and the choice of canon is the founder's alone (tracker gate G3), so this file presents it and does not enforce it. Card **`d-design-canon`** (filed in the Decision Inbox with this pull request) shows the five competing golds and the font sets and asks the question; the Dispatcher records the answer. Until it is answered, the Designer proposes work **toward** Map v2's tokens and never changes a value.

What is **not** decided by anyone yet: which gold the whole platform uses, which display and body fonts, whether `packages/ui` becomes the shared source (generating each app's CSS or Tailwind preset from it) or is retired, and when Vision and Wear are brought to the canon. Each is a card, one at a time, never a platform-wide switch.

## 3. The tokens (Map v2), light and dark

Source: `apps/connect/src/frontend/assets/map-v2.css`, sections 1 (light, the default), 2 (dark, `[data-theme='dark']`, set by `app/map-v2-lib.jsx` from the phone's own light or dark setting) and 3 (reduced motion).

```text
# token counts at f14b0c8 (run from the repository root)
awk '/^:root \{/,/^\}/' apps/connect/src/frontend/assets/map-v2.css | grep -cE '^\s*--[a-z0-9-]+:'                  # 91 in the light block
awk "/^\[data-theme='dark'\] \{/,/^\}/" apps/connect/src/frontend/assets/map-v2.css | grep -cE '^\s*--[a-z0-9-]+:'  # 26 in the dark block
grep -cE '^\s*(it|test)\(' apps/connect/src/__tests__/frontend/mapV2Tokens.test.ts                                  # 7 tests
grep -cE '\| (4\.5|3):1\s+\|' docs/audit/contrast.md                                                                # 22 contrast pairs
```

The contrast ratios quoted below are read from `docs/audit/contrast.md`, which `apps/connect/scripts/map-v2/contrast.mjs` generates from these tokens.

**Rule written into the file's own header:** every raw colour and every px value lives in the token blocks; component rules read `var(--...)` only (0 and 1 px borders excepted). **Gold is a fill with a near-black label** (`--accent` with `--accent-contrast`); dark gold (`--accent-ink`) is for gold text, rings and icons, because plain gold on white is 2.29:1.

### Colour roles

| Role                | Token                 | Light                  | Dark                        | Constraint (tracker Appendix B, `docs/audit/contrast.md`)                           |
| ------------------- | --------------------- | ---------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| App background      | `--surface-0`         | `#f7f4ee`              | `#0a0908`                   | text on it at least 4.5:1                                                           |
| Sheet               | `--surface-1`         | `#ffffff`              | `#1a1714`                   | `--text-1` 19.90 light, 16.26 dark                                                  |
| Raised, placeholder | `--surface-2`         | `#f5f1e8`              | `#26221d`                   |                                                                                     |
| Primary text        | `--text-1`            | `#0a0908`              | `#f7f4ee`                   | at least 4.5:1 on every surface                                                     |
| Secondary text      | `--text-2`            | `#5c5444`              | `#b9ae9a`                   | at least 4.5:1 on every surface                                                     |
| Accent fill         | `--accent`            | `#c9a84c`              | `#c9a84c`                   | the one gold fill                                                                   |
| Label on the fill   | `--accent-contrast`   | `#0a0908`              | `#0a0908`                   | 8.71:1 on the fill                                                                  |
| Gold ink            | `--accent-ink`        | `#8b6914`              | `#e8d48b`                   | text 4.5:1, icons and rings 3:1 (4.51 is the tightest light pair, on `--surface-2`) |
| Open                | `--ok`                | `#1e6b3c`              | `#62d68f`                   | always with text, never colour alone                                                |
| Closed, error       | `--closed`, `--error` | `#a32d22`              | `#ff8f80`                   | always with text                                                                    |
| Focus ring          | `--focus-ring`        | `#8b6914`              | `#e8d48b`                   | 3:1 on the surfaces                                                                 |
| Divider             | `--divider`           | `rgba(10, 9, 8, 0.12)` | `rgba(247, 244, 238, 0.14)` |                                                                                     |
| Dimming scrim       | `--scrim`             | `rgba(10, 9, 8, 0.4)`  | `rgba(0, 0, 0, 0.55)`       |                                                                                     |
| Map base (contrast) | `--map-base`          | `#f9f9f6`              | `#292929`                   | pin border and label contrast are measured against it                               |

### Scales (the same in both looks)

| Scale          | Values                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing (4-pt) | `--space-1` to `--space-8`: 4, 8, 12, 16, 20, 24, 32, 48 px                                                                                                                                                |
| Radii          | `--radius-sm` 8, `--radius-md` 12, `--radius-lg` 20, `--radius-full` 999 px                                                                                                                                |
| Type           | three sizes `--fs-1` 12/16, `--fs-2` 14/20, `--fs-3` 18/24 (size/line height); two weights 400 and 600                                                                                                     |
| Fonts          | display `--font-display`: Playfair Display; body `--font-body`: Plus Jakarta Sans                                                                                                                          |
| Elevation      | two levels: `--elev-1`, `--elev-2` (plus the pin's own shadow)                                                                                                                                             |
| Hit area       | `--hit` 44 px; focus ring `--focus-w` 2 px with `--focus-offset` 2 px                                                                                                                                      |
| Motion         | `--dur-fast` 120, `--dur-base` 200, `--dur-slow` 320 ms; `--ease-enter`, `--ease-exit`; transform and opacity only; every duration is 0 under `prefers-reduced-motion`                                     |
| Stacking       | `--z-pin` 10, `--z-controls` 20, `--z-sheet` 120, `--z-viewer` 300, `--z-toast` 400 (the app's real stacking; tracker Appendix B still lists a placeholder scale of 10, 20, 30, 40, 50: **the code wins**) |

**Enforced by:** `apps/connect/src/__tests__/frontend/mapV2Tokens.test.ts` (7 tests: three type sizes and two weights, radii from {8, 12, 20, 999}, spacing from the 4-pt scale, one accent and no new gold, every contrast pair in both looks, a dark set under `[data-theme='dark']`, no raw hex or px in the component rules) and `apps/connect/scripts/map-v2/contrast.mjs` (the 22 pairs in `docs/audit/contrast.md`). A token change that breaks a pair fails the test.

## 4. Component grammar

Each row names where the pattern lives, so a design proposal can name its files. The map components are styled by `map-v2.css` section 4 and read tokens only. Their inner nodes carry `data-mv2` attributes, never `class` (the Tailwind Play CDN re-reads classes under every node; tracker 11.1, P1-04).

| Component                                                 | Selector / marker                                                                           | File                                                                                                                                                                      | States and rules                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pin (logo, glyph, place and event silhouettes, live ring) | `.mv2-marker`, `.mv2-pin*`, `[data-mv2=disc\|logo\|badge\|glyph\|label\|tail\|live\|shape]` | `app/map-v2-pins.jsx`; CSS 4a                                                                                                                                             | selected (scale 1.6), dimmed outside a filter (`--dim-opacity`), focus-visible ring; 44 px hit area from a padded `::before`; outer element carries no `var()` |
| Bottom sheet and side panel                               | `[data-mv2=sheet\|grab\|handle\|handle-bar\|panel]`                                         | `app/map-v2-sheet.jsx`; CSS 4b                                                                                                                                            | three snap states (peek, half, full); a side panel 380 px wide when the screen is wide; `--sheet-*` tokens                                                     |
| Header: avatar, titles                                    | `[data-mv2=head\|avatar\|avatar-img\|titles\|name\|sub]`                                    | `app/map-v2-sheet.jsx`                                                                                                                                                    | does not shrink on scroll; the action row scrolls away inside the content                                                                                      |
| Action button                                             | `[data-mv2=action]` (`data-primary` for the gold fill)                                      | `app/map-v2-sheet.jsx`; CSS 4b, 4e                                                                                                                                        | hover border `--accent-ink`, primary hover opacity 0.9, pressed scale 0.97, 44 px, focus-visible                                                               |
| Tabs and sort                                             | `[data-mv2=tabs\|tab\|sort\|sort-btn]`                                                      | `app/map-v2-sheet.jsx`                                                                                                                                                    | hover darkens text, pressed scale 0.97                                                                                                                         |
| List row                                                  | `[data-mv2=row\|row-title\|row-meta\|row-static]`                                           | `app/map-v2-sheet.jsx`; nearby list in `app/map-v2-nearby.jsx` (`[data-mv2=nearby\|near-*]`)                                                                              | hover `--surface-2`, pressed scale 0.97                                                                                                                        |
| Gallery grid and tile                                     | `[data-mv2=grid\|tile\|tile-btn\|tile-img]`                                                 | `app/map-v2-gallery.jsx`; CSS 4b                                                                                                                                          | 1:1 tiles, 2 px gap; skeleton while loading; an error with "Try again"                                                                                         |
| Photo viewer                                              | `[data-mv2=viewer*]`                                                                        | `app/map-v2-gallery.jsx`; CSS 4c                                                                                                                                          | one photo, uncropped, above everything (`--z-viewer`)                                                                                                          |
| QR dialog                                                 | `[data-mv2=qr*]`                                                                            | `app/map-v2-qr.jsx`; CSS 4d                                                                                                                                               | black on white in either look                                                                                                                                  |
| Skeleton                                                  | `[data-skeleton]`, `@keyframes mv2-shimmer`                                                 | CSS 4b                                                                                                                                                                    | the only looping animation (`--shimmer-dur`, transform only; 0 under reduced motion)                                                                           |
| Empty and error state, status text                        | `[data-mv2=empty\|empty-title\|empty-hint\|notice\|state]`                                  | `app/map-v2-sheet.jsx`                                                                                                                                                    | one empty state with an action; an error notice (`role="alert"`); open or closed is always words beside the colour                                             |
| Icons                                                     | `window.Icon`                                                                               | `app/icons.jsx`                                                                                                                                                           | one family, stroke 2 on a 24 px grid                                                                                                                           |
| Words                                                     | `window.MapV2Strings`                                                                       | `app/map-v2-strings.jsx`                                                                                                                                                  | every user-visible Map v2 string lives here; South African English, sentence case, plain words, 12 words or fewer per label                                    |
| **Everything outside the map** (the older shared UI)      | Tailwind classes and the `--gold` ramp                                                      | `app/ui.jsx` (`window.UI`: Button, Avatar, Field, Input, Textarea, Toggle, Segmented, CategoryBadge, Overlay, MediaPicker, Toasts, Empty, Stepper), `app/entity-card.jsx` | **not on the Map v2 tokens.** This is where "Map v2's grammar seeping into the rest of the platform" starts: the shared UI first, then the screens that use it |

## 5. Where the platform has drifted (measured)

### 5.1 Five golds

```text
# lines that contain each gold, in application code (tests excluded; case-insensitive; run from the repository root)
# swap the hex for each row of the table; the result is the "Lines" column
git grep -ciE '#c9a84c\b' -- apps/connect/src apps/vision/src apps/wear/src packages/ui ':!*__tests__*' | awk -F: '{n+=$2} END {print n}'
```

| Gold      | Lines | Where it is defined or used in code                                                                                                                                                         |
| --------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#c9a84c` |    48 | Map v2 `--accent`; Connect's Tailwind config (`gold`, `secondary`) and `--gold` in `apps/connect/src/frontend/index.html`; many Connect screens, and `apps/connect/src/lib/map/markers.ts`  |
| `#d4af37` |    11 | Connect's crown gold (`--gold-crown`, the landing and sign-in screens, `app/auth.jsx`), `app/data.jsx`, `apps/connect/src/lib/categories.ts`; Vision's `--gold-antique` and `app/views.jsx` |
| `#c9a24a` |     2 | `packages/ui/src/tokens.ts` and `packages/ui/tailwind-preset.cjs` only (no consumer)                                                                                                        |
| `#f2ba1b` |     7 | Wear: `--gold` in its `index.html`, and `app/home.jsx`, `app/profile.jsx`, `app/ui.jsx`                                                                                                     |
| `#f0c024` |     1 | Vision: `--gold-500` (its `--brand`) in its `index.html`                                                                                                                                    |

The Designer specification said three golds; its search covered three known values and missed the two that live in Vision's and Wear's own pages. The frozen counter in [`DRIFT_INDEX.md`](DRIFT_INDEX.md) finds the same five by colour, not by value: **five fill golds across the platform**: two in Connect, two in Vision (`#d4af37` is in both), one in Wear and one in `packages/ui`.

### 5.2 Fonts

```text
# the faces each page loads (run from the repository root)
for a in connect vision wear; do echo $a; grep -o -E 'family=[A-Za-z+]+' apps/$a/src/frontend/index.html | sort -u; done
git grep -n -i 'cormorant' -- packages apps ':!*.md' ':!*.lock' ':!*vendor*'
```

| Surface         | Display face                                        | Body face             | Also loaded                                         |
| --------------- | --------------------------------------------------- | --------------------- | --------------------------------------------------- |
| Connect, Map v2 | Playfair Display                                    | Plus Jakarta Sans     | Manrope (landing and sign-in only: the brand voice) |
| Vision          | Manrope                                             | Manrope               |                                                     |
| Wear (shipped)  | Manrope                                             | Manrope               |                                                     |
| `packages/ui`   | Cormorant Garamond (falls back to Playfair Display) | the system sans stack | not loaded by any app                               |

The handoff's earlier note of "Inter in three `index.html` files" was wrong: the third face in all three pages is Manrope.

### 5.3 Drift index

The frozen definition, the tested counter (`apps/connect/scripts/design/drift.mjs`) and the baseline are in [`DRIFT_INDEX.md`](DRIFT_INDEX.md). Baseline at `f14b0c8`: **Connect 9.94, Vision 10.50, Wear 13.91, total 10.08** (distinct raw values outside token blocks per thousand lines, plus 5 for each fill gold beyond the first; lower is better). Map v2's own stylesheet contributes none by construction.

## 6. Per-screen parity checklist (tracker 12.3)

A screen is at parity when it passes the nine items below (the tracker's checklist, section 12.3, which the Map v2 phase passed). N is the **14 screens** named in the route table at the top of `apps/connect/src/frontend/app/routes.jsx`: map, discover, community, event, place, contributor, me, messages, notifications, settings, apply, onboarding, dashboard, admin (counted by hand from that comment).

| #   | Item                                                                       | How to check                                                                                                                       |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Spacing only from the 4-pt scale                                           | no raw `px` outside token blocks (`audit.mjs --surface <id>`; `mapV2Tokens.test.ts` for the map)                                   |
| 2   | At most three type sizes and two weights in the screen                     | `audit.mjs --surface <id>` font-size values, and the capture manifest's computed sizes; a screen may use only `--fs-1` to `--fs-3` |
| 3   | Radii only 8, 12, 20, 999                                                  | `audit.mjs --surface <id>` radius values, and the manifest's computed radii                                                        |
| 4   | One icon family, one stroke weight                                         | all icons come from `app/icons.jsx`                                                                                                |
| 5   | One accent colour in use                                                   | `audit.mjs` fill golds: one                                                                                                        |
| 6   | Hover (pointer devices), focus-visible and pressed states on every control | the captures (`capture.mjs`) and a keyboard pass; the manifest counts the tap targets under 44 px                                  |
| 7   | Loading, empty and error states on every list and grid                     | the captures (`capture.mjs`)                                                                                                       |
| 8   | Light and dark screenshots at 375, 768 and 1280 px                         | `apps/connect/scripts/design/capture.mjs`                                                                                          |
| 9   | The founder's sign-off recorded                                            | the tracker's decision log, section 11.1                                                                                           |

**Baseline (2026-10-17): parity is not measured.** The map passes all nine (its tests, its audit and the founder's phone check); the other 13 screens have not been judged, so their result is **not measured**, not failed. Phase 2 (built the same day) adds the tools: `audit.mjs` and `capture.mjs`, whose manifest records for every screen the computed font sizes and radii and the tap targets under 44 px. The Designer reports `n of 14` from its first run (week 0).

## 7. Rules the Designer inherits (by link, not copy)

- **Values and principles:** `docs/MAP_UX_TRACKER.md` sections 2.2 (the seven values) and 2.3 (the six design principles).
- **The discernment filter:** section 4 there (Q1 to Q7; ADOPT, ADAPT, DEFER or REJECT, one line each).
- **Hard rules and gates:** section 5 there (H1 to H15; gates G1 to G6: a new brand colour or logo, a new dependency, a database change, or anything touching auth, payments, notifications, user location or minors' data is a `direction`, never an `idea`).
- **Token roles:** Appendix B there. **The Designer's own rules:** [`../../apps/connect/docs/routines/designer.md`](../../apps/connect/docs/routines/designer.md).
- **Public repository:** nothing in a brief or in this file names a private person, an organisation, an inbox, an address or a secret; third-party screenshots never enter the repository.

## 8. Adopted patterns (the log; append only)

One line each, newest last. The Map v2 phase has its own long log; it is linked, not repeated.

| Date                     | Pattern                                                                                                                                                                                                       | Surface | Verdict                                             | Source                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------- | ----------------------------------------------------- |
| 2026-10-10 to 2026-10-14 | Map v2: the pin, the three-state sheet, the gallery, the dark look, the QR code, the tilt and the rest of the decisions D1 to D17 (the open-question list in tracker section 10, the answers in section 11.1) | map     | ADOPT or ADAPT per row (a few DEFER and REJECT)     | `docs/MAP_UX_TRACKER.md` sections 10 and 11.1         |
| 2026-10-17               | Map v2's tokens are the target look for the rest of the platform                                                                                                                                              | all     | provisional (applied default, awaiting the founder) | card `d-design-canon`; Designer handoff section 3, D1 |

## 9. What this file is not

It is not a style guide for brand assets (the crown mark, the wordmark: the founder's), not a component library (there is none; section 4 is a map of what exists), and not a promise that every screen will look like the map. It is the measured starting point from which the Designer proposes, one surface at a time, and from which the founder chooses.
