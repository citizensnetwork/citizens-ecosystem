# Map v2 — token contrast (P1-02, M5)

Computed with the WCAG 2.x relative-luminance formula by `apps/connect/scripts/map-v2/contrast.mjs` from the token values in `apps/connect/src/frontend/assets/map-v2.css`, light and dark sets. `src/__tests__/frontend/mapV2Tokens.test.ts` fails the unit tests if any pair drops under its threshold. These ratios are **calculated from token values**; the final pin check is on sampled rendered pixels (P1-04, `docs/audit/phase1-qa.md`).

| Pair                                                                                             | Needs | Light | Dark  |
| ------------------------------------------------------------------------------------------------ | ----- | ----- | ----- |
| Primary text on the app background (`--text-1` on `--surface-0`)                                 | 4.5:1 | 18.12 | 18.12 |
| Primary text on the sheet (`--text-1` on `--surface-1`)                                          | 4.5:1 | 19.90 | 16.26 |
| Primary text on a raised surface (`--text-1` on `--surface-2`)                                   | 4.5:1 | 17.65 | 14.39 |
| Secondary text on the app background (`--text-2` on `--surface-0`)                               | 4.5:1 | 6.82  | 9.08  |
| Secondary text on the sheet (`--text-2` on `--surface-1`)                                        | 4.5:1 | 7.48  | 8.15  |
| Secondary text on a raised surface (`--text-2` on `--surface-2`)                                 | 4.5:1 | 6.64  | 7.21  |
| Accent label on the accent fill (`--accent-contrast` on `--accent`)                              | 4.5:1 | 8.71  | 8.71  |
| Gold ink as text on the sheet (`--accent-ink` on `--surface-1`)                                  | 4.5:1 | 5.09  | 12.09 |
| Gold ink as text on a raised surface (`--accent-ink` on `--surface-2`)                           | 4.5:1 | 4.51  | 10.70 |
| Gold ink as text on the app background (`--accent-ink` on `--surface-0`)                         | 4.5:1 | 4.63  | 13.47 |
| Open (green) text on the sheet (`--ok` on `--surface-1`)                                         | 4.5:1 | 6.51  | 9.80  |
| Closed (red) text on the sheet (`--closed` on `--surface-1`)                                     | 4.5:1 | 7.10  | 8.07  |
| Error text on the sheet (`--error` on `--surface-1`)                                             | 4.5:1 | 7.10  | 8.07  |
| Pin name label on the map base (`--pin-label` on `--map-base`)                                   | 4.5:1 | 17.51 | 13.25 |
| Gold ink as an icon or ring on the sheet (`--accent-ink` on `--surface-1`)                       | 3:1   | 5.09  | 12.09 |
| Focus ring on the sheet (`--focus-ring` on `--surface-1`)                                        | 3:1   | 5.09  | 12.09 |
| Focus ring on the app background (`--focus-ring` on `--surface-0`)                               | 3:1   | 4.63  | 13.47 |
| Focus ring on a raised surface (`--focus-ring` on `--surface-2`)                                 | 3:1   | 4.51  | 10.70 |
| Pin white border on the map base (`--pin-border` on `--map-base`)                                | 3:1   | n/a   | 14.55 |
| Pin dark hairline on the map base (composited) (`--pin-hairline` on `--map-base`)                | 3:1   | 5.59  | n/a   |
| Category glyph on its category fill: best of white or `#0a0908`, worst of 23 colours (`#e91e63`) | 4.5:1 | 4.58  | 4.58  |

## Notes

- **Gold (D3):** `--accent #c9a84c` is a fill with the near-black label `#0a0908`. For gold text, rings and icons on light surfaces use `--accent-ink #8b6914`. Plain gold on white is 2.29:1, so it is never used as text, a ring or an icon on the light set.
- **Difference from `packages/ui` (for RESUME C17):** `packages/ui/src/tokens.ts` has gold `#C9A24A`; Connect's `index.html` `:root` has `--gold #C9A84C`, `--gold-dark #8B6914`, `--gold-crown #D4AF37`. Map v2 starts from Connect's values (`#C9A84C`, `#8B6914`) and adds no new gold. Nothing in `packages/ui` is changed (it has no consumer).
- **Pin on the light map:** white alone is 1.06:1 against the base, so the separation is the dark hairline (composited over the base) plus the shadow; on the dark map the white 3 px border carries it.
- **Category colours** stay in `data.jsx` (23 hexes, 9 below 3:1 on white). They are fills, not borders or text: the glyph colour is chosen per fill (white or near-black, whichever contrasts more) and category is shown by glyph and colour, never colour alone.
- **Scrim:** no text sits on `--scrim` in Phase 1 (the stacked menu, E19, is deferred), so it has no pair.
