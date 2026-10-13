# Map v2 — Phase 0 audit: tile provider and style options (P0-02)

Researched 2026-10-10. Provider facts are read from each provider's own pages on that date (URLs below); nothing is from memory. No account was created and no API key was created. The style probes used the one MapTiler key already in `apps/connect/.env.local` (a public client key by design, never printed), one `style.json` request per candidate id.

## What the live map actually uses

**CORRECTION to the tracker and RESUME_HERE ("MapTiler `streets-v2`"):** the production `config.js` (`https://www.citizenscentral.co.za/config.js`, public, key redacted here) sets `MAPTILER_STYLE` to a **custom MapTiler style**, the same id as the local `.env.local`. MapTiler names it "Dataviz - CitizensConnect Gold 1 copy". `streets-v2` is only the code default (`map.jsx:90`, `build-frontend.js:118`) and is what a build with the variable unset would show.

| Style                                | Layers | Symbol layers                                          | POI icon layers                                                                                                                         | Background                             |
| ------------------------------------ | ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Production custom ("Dataviz … Gold") | 46     | 20, all text labels (ocean, sea, road, place, city...) | **0**                                                                                                                                   | `hsl(60, 23%, 97%)` (about `#F9F9F6`)  |
| `streets-v2` (code default)          | 90     | 33                                                     | 11 (`source-layer: poi`: Public, Sport, Education, Tourism, Culture, Shopping, Food, Transport, Park, Healthcare, Station) plus airport | `hsl(47,79%,94%)` to `hsl(42,49%,93%)` |

## Does MapTiler offer a dark style, and does it need a new key or tier?

**Yes, with the existing key.** HTTP status of `GET https://api.maptiler.com/maps/<id>/style.json` with the existing key, 2026-10-10:

| Id                | Status  | Layers | POI icon layers                |
| ----------------- | ------- | ------ | ------------------------------ |
| `dataviz-dark`    | **200** | 42     | 0 (background `hsl(0,0%,16%)`) |
| `dataviz-light`   | 200     | 42     | 0                              |
| `streets-v2-dark` | 200     | 90     | 11                             |
| `streets-v4-dark` | 200     | 163    | 1                              |
| `basic-v2-dark`   | 200     | 30     | 0                              |
| `backdrop-dark`   | 200     | 37     | 0                              |
| `bright-v2-dark`  | 200     | 85     | 1                              |
| `dark-matter`     | 404     | —      | —                              |

No new key, account or tier is needed for the standard dark styles. **Recommendation for P1-12: `dataviz-dark`**: it is the dark sibling of the family the production style is built on, draws no POI icons (so our pins stay the only saturated marks, E10), and has the fewest layers (cheapest to render on a mid-range phone). The id is a constant in code with an optional override, so no new environment variable has to go through `turbo.json` `globalEnv` and the build script. D4 is **not** triggered: P1-12 proceeds. If the founder wants the "Gold" look in dark too, a second custom style can be made in the MapTiler dashboard (an account action, not done here).

**E10 (base-map POI icons competing with our pins):** not an issue on the production style (0 POI layers). If the style were ever `streets-v2`, the 11 POI layers can be hidden at runtime with `map.setLayoutProperty(id, 'visibility', 'none')` for layers whose `source-layer` is `poi`, with no new style or key. Decision: ADOPT as "nothing to do on production".

## Usage, limits, cost

Source: https://www.maptiler.com/cloud/pricing/ (accessed 2026-10-10), https://www.maptiler.com/terms/ (accessed 2026-10-10, sections 3.3, 6.1, 6.7).

| Plan   | Price            | Included sessions / month | Included API requests / month | Commercial use                                                                 | Attribution                  | Overage                                      | Custom styles |
| ------ | ---------------- | ------------------------- | ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------- | ------------- |
| Free   | $0               | 5k                        | 100k                          | **Not allowed** ("testing, PoC, prototyping, personal, or non-commercial use") | MapTiler **logo** on the map | none: the service pauses until next month    | 5             |
| Flex   | $30 / month      | 25k                       | 500k                          | not stated on the page                                                         | logo only for 3D sessions    | sessions $2.50 / 1k, API requests $0.15 / 1k | 20            |
| Custom | prepaid contract | custom                    | custom                        | "contact us"                                                                   | logo only for 3D             | custom                                       | 1000+         |

