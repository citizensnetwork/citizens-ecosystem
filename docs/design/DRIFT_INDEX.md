# The drift index, version 1 (frozen)

> **Status:** frozen on 2026-10-17 with `docs/design/DESIGN.md` (Designer build, phase 1). **Owner:** the Designer role ([`../../apps/connect/docs/routines/designer.md`](../../apps/connect/docs/routines/designer.md), section 6). **Rule:** a change to anything on this page (the sets, the exclusions, the counted kinds, the gold band, the formula) is a founder decision card, never a quiet edit; otherwise the week-to-week trend means nothing.

## 1. What it measures

How many different raw design values a screen's source carries **outside its token blocks**, per thousand lines. A value that is read through a token (`var(--space-4)`) is not drift; a literal `13px`, `#f4f2ec` or `box-shadow: 0 1px 3px rgba(0,0,0,.2)` written into a component is. **Lower is better.** Only the trend from week to week and the comparison between apps carry meaning; the absolute number is not a grade.

## 2. Definition (version 1)

**Source set per app** (tracked files, `git ls-files`, extensions `.jsx .js .css .html`, never a `/vendor/` path, never `config.example.js`):

| App     | Directories                 |
| ------- | --------------------------- |
| Connect | `apps/connect/src/frontend` |
| Vision  | `apps/vision/src/frontend`  |
| Wear    | `apps/wear/src/frontend`    |

`packages/ui` has no consumer, so it has no index; it is read for the gold survey only (section 4). `apps/wear/src/styles/globals.css` is not in Wear's set: no page, build file or Tailwind config imports it (a leftover of an earlier build; a cleanup item, not drift).

**Preparation.** Remove `/* */` and `<!-- -->` comments and `//` line comments (a `//` at the start of a line or after a space). A line is a **token line**, and is skipped for every kind except the gold survey, when it is a CSS custom-property declaration (`--name: value`, at the start of the line) or it lies inside the Tailwind config block (from the line containing `tailwind.config =` to the first line that is only `};`).

