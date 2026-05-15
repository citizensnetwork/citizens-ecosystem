---
applyTo: "src/components/map/**"
description: "Use when creating or editing map components. Enforces MapLibre GL JS API pattern, SSR-safe dynamic imports, and proper cleanup."
---
# Map Component Rules

## MapLibre GL JS — No Leaflet, No react-leaflet

Use `new maplibregl.Map()`, `new maplibregl.Marker()` directly in `useEffect`. The project uses MapLibre GL JS for all map rendering. Leaflet was removed.

## Shared Configuration

All map components import from `src/lib/map/config.ts`:
- `getMapStyle()` — Returns MapTiler vector style URL (if `NEXT_PUBLIC_MAPTILER_KEY` is set) or free OSM raster fallback
- `toLngLat(latLng)` — Converts `[lat, lng]` → `[lng, lat]` for MapLibre
- `DEFAULT_CENTER` — Pretoria `[-25.7479, 28.2293]` as `[lat, lng]`

**Never hardcode API keys in component files.** Always use `getMapStyle()`.

## Required Pattern

Every map component must follow this structure:

```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle, toLngLat, DEFAULT_CENTER } from "@/lib/map/config";

export default function MyMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: toLngLat(DEFAULT_CENTER),
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    mapRef.current = map;

    // ... markers, handlers

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [/* deps */]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

## Mandatory Rules

1. **`map.remove()` in cleanup** — Always return a cleanup function that calls `map.remove()` and resets `mapRef.current = null`.
2. **Guard against re-init** — Start useEffect with `if (!containerRef.current || mapRef.current) return;`
3. **`"use client"` directive** — Every map component is a client component.
4. **Dynamic import with `ssr: false`** — MapLibre accesses `window`/WebGL — cannot run server-side: `const MyMap = dynamic(() => import("@/components/map/MyMap"), { ssr: false });`
5. **Coordinate order** — MapLibre uses `[lng, lat]`. Always use `toLngLat()` when converting from `[lat, lng]` props.
6. **Marker elements** — Use `createCategoryMarkerEl()` and `createPlaceMarkerEl()` from `src/lib/map/markers.ts` for custom marker DOM elements. Use `{ color: "#D4AF37" }` for simple gold markers.
7. **Popup content** — Use CSS classes (`cc-popup`, `cc-popup-warning`) defined in globals.css. Always escape user input with `escapeHtml()`.
8. **Event listener cleanup** — When using `map.once("load", handler)`, always clean up with `map.off("load", handler)` in the effect cleanup to prevent stale closures.
