---
applyTo: "src/components/map/**"
description: "Use when creating or editing map components. Enforces raw Leaflet API pattern, SSR-safe dynamic imports, and proper cleanup."
---
# Map Component Rules

## Raw Leaflet Only — No react-leaflet

Use `L.map()`, `L.marker()`, `L.tileLayer()` directly in `useEffect`. Never use `<MapContainer>`, `<TileLayer>`, or any react-leaflet component — they break under React Strict Mode double-mounting.

## Required Pattern

Every map component must follow this structure:

```tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MyMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, zoom);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // ... markers, layers, handlers

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [/* deps */]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

## Mandatory Rules

1. **`map.remove()` in cleanup** — Always return a cleanup function that calls `map.remove()` and sets `mapRef.current = null`. Without this, React Strict Mode double-mount causes "Map container is already initialized".
2. **Guard against re-init** — Start useEffect with `if (!containerRef.current || mapRef.current) return;`
3. **`"use client"` directive** — Every map component is a client component.
4. **Dynamic import with `ssr: false`** — When importing a map component from a page or parent, always use: `const MyMap = dynamic(() => import("@/components/map/MyMap"), { ssr: false });` Leaflet accesses `window` and `document` — it cannot run server-side.
5. **Default icon setup** — Leaflet's default marker icon is broken in bundlers. Always define a custom icon using unpkg CDN URLs or local assets.
6. **No template literals in popup HTML** — Use string concatenation for popup content to avoid PowerShell escaping issues during code generation.