**Counted kinds** (the number of **distinct normalised values** of each, over all the app's files, outside token lines):

| Kind       | Matched                                                                                                                                                           | Skipped values                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colours    | `#rgb`, `#rrggbb`, `#rrggbbaa` (3-digit forms expanded to 6) and `rgb( rgba( hsl( hsla(` literals (leading-zero decimals unified, whitespace removed, lower case) | the eight colours of the Google sign-in "G" mark (a third-party brand mark, used only in the two sign-in screens), anything containing `var(` or a runtime expression |
| font sizes | `font-size:`, `fontSize:` (a bare number means px) and Tailwind `text-[..]`                                                                                       | `var(` values, `0`, `inherit`, `initial`, `unset`                                                                                                                     |
| radii      | `border-radius:`, `borderRadius:` and `rounded-[..]`                                                                                                              | the same                                                                                                                                                              |
| shadows    | `box-shadow:`, `boxShadow:` (a quoted string) and `shadow-[..]`                                                                                                   | the same, and `none`                                                                                                                                                  |
| z-index    | `z-index:`, `zIndex:` and `z-[..]`                                                                                                                                | the same                                                                                                                                                              |

Tailwind **scale** classes (`text-sm`, `rounded-lg`) are not counted: they are a scale, not a raw value. Spacing is not counted in version 1 (Connect's inline styles mix numbers and strings; a later version may add it).

**Fill gold.** A 6-digit hex colour with hue 38 to 52 degrees, saturation at least 0.45 and lightness 0.50 to 0.56. This catches a gold used as a fill and leaves out its darker ink, its lighter tints and orange. It is counted over **all** colour literals in the app, token lines included, because a second brand gold that lives only in a token block is still a second gold.

**Formula.** `DI = (distinct values over the five kinds + 5 for each fill gold beyond the first) / (lines of the source set / 1000)`, to two decimals. Lines are the newline-separated segments of each file (the script's `loc`), blank lines and comments included. The **total** uses the union of values across the three apps (a value shared by two apps counts once), the sum of lines, and the fill golds of the union.

## 3. Implementation

The version-1 counter is `apps/connect/scripts/design/drift.mjs` (phase 2 of the Designer build). It is pinned by `apps/connect/src/__tests__/scripts/designDrift.test.ts`, whose fixtures hold counts known by hand, and it reproduces the baseline of section 4 exactly on the commit named there. Run it from a clean checkout:

```text
node apps/connect/scripts/design/drift.mjs [--list] [--json]
```

`--list` prints every distinct value; `--json` prints the numbers for a script. `node apps/connect/scripts/design/audit.mjs` prints the same table and adds a surface view and the captures. The first version of this index was a standalone reference script printed on this page (pull request #136); the counter replaced it with the same rules and the same output, so there is one source of truth, in the tested file.

## 4. Baseline, measured 2026-10-17 on `origin/main` at `f14b0c8` (the commit before the Designer specification merged; later commits in this pull request are docs only and change no number)

Command: `node apps/connect/scripts/design/drift.mjs`, run on a clean checkout of that commit (checked again on 2026-10-17 by the phase 2 counter: the output matches this table exactly).

| App                                     | Files |  Lines | Colours | Font sizes | Radii | Shadows | z-index | Distinct | Fill golds                                    |        DI |
| --------------------------------------- | ----: | -----: | ------: | ---------: | ----: | ------: | ------: | -------: | --------------------------------------------- | --------: |
| Connect                                 |    37 | 13,785 |      96 |          7 |    10 |      13 |       6 |      132 | 2: `#c9a84c`, `#d4af37`                       |  **9.94** |
| Vision                                  |    14 |  3,715 |       9 |         16 |     9 |       0 |       0 |       34 | 2: `#d4af37`, `#f0c024`                       | **10.50** |
| Wear                                    |    22 | 10,279 |      93 |         22 |    16 |       8 |       4 |      143 | 1: `#f2ba1b`                                  | **13.91** |
| **Total** (three apps, union of values) |    73 | 27,779 |     n/a |        n/a |   n/a |     n/a |     n/a |      265 | 4: `#c9a84c`, `#d4af37`, `#f0c024`, `#f2ba1b` | **10.08** |
| `packages/ui` (gold survey only)        |   n/a |    n/a |     n/a |        n/a |   n/a |     n/a |     n/a |      n/a | 1: `#c9a24a`                                  |       n/a |

Across the whole platform (the three apps and `packages/ui`) the script finds **five** different fill golds: `#c9a24a`, `#c9a84c`, `#d4af37`, `#f0c024`, `#f2ba1b`. The Designer specification said three; that count came from a search for three known values and missed the two golds that live in Vision's and Wear's own pages.

## 5. How to read it, and what it cannot see

- **Connect's number is not Map v2's.** Map v2's stylesheet has no raw values outside its token blocks (a test enforces it); Connect's figure comes from the older screens, and the three apps are not on one footing: Wear and Vision write sizes inline, Connect mixes inline styles and Tailwind classes.
- **It does not read Tailwind scale classes, images, icon artwork, copy or motion.** A screen can have a low index and still be hard to use; the parity checklist and the Designer's own judgement cover that.
- **A custom-property declaration is a token line only when it starts the line** (`--name: value`). One written on its selector's line (`:root { --a: #fff; }`) is counted as a raw value. Every token block in the three apps puts one declaration group per line, so this has no effect today; the test pins the rule.
- **A shadow built by string concatenation** is counted by its leading quoted literal (`'0 0 2px '+fill+'73'` counts as `0 0 2px`); a template literal with `${}` is skipped.
- **Server-side TypeScript** that carries colours (`apps/connect/src/lib/categories.ts`, `apps/connect/src/lib/map/markers.ts`) is outside the source sets, so Connect's index does not see its raw values (its golds repeat ones already counted).
- **Dynamic values** (a colour built from data at run time) are not counted; a category colour list in `data.jsx` is counted once per literal.
- **Parity** (how many of the 14 screens pass the nine-item checklist) is **not measured** in version 1: it needs the captures that phase 2 adds. **Findability** (the probe of public search terms) is **not measured** for the same reason.
- The numbers belong to a commit. A Designer run that quotes a drift figure names the commit it measured.
