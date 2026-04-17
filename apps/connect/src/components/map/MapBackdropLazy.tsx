"use client";

import dynamic from "next/dynamic";

/**
 * Client-only lazy wrapper around {@link MapBackdrop}. Server Components
 * can't use `next/dynamic` with `ssr: false`, so we hop through this
 * client component — MapLibre GL touches `window`/WebGL and must not run
 * during SSR.
 */
const MapBackdrop = dynamic(() => import("./MapBackdrop"), {
  ssr: false,
});

export default function MapBackdropLazy() {
  return <MapBackdrop />;
}
