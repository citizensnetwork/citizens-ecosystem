# Map v2 — token contrast (P1-02, M5)

Computed with the WCAG 2.x relative-luminance formula by `apps/connect/scripts/map-v2/contrast.mjs` from the token values in `apps/connect/src/frontend/assets/map-v2.css`, light and dark sets (and, for the gold ramp of the older look, the `:root` of `apps/connect/src/frontend/index.html`). `src/__tests__/frontend/mapV2Tokens.test.ts` fails the unit tests if any pair drops under its threshold. These ratios are **calculated from token values**; the final pin check is on sampled rendered pixels (P1-04, `docs/audit/phase1-qa.md`).

| Pair                                                                                                      | Needs | Light | Dark  |
| --------------------------------------------------------------------------------------------------------- | ----- | ----- | ----- |
| Primary text on the app background (`--text-1` on `--surface-0`)                                          | 4.5:1 | 18.12 | 18.12 |
| Primary text on the sheet (`--text-1` on `--surface-1`)                                                   | 4.5:1 | 19.90 | 16.26 |
| Primary text on a raised surface (`--text-1` on `--surface-2`)                                            | 4.5:1 | 17.65 | 14.39 |
| Secondary text on the app background (`--text-2` on `--surface-0`)                                        | 4.5:1 | 6.82  | 9.08  |
| Secondary text on the sheet (`--text-2` on `--surface-1`)                                                 | 4.5:1 | 7.48  | 8.15  |
| Secondary text on a raised surface (`--text-2` on `--surface-2`)                                          | 4.5:1 | 6.64  | 7.21  |
| Accent label on the accent fill (`--accent-contrast` on `--accent`)                                       | 4.5:1 | 11.44 | 11.44 |
| Gold ink as text on the sheet (`--accent-ink` on `--surface-1`)                                           | 4.5:1 | 5.71  | 10.26 |
| Gold ink as text on a raised surface (`--accent-ink` on `--surface-2`)                                    | 4.5:1 | 5.07  | 9.09  |
| Gold ink as text on the app background (`--accent-ink` on `--surface-0`)                                  | 4.5:1 | 5.21  | 11.44 |
| Open (green) text on the sheet (`--ok` on `--surface-1`)                                                  | 4.5:1 | 6.51  | 9.80  |
| Closed (red) text on the sheet (`--closed` on `--surface-1`)                                              | 4.5:1 | 7.10  | 8.07  |
| Error text on the sheet (`--error` on `--surface-1`)                                                      | 4.5:1 | 7.10  | 8.07  |
| Pin name label on the map base (`--pin-label` on `--map-base`)                                            | 4.5:1 | 17.51 | 13.25 |
| Gold ink as an icon or ring on the sheet (`--accent-ink` on `--surface-1`)                                | 3:1   | 5.71  | 10.26 |
| Focus ring on the sheet (`--focus-ring` on `--surface-1`)                                                 | 3:1   | 5.71  | 10.26 |
| Focus ring on the app background (`--focus-ring` on `--surface-0`)                                        | 3:1   | 5.21  | 11.44 |
| Focus ring on a raised surface (`--focus-ring` on `--surface-2`)                                          | 3:1   | 5.07  | 9.09  |
| Pin white border on the map base (`--pin-border` on `--map-base`)                                         | 3:1   | n/a   | 14.55 |
| Pin dark hairline on the map base (composited) (`--pin-hairline` on `--map-base`)                         | 3:1   | 5.59  | n/a   |
| Photo viewer text on its backdrop (over the sheet) (`--viewer-fg` on `--viewer-bg`)                       | 4.5:1 | 16.19 | 18.03 |
| Primary text on frosted glass (over the map) (`--text-1` on `--glass-bg`)                                 | 4.5:1 | 19.71 | 15.81 |
| Secondary text on frosted glass (over the map) (`--text-2` on `--glass-bg`)                               | 4.5:1 | 7.41  | 7.92  |
| Gold ink as an icon or ring on frosted glass (`--accent-ink` on `--glass-bg`)                             | 3:1   | 5.66  | 9.98  |
| Primary text on the selected nav item (`--text-1` on `--accent-soft`)                                     | 4.5:1 | 17.19 | 7.96  |
| Secondary text on the Explore panel (over the map) (`--text-2` on `--explore-bg`)                         | 4.5:1 | 7.47  | 8.09  |
| Gold ink on the Explore panel (See all) (`--accent-ink` on `--explore-bg`)                                | 4.5:1 | 5.70  | 10.20 |
| Primary text on a chosen category row (inside the Explore panel) (`--text-1` on `--accent-soft`)          | 4.5:1 | 17.19 | 7.96  |
| Gradient label on the light stop (`--accent-contrast` on `--gold-light`)                                  | 4.5:1 | 14.87 | 14.87 |
| Gradient label on the crown gold (the middle stop) (`--accent-contrast` on `--gold`)                      | 4.5:1 | 11.44 | 11.44 |
| Gradient label on the amber end stop (`--accent-contrast` on `--gold-deep`)                               | 4.5:1 | 8.81  | 8.81  |
| Older-look gold ink (text-gold-dark) on the sheet (`--gold-dark` on `--surface-1`)                        | 4.5:1 | 5.71  | n/a   |
| Older-look gold ink on the app background (`--gold-dark` on `--surface-0`)                                | 4.5:1 | 5.21  | n/a   |
| Older-look gold ink on a raised surface (`--gold-dark` on `--surface-2`)                                  | 4.5:1 | 5.07  | n/a   |
| Gold ink on the cream tint (bg-accent, `#fbf1cc`) (`--gold-dark` on `#fbf1cc`)                            | 4.5:1 | 5.05  | n/a   |
| Gold ink on the landing paper wash, middle (`#f3ecdb`) (`--gold-dark` on `#f3ecdb`)                       | 4.5:1 | 4.85  | n/a   |
| Gold ink on the landing paper wash, far corner (`#ece1c4`, large title only) (`--gold-dark` on `#ece1c4`) | 3:1   | 4.39  | n/a   |
| Category colour (worship) on the card (`--cat-worship` on `--surface-1`)                                  | 3:1   | 5.96  | 7.70  |
| Category colour (worship) on a raised surface (`--cat-worship` on `--surface-2`)                          | 3:1   | 5.29  | 6.81  |
| Category colour (worship) on the app background (`--cat-worship` on `--surface-0`)                        | 3:1   | 5.43  | 8.58  |
| Category colour (serve) on the card (`--cat-serve` on `--surface-1`)                                      | 3:1   | 5.00  | 8.80  |
| Category colour (serve) on a raised surface (`--cat-serve` on `--surface-2`)                              | 3:1   | 4.43  | 7.79  |
| Category colour (serve) on the app background (`--cat-serve` on `--surface-0`)                            | 3:1   | 4.55  | 9.81  |
| Category colour (culture) on the card (`--cat-culture` on `--surface-1`)                                  | 3:1   | 5.06  | 8.10  |
| Category colour (culture) on a raised surface (`--cat-culture` on `--surface-2`)                          | 3:1   | 4.49  | 7.17  |
| Category colour (culture) on the app background (`--cat-culture` on `--surface-0`)                        | 3:1   | 4.61  | 9.03  |
| Category colour (learn) on the card (`--cat-learn` on `--surface-1`)                                      | 3:1   | 5.60  | 8.30  |
| Category colour (learn) on a raised surface (`--cat-learn` on `--surface-2`)                              | 3:1   | 4.97  | 7.35  |
| Category colour (learn) on the app background (`--cat-learn` on `--surface-0`)                            | 3:1   | 5.10  | 9.25  |
| Category colour (audiences) on the card (`--cat-audiences` on `--surface-1`)                              | 3:1   | 5.62  | 8.09  |
| Category colour (audiences) on a raised surface (`--cat-audiences` on `--surface-2`)                      | 3:1   | 4.99  | 7.16  |
| Category colour (audiences) on the app background (`--cat-audiences` on `--surface-0`)                    | 3:1   | 5.12  | 9.02  |
| Category colour (business) on the card (`--cat-business` on `--surface-1`)                                | 3:1   | 5.27  | 9.34  |
| Category colour (business) on a raised surface (`--cat-business` on `--surface-2`)                        | 3:1   | 4.67  | 8.27  |
| Category colour (business) on the app background (`--cat-business` on `--surface-0`)                      | 3:1   | 4.80  | 10.41 |
| Category glyph on its category fill: best of white or `#0a0908`, worst of 23 colours (`#e91e63`)          | 4.5:1 | 4.58  | 4.58  |

