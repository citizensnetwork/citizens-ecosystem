# MapTiler Studio — "Citizens Connect Lite" style checklist

Purpose: produce a stripped-down vector style for Citizens Connect that keeps
only what users need to find, navigate to, and gather at events — so the map
stays smooth at high zoom and on mobile, and so our category markers /
clusters / convoy overlays remain the visual focus.

This is the **style-level** strip. A **runtime** safety-net pruner also runs
on every map load (`pruneBasemapLayers` in `src/lib/map/config.ts`) and
removes the obvious clutter even if the Cloud style is later edited
incorrectly. Doing both is intentional.

---

## 1 · Duplicate the live style

1. Sign in to <https://cloud.maptiler.com/>.
2. Open the current Citizens Connect style: ID `019dba0f-b49b-73bb-bf6a-f9d820f43be8`.
3. **Duplicate** → name the copy `Citizens Connect Lite`.
4. Note the new UUID. Do **not** delete or edit the original yet — keep it as
   a rollback.

You will set `NEXT_PUBLIC_MAPTILER_STYLE=<new-uuid>` once QA is happy.

---

## 2 · Layers to REMOVE

In MapTiler Studio's Layers panel, find each group below and toggle the
layer off or delete it. Group names vary slightly between base styles; use
the search/filter input.

### Built environment

- [ ] **`building`** — building footprints (fill)
- [ ] **`building-3d`** / **`building-extrusion`** — 3D building extrusions
- [ ] **`housenumber`** — house number labels (any zoom)

### POIs (biggest visual + perf win)

- [ ] **All `poi_*` layers** — POI icons and POI labels at every zoom
      level. Citizens Connect markers ARE our POI layer; brand icons
      (Spar, KFC, Pick n Pay) actively compete with category markers
      and clusters.
- [ ] **`poi_z14`**, **`poi_z15`**, **`poi_z16`** etc. — strip them all.

### Transport noise

- [ ] **`aeroway`** — runways, taxiways, aprons
- [ ] **`aeroway_*`** — airport labels (keep the airport place label
      only if it's in the `place` source-layer; airport icons go).
- [ ] **`transit_*`** — bus stops, train stops, subway icons
- [ ] **`ferry`** — ferry routes
- [ ] **`pier`** — piers

### Terrain / raster overlays

- [ ] **`hillshade`** — raster hillshade overlay
- [ ] **`contour`** / **`contour_label`** — contour lines + elevation labels

### Optional (review case-by-case)

- [ ] **`landcover_*`** — landcover tints (woods, grass, sand). Cheap to
      keep if you like the look; remove if you want a flatter brand-aligned
      basemap.
- [ ] **`landuse_residential`** / **`landuse_commercial`** /
      **`landuse_industrial`** — coloured land tints. Removing these
      gives a clean white-and-road map that matches the 60/30/10 system.
      **Keep `landuse_park` / `landuse_cemetery`** — parks are where many
      outreaches happen.

---

## 3 · Layers to KEEP (must not be removed)

- All **`transportation`** layers — roads at every class. Convoy mode,
  "locate at specific spot", and driving directions depend on a
  recognizable road network.
- All **`transportation_name`** layers — road labels. Keep at z14+; you
  can push minor-road labels to z16+ for cleanliness.
- **`place_country`**, **`place_state`**, **`place_city`**, **`place_town`**,
  **`place_village`**, **`place_suburb`**, **`place_neighbourhood`** — users
  orient by suburb in SA. Critical.
- **`water`**, **`waterway`**, **`water_name`** — geographic anchors.
- **`boundary_*`** — country and province outlines (keep faint).
- **`landuse_park`**, **`park`**, **`park_label`** — parks are valid event
  venues.
- **`background`** — the base fill colour.

---

## 4 · Font / glyph trims (small win)

In the style's `glyphs` and individual symbol layers:

- [ ] Reduce font stack to one family (e.g. `Noto Sans Regular`) plus a
      single fallback (`Noto Sans Bold` only for labels that use it).
      Remove unused weights and language fallbacks.
- [ ] Confirm `text-font` arrays in every kept symbol layer reference only
      fonts that are actually present in `glyphs`. Missing fonts trigger
      slow on-demand glyph fetches.

---

## 5 · Visual polish (cosmetic, not perf)

- Background fill → `#FAFAF7` (Citizens white) for the cleanest brand match.
- Road casing → very light grey (`#E5E5E0`); road fill → white.
- Park fill → very pale gold-green or neutral (avoid saturated green that
  competes with markers).
- Water fill → soft neutral blue-grey, not saturated.
- All labels → near-black `#111111`, halo `#FAFAF7`.

---

## 6 · Save → publish → swap in

1. Save the style in MapTiler Studio.
2. Hit **Publish** (required for production use under your API key).
3. Copy the new style UUID.
4. Update environment variables:
   - **Local dev:** `.env.local` → `NEXT_PUBLIC_MAPTILER_STYLE=<new-uuid>`
   - **Vercel:** Project → Settings → Environment Variables → update
     `NEXT_PUBLIC_MAPTILER_STYLE` for Production, Preview, Development.
5. Redeploy.
6. Smoke-check on the deployed map:
   - Zoom from province → city → suburb → street. Confirm smoothness.
   - Confirm category markers + gold clusters are clearly dominant.
   - Confirm road network is still legible at z14–z18.
   - Confirm suburb labels appear at expected zooms.

---

## 7 · Rollback

If anything looks wrong:

```bash
# Vercel CLI
vercel env rm NEXT_PUBLIC_MAPTILER_STYLE production
# then re-add with the OLD UUID:
vercel env add NEXT_PUBLIC_MAPTILER_STYLE production
# value: 019dba0f-b49b-73bb-bf6a-f9d820f43be8
```

Or simply paste the original UUID back into the env var via the Vercel
dashboard and redeploy. The original style is untouched.

---

## 8 · Runtime safety-net (already in code)

`src/lib/map/config.ts` exports `pruneBasemapLayers(map)` which runs on
every map's `style.load` event. It removes POI / building / aeroway /
transit / ferry / housenumber / contour layers at runtime, so even if
the Cloud style is later edited and one of these slips back in, the
deployed app will strip it. Disable temporarily with
`NEXT_PUBLIC_MAP_PRUNE=off` for debugging.

If you want to compare lite vs. full at runtime, set:

```bash
# Full style + runtime prune off → see everything
NEXT_PUBLIC_MAPTILER_STYLE=019dba0f-b49b-73bb-bf6a-f9d820f43be8
NEXT_PUBLIC_MAP_PRUNE=off

# Lite style + runtime prune on (production default)
NEXT_PUBLIC_MAPTILER_STYLE=<lite-uuid>
# NEXT_PUBLIC_MAP_PRUNE unset (defaults to on)
```
