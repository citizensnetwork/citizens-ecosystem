"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  latitude: number;
  longitude: number;
};

const MAPTILER_KEY = "UYwNkBMiXAEzjQxQmONO";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

export default function MiniMap({ latitude, longitude }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [longitude, latitude],
      zoom: 15,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    new maplibregl.Marker({ color: "#D4AF37" })
      .setLngLat([longitude, latitude])
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  return <div ref={containerRef} className="h-50 w-full rounded-lg" />;
}