The terms add: free accounts "may only use the Services up to the quota" (3.3); attribution "© MapTiler" is required and free accounts show the logo instead (6.1); "© OpenStreetMap" for OSM-based maps (6.2); attribution must always be visible (6.7); map content may not be modified (4.4). The terms **do not define "non-commercial" and do not mention non-profits**. This is a summary, not legal advice.

**Measured cost of one map view** (`scripts/map-v2/tiles-usage.mjs`, real tiles, the production style, 390 × 844 at ×3):

| Step                                        | `api.maptiler.com` requests                                        |
| ------------------------------------------- | ------------------------------------------------------------------ |
| First view at zoom 12                       | 10 (1 style + 9 tiles)                                             |
| A short browse (3 pans + zoom to 14)        | +7                                                                 |
| Switching to `dataviz-dark` on the same map | +12 (1 style, 10 tiles, 1 sprite), only for people who choose dark |

Assumptions: about 17 requests per visit; a theme switch adds 12 for the few who use it; glyph requests were not observed (0), and I cannot tell from the pages whether MapTiler meters a raw MapLibre client in "sessions", "API requests", or both, so both limits are shown.

| Visits to the map per month | Requests (×17) | Fits Free (100k requests, 5k sessions)? | Monthly cost                                                                                       |
| --------------------------- | -------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1,000                       | 17,000         | yes                                     | $0                                                                                                 |
| 5,000                       | 85,000         | yes, at the session limit               | $0                                                                                                 |
| 10,000                      | 170,000        | no                                      | Flex $30 (500k requests, 25k sessions)                                                             |
| 25,000                      | 425,000        | no                                      | Flex $30                                                                                           |
| 40,000                      | 680,000        | no                                      | Flex $30 + about $27 overage on requests (180k × $0.15 / 1k), and sessions above 25k at $2.50 / 1k |

Range: **$0 to $30 per month at up to about 25,000 visits a month**. Traffic today is tiny (live data: 16 profiles, 5 Contributors), so P1-12 stays inside the free quota by a wide margin; the dark style adds tile requests only for people who switch.

**Open licence questions for the founder** (new decision **D12** in the tracker): (1) which MapTiler plan the account is on; (2) whether Citizens, a public benefit organisation, counts as "non-commercial" under the Free plan, because the Free plan forbids commercial use and requires the logo; (3) the live map shows the text attribution "© MapTiler © OpenStreetMap contributors" but, in my screenshot (`docs/audit/img/baseline-flagoff-390x844-realtiles-z14.png`), no MapTiler logo. I cannot see the account, so I make no claim that the plan is wrong. This predates Map v2 and does not block it.

## Two alternatives, same facts

|                         | OpenFreeMap                                                                                                                                                            | Stadia Maps                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                  | https://openfreemap.org/ (accessed 2026-10-10)                                                                                                                         | https://stadiamaps.com/pricing/ (accessed 2026-10-10)                                                                                                   |
| Cost                    | Free public instance, "no limits on the number of map views or requests"                                                                                               | Free $0 (200,000 credits / month, no extra usage); Starter $20 (1M credits, 3¢ per 1,000 extra); Standard $80 (7.5M, 2¢); Professional $250 (25M, 1.5¢) |
| Key / account           | none ("no registration, no API keys")                                                                                                                                  | account and key required                                                                                                                                |
| Commercial use          | yes                                                                                                                                                                    | Free: **not allowed**; Starter and up: permitted. Non-profits not addressed on the page                                                                 |
| Dark style              | yes (styles: Positron, Bright, Liberty, Dark, Fiord, 3D)                                                                                                               | not stated on the pricing page; not confirmed                                                                                                           |
| Attribution             | "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (MapLibre adds it)                                                                                               | rules on a separate page, not read                                                                                                                      |
| What switching costs us | a different look (our "Gold" custom style would be lost), and `next.config.ts` CSP `img-src` / `connect-src` would need the provider's host: a security-surface change | account, key (credential handling), CSP change, and a look change                                                                                       |

**Recommendation: stay on MapTiler.** The existing key already serves a dark style; the alternatives would change the look the founder chose, need a CSP change, and (Stadia) a new account. OpenFreeMap is the fallback if the MapTiler licence question (D12) goes the wrong way: it costs $0, has a dark style and allows commercial use, at the price of the CSP change and a new base-map design pass.
