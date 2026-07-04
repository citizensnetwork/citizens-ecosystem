---
name: maplibre-patterns
description: >
  MapLibre GL JS patterns for Citizens Connect. Auto-loads when working on
  map components, markers, clustering, or any spatial UX feature.
---

# MapLibre Patterns Skill — Citizens Connect

## Golden Rules
1. `[lng, lat]` order — always `toLngLat()` from `src/lib/map/config.ts`
2. Never SSR — `dynamic(() => import(...), { ssr: false })`
3. Always cleanup — `map.remove(); mapRef.current = null` in useEffect return
4. Never `e.stopPropagation()` on marker DOM
5. RAF handles — store in refs, cancel in cleanup

## Initialisation
```typescript
const mapRef = useRef<maplibregl.Map | null>(null);
useEffect(() => {
  if (!containerRef.current || mapRef.current) return;
  const map = new maplibregl.Map({
    container: containerRef.current,
    style: getMapStyle(),
    center: toLngLat(DEFAULT_CENTER),
    zoom: 12,
  });
  mapRef.current = map;
  return () => { map.remove(); mapRef.current = null; };
}, []);
```

## Marker Pattern
```typescript
const el = createCategoryMarkerEl(event.category, getTemporalStyle(event.date));
const marker = new maplibregl.Marker({ element: el })
  .setLngLat(toLngLat([event.lat, event.lng]))
  .addTo(map);
markersRef.current.set(event.id, marker);  // store in ref, not state
```

## Canvas Click Handler
```typescript
map.on("click", (e) => {
  const target = e.originalEvent.target as Element;
  const isMarker = target.closest('.cc-marker, .cc-place-marker, .cc-geo-cluster, .maplibregl-popup');
  if (!isMarker) collapseInnermostTier();
});
```

## Common Mistakes
- Calling `map.on(...)` inside render (not useEffect) — always add cleanup `map.off(...)`
- Not guarding `if (!mapRef.current) return` in event handlers
- Forgetting `dataset.temporalOpacity` on new markers (breaks opacity composition)