## Notes

- **Gold (D3, the crown gold since 2026-10-31):** `--accent #f2bd22` is a fill with the near-black label `#0a0908` (11.44:1). For gold text, rings and icons on light surfaces use `--accent-ink #836100` (4.5:1 or more on every light surface above); in the dark look the ink is the crown gold itself (9.09:1 or more). Plain crown gold on white is 1.74:1, so it is never used as text, a ring or an icon on the light set. The older look keeps the ramp `--gold-light #fcdd6c`, `--gold #f2bd22`, `--gold-deep #e3a00a` for gradients (near-black label on every stop) and `--gold-dark #836100` (the same ink) for text. Where a fill gold is only a decorative ring or edge (the nav button, a chip outline), the label or the words carry the meaning, never the gold.
- **Difference from `packages/ui` (for RESUME C17):** `packages/ui/src/tokens.ts` still has gold `#C9A24A` (no consumer, not changed here: whether it becomes the shared source or is retired is #195). Connect's `index.html` `:root` and Map v2 now share one gold, the crown's `#F2BD22`. Vision and Wear still carry their own golds until their own pull requests.
- **Pin on the light map:** white alone is 1.06:1 against the base, so the separation is the dark hairline (composited over the base) plus the shadow; on the dark map the white 3 px border carries it.
- **Category colours** stay in `data.jsx` (23 hexes, 9 below 3:1 on white). They are fills, not borders or text: the glyph colour is chosen per fill (white or near-black, whichever contrasts more) and category is shown by glyph and colour, never colour alone.
- **Scrim:** no text sits on `--scrim` in Phase 1 (the stacked menu, E19, is deferred), so it has no pair.
