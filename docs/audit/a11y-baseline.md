# Map v2 — Phase 0 audit: accessibility baseline (P0-06)

Measured 2026-10-10 on the flag-off page with `apps/connect/scripts/map-v2/a11y-baseline.mjs` (390 x 844, synthetic fixture); raw output `docs/audit/data/baseline-a11y.json`. Contrast = WCAG 2.x relative-luminance ratio computed from the hex values in `data.jsx`; M5 for pins is finally judged on sampled rendered pixels in P1-04 and P1-13.

## 1. Category colours against white and against the map base

23 distinct category hexes (`src/frontend/app/data.jsx:10-60`). Bases: white (the pin border and the sheet), `#F9F9F6` (the production style's background, `hsl(60,23%,97%)`, converted by hand, so rounded), and `--map-bg #EDE5D4` (shown only before tiles load).

**9 of 23 are below 3:1 on white and 10 of 23 below 3:1 on the production base**, so the category colour alone cannot carry a pin ring, a glyph or a border on the light map (M5; Appendix B `--cat-*`). Consequence for P1-04: the glyph colour is chosen per fill (white or near-black, whichever contrasts more, always at least 4.5:1), the pin edge uses a dark hairline that does not depend on the category, and category is shown by glyph plus colour, never colour alone (WCAG 1.4.1).

| hex     | vs white    | vs prod base #F9F9F6 | vs --map-bg #EDE5D4 |
| ------- | ----------- | -------------------- | ------------------- |
| #B8860B | 3.25        | 3.09                 | 2.6 **<3**          |
| #D4AF37 | 2.1 **<3**  | 1.99 **<3**          | 1.68 **<3**         |
| #1ABC9C | 2.41 **<3** | 2.28 **<3**          | 1.92 **<3**         |
| #F39C12 | 2.19 **<3** | 2.08 **<3**          | 1.75 **<3**         |
| #2ECC71 | 2.1 **<3**  | 1.99 **<3**          | 1.68 **<3**         |
| #FF6B35 | 2.84 **<3** | 2.69 **<3**          | 2.26 **<3**         |
| #E91E63 | 4.35        | 4.12                 | 3.47                |
| #9B59B6 | 4.67        | 4.43                 | 3.73                |
| #3498DB | 3.15        | 2.99 **<3**          | 2.52 **<3**         |
| #E74C3C | 3.82        | 3.62                 | 3.05                |
| #34495E | 9.29        | 8.81                 | 7.41                |
| #C71585 | 5.42        | 5.14                 | 4.33                |
| #FF8C42 | 2.31 **<3** | 2.19 **<3**          | 1.85 **<3**         |
| #00BCD4 | 2.3 **<3**  | 2.18 **<3**          | 1.83 **<3**         |
| #8E44AD | 5.87        | 5.56                 | 4.68                |
| #212121 | 16.1        | 15.27                | 12.85               |
| #5D6D7E | 5.31        | 5.03                 | 4.24                |
| #8B4513 | 7.1         | 6.73                 | 5.66                |
| #A67C00 | 3.82        | 3.62                 | 3.04                |
| #B59CD9 | 2.41 **<3** | 2.28 **<3**          | 1.92 **<3**         |
| #6FA89A | 2.71 **<3** | 2.57 **<3**          | 2.16 **<3**         |
| #C0392B | 5.44        | 5.16                 | 4.34                |
| #5B2C6F | 10.32       | 9.79                 | 8.24                |

Other pairs already computed for P1-02 (WCAG formula): `--gold #C9A84C` on white 2.29:1; `--gold-dark #8B6914` on white 5.09:1 and on `--map-bg` 4.06:1; `#0A0908` on `#C9A84C` 8.71:1. These are recomputed in `contrast.md` during P1-02.

## 2. Tap targets (CSS px)

From `baseline-m1-m6.json` (46 of 52 interactive elements on the map screen are under 44 px; 49 of 58 with the card open).

| Element                                         | Size                                        | Verdict              |
| ----------------------------------------------- | ------------------------------------------- | -------------------- |
| Place pin                                       | 34 x 34                                     | under 44             |
| Contributor pin (logo)                          | 38 x 38                                     | under 44             |
| Event pin                                       | 44 x 43                                     | 1 px short on height |
| Locate / zoom in / zoom out (MapLibre controls) | 29 x 29                                     | under 44             |
| Search input                                    | 253 x 20 (its row is taller)                | under 44             |
| Category pills                                  | 41 to 109 wide, 28.5 to 30.5 high           | under 44             |
| Pill scroll arrows                              | 28 x 28                                     | under 44             |
| Account button                                  | at least 44 x 44 (not in the under-44 list) | ok                   |
| Card close                                      | 28 x 28                                     | under 44             |
| Card icon buttons (website, message, share)     | 40 x 40                                     | under 44             |
| Card Follow / View Full Profile                 | full width x 44                             | ok                   |
| Bottom navigation                               | full width, tall                            | ok                   |

Scope note: Map v2 fixes pins (hit area padded to 44), the sheet's own controls and the map's locate and zoom buttons under the flag (E23). The category pills and the search row belong to the existing map chrome; they are recorded here and in the Run log rather than redesigned in this change (Q5), and listed as a follow-up.

## 3. Focus, keyboard and screen readers

| Check                           | Finding                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map pins are keyboard-reachable | **No.** The marker wrapper has no `tabindex`, no `role`, no `aria-label`; 0 of 8 markers are focusable.                                                                                  |
| Pins are announced              | **No.** The drawn pin is `aria-hidden="true"` and the wrapper carries nothing. The visible name label (`.cc-pin-label-text`) is plain text only from zoom 15 and is not tied to the pin. |
| Tab order                       | Map canvas, locate, zoom in, zoom out, search, account, pills ... A visible focus ring exists on most buttons (ring via box-shadow) and on the search input (2 px outline).              |
| `:focus-visible` rules          | 2 of 414 CSS rules scanned (inline `<style>` plus Tailwind's generated sheet).                                                                                                           |
| `prefers-reduced-motion`        | 2 media blocks (one is `.cc-pin-label`, `index.html:170`). The pin `transition: all .15s`, `pinPulse`, `slide-up`, `fade-in` and `bubbleBob` animations do not honour it.                |
| Dialog semantics                | The v1 preview card is a plain `div` (no `role="dialog"`, no label); it does register a Back guard.                                                                                      |

What Map v2 must deliver for these (P1-04, P1-06, P1-03): `role="button"`, `tabindex="0"`, `aria-label="{name}, {category}"` and Enter / Space on every pin, a visible focus ring, a labelled dialog for the sheet with the state change announced, and reduced-motion handling for every animation it adds.
