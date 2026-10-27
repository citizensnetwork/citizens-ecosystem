# "Online in this area": does the globe cost the map anything? (measured 2026-10-22)

Tool: `apps/connect/scripts/map-v2/online-measure.mjs` (issue #259, PR C). The same page, seed and 10-second sine-sweep pan as M3 in `measure.mjs`:
Chromium through CDP, **CPU x4**, Fast 4G values, 390x844 at 3x, mock tiles (so what is measured is what Map v2 and the globe add), the GPU
flags from `harness.mjs` (headless software GL would measure the wrong thing). Three runs per cell, alternating **off** (the globe switched off for the
page, the map as it was) and **on** (the globe on, the area served, so it resolves the area, asks for the list, draws the button and keeps listening
while the map is panned). Medians of the three runs are shown, in milliseconds per frame. A slow machine and a busy minute move both columns
together, which is why they alternate.

| Pins | Zoom | Frame time, off: p50 / p95 / p99 | Frame time, on: p50 / p95 / p99 | Frames over 32 ms, off | Frames over 32 ms, on |
| ---- | ---- | -------------------------------- | ------------------------------- | ---------------------- | --------------------- |
| 50   | 13   | 30 / 43 / 53                     | 31 / 43 / 48                    | 134                    | 154                   |
| 50   | 15.5 | 35 / 56 / 67                     | 34 / 51 / 57                    | 173                    | 173                   |
| 150  | 13   | 76 / 112 / 139                   | 79 / 104 / 121                  | 112                    | 110                   |
| 150  | 15.5 | 97 / 158 / 536                   | 84 / 158 / 175                  | 91                     | 94                    |

**Reading it:** on is within the run-to-run noise of off in every cell (the three runs of one cell differ from each other by more than on differs from
off); it is not worse. The absolute numbers are high because the profile is CPU x4 on an integrated GPU, as in every earlier M3 run; compare the
columns, not the numbers with a phone.

## What it asks for

Per page load with the globe on (counted from the browser, not the server):

| Request                                   | When                                                                                                                | How many                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `GET /api/v1/service-areas`               | once, when the map first exists                                                                                     | 1 (cached an hour at the edge, so mostly a CDN hit) |
| `GET /api/v1/service-areas?parent=<city>` | once per city, only when the zoom is close enough for a suburb to count (12.5)                                      | 0 or 1 per city                                     |
| `GET /api/v1/serving?area=<id>`           | once the map has been still for 400 ms and the area in view is one that had not been asked about in the last minute | 1 per NEW area                                      |

During the 10-second sweep (100 to 350 `moveend` events, all inside one city) the globe made **0 requests**: a settle in the same area adds nothing.
The only per-frame work is clearing and re-arming one 400 ms timer. With the globe **off** it made **0 requests** and drew nothing (checked by a Playwright
spec on the old map too).

Not measured: real MapTiler tile cost (the globe adds no tile), a real phone, the live server's response time for `/api/v1/serving`.
