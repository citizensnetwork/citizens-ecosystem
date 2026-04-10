"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle } from "@/lib/map/config";
import AttendeeMarkers from "./AttendeeMarkers";

type Props = {
  latitude: number;
  longitude: number;
  eventId?: string;
};

export default function MiniMap({ latitude, longitude, eventId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: [longitude, latitude],
      zoom: 15,
      interactive: !!eventId, // Enable interaction when showing attendees
      attributionControl: false,
    });

    mapRef.current = map;
    map.on("load", () => setMapReady(true));

    new maplibregl.Marker({ color: "#D4AF37" })
      .setLngLat([longitude, latitude])
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [latitude, longitude, eventId]);

  return (
    <div className="relative">
      <div ref={containerRef} className={eventId ? "h-64 w-full rounded-lg" : "h-50 w-full rounded-lg"} />
      {eventId && mapReady && (
        <AttendeeMarkers map={mapRef.current} eventId={eventId} />
      )}
    </div>
  );
}
