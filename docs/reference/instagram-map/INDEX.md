# Instagram map — internal reference pack

Source: Stephen's Android screen recording of Instagram (dark mode), 3 Oct 2026, 5 min 9 s.
Frames: 392 × 850 px, full screen including status and navigation bars. Prepared 5 Oct 2026.
Frame ids (R01–R19) match `docs/MAP_UX_TRACKER.md`.

## Use rules

1. Patterns and behaviour only. Do not copy Instagram logos, icon artwork, the pink-orange-yellow ring colourway, strings or fonts.
2. The frames contain third-party photos and handles. Internal reference only: keep out of the production build, keep the `.jpg` files out of git (`docs/reference/instagram-map/*.jpg` in `.gitignore`), do not publish.
3. Omitted on purpose: two frames that show private individuals' names and last-known locations (the in-app share contact grid at 2:54 and the friend search at 5:03). Redacted: first-name labels (R17) and the story owner's handle (R18).
4. Two surfaces appear. A: place map with photo pins, "Search this area" and a bottom sheet (0:00–3:06). B: friends / stories layer with story tiles (3:09–5:09). The recording does not show how the user moves from A to B.
5. Numbers are approximate, read from 392 px-wide frames. Treat them as proportions, not specifications.

## Frames

| Id  | File                                  | Time | What to look at                                                                                                                                                                                                                              |
| --- | ------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | R01_map-overview_t0000.jpg            | 0:00 | Photo pins ≈ 52 px (≈ 13 % of width), white border ≈ 3 px, tail, name and "+N more" beneath. Peek bar at the bottom: avatar, area name, weather, search. Top: round back and locate buttons (≈ 48 px) and a centred "Search this area" pill. |
| R02 | R02_dense-labels_t0006.jpg            | 0:06 | Gradient ring = unseen story; white ring = none. Labels ≈ 8–9 px overlap where pins are dense (weak spot).                                                                                                                                   |
| R03 | R03_region-collapse_t0024.jpg         | 0:24 | Region zoom: every pin collapses into one with "+37 more". Peek bar area name stays the same.                                                                                                                                                |
| R04 | R04_pin-selected-sheet-half_t0039.jpg | 0:39 | Selected pin ≈ 2× (≈ 52 → 108 px). Sheet at ≈ 46 % of height, header already filled, spinner where content will load. "See all nearby" pill floats over the content.                                                                         |
| R05 | R05_sheet-full-grid_t0045.jpg         | 0:45 | Sheet at ≈ 90 % of height. 3-column grid, ≈ 2 px gaps, one tile spans 2 rows (video). Top / Recent tabs. Header collapsed to avatar, name, ⋮ and ✕; share and save icons.                                                                    |
| R06 | R06_ring-header-grid_t0057.jpg        | 0:57 | Place header with a ring on the avatar; category, "Closed" in red, Directions and More info as links.                                                                                                                                        |
| R07 | R07_top-posts-feed_t0100.jpg          | 1:00 | Full-screen feed titled "Top posts". Per post: avatar, handle, tick, place, Follow, ⋮; counts; caption; date; back arrow top-left.                                                                                                           |
| R08 | R08_follow-message-header_t0133.jpg   | 1:33 | Business header: Follow (filled) and Message (grey) as two equal-width buttons; handle under the name.                                                                                                                                       |
| R09 | R09_more-menu-stacked-sheet_t0139.jpg | 1:39 | Second sheet stacked over the first: address, Report (red), Open in Maps, Copy, Show QR code, Share to. Map dimmed; tapping the map dismisses it.                                                                                            |
| R10 | R10_story-viewer_t0142.jpg            | 1:42 | Full-screen vertical story: segmented progress bar, age stamp ("9h"), reply bar, heart and share.                                                                                                                                            |
| R11 | R11_area-list-expanded_t0203.jpg      | 2:03 | Peek bar pulled up into a nearby list. Row: avatar, name, category, count bucket, 3-photo strip.                                                                                                                                             |
| R12 | R12_open-24h-state_t0221.jpg          | 2:21 | "Open • 24 Hours" in green; category "Performance & Event Venue".                                                                                                                                                                            |
| R13 | R13_story-unavailable_t0230.jpg       | 2:30 | Weak spot: "This story is unavailable." on a black screen, no action offered; the ring on the map still showed. Seen three times (2:30, 2:51, 2:57).                                                                                         |
| R14 | R14_area-list-count-buckets_t0236.jpg | 2:36 | Count buckets: "105K posts", "5000+ posts", "Fewer than 100 posts".                                                                                                                                                                          |
| R15 | R15_friends-layer-tiles_t0309.jpg     | 3:09 | Friends layer: 3:4 rounded tiles with gradient ring and "+N more"; hero circle with a location badge and a dark pill "Name · See more ›"; banner "Device location off"; "Search for friends…" bar; bookmark button with a dot.               |
| R16 | R16_post-modal-over-map_t0412.jpg     | 4:12 | A single post opening as a bottom-up modal over the map, back arrow top-left.                                                                                                                                                                |
| R17 | R17_cluster-fanout_t0424.jpg          | 4:24 | Cluster tap: map blurs, title pill with the place name, back arrow becomes ✕, tiles scattered and labelled with first name and age (labels redacted here). Skeleton tiles show first.                                                        |
| R18 | R18_story-location-sticker_t0430.jpg  | 4:30 | A story with a location sticker pill; the sticker is what places the story on the map (owner header redacted).                                                                                                                               |
| R19 | R19_friends-layer-city-zoom_t0451.jpg | 4:51 | Same layer at city zoom; one tile with "+1 more".                                                                                                                                                                                            |

## Transitions (analysed frame by frame; not captured as stills)

- Zoom: pin photos disappear for ≈ 0.2–0.4 s, then reappear re-clustered.
- Pin tap: sheet opens to half with the header filled; content arrives about 3 s to more than 6 s later (R04 → R05).
- Cluster tap: map blurs, skeleton tiles show for ≤ 0.5 s (4 fps sampling), then images fill in (R17).
- ⋮ menu: a second sheet stacks over the first; closing returns to the previous sheet state (R09).
- "Search this area": the pill changes to "Loading"; new pins arrive about 3 s later.
