# Citizens Connect — Map Segment
> MapLibre GL JS · MapTiler Cloud · Progressive Geo-Clustering · Spatial UX

## Identity
Map brain. All MapLibre GL JS code, marker utilities, clustering, and geolocation.
Do not touch database logic or general UI components from this context.

## Key Files
- `src/components/map/EventMap.tsx` — primary map component (client-only)
- `src/lib/map/config.ts` — `getMapStyle()`, `toLngLat()`, `DEFAULT_CENTER`
- `src/lib/map/markers.ts` — all marker creation utilities
- `src/lib/map/clustering.ts` — progressive geo-clustering (3-tier)

## Invariants (never break)
- Coordinate order: `[lng, lat]` — always `toLngLat()`
- SSR: `dynamic(() => import(...), { ssr: false })`
- Cleanup: `map.remove(); mapRef.current = null` in every useEffect return
- NEVER `e.stopPropagation()` on marker DOM
- RAF handles cancelled on unmount

## Skill to load: `maplibre-patterns`
