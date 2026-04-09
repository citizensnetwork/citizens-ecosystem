"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  CLUSTER_RADIUS,
  CLUSTER_MAX_ZOOM,
  HEATMAP_INTENSITY,
  HEATMAP_RADIUS,
  HEATMAP_OPACITY,
  OSM_STYLE_URL,
  ACTIVITY_TYPE_COLOURS,
} from "@/lib/map/config";
import {
  saveViewport,
  loadViewport,
  activitiesToGeoJSON,
  type MapActivity,
} from "@/lib/map/utils";
import { useMapStore } from "@/stores/mapStore";

interface MapViewProps {
  activities: MapActivity[];
  orgSlug: string;
}

const SOURCE_ID = "activities";
const CLUSTER_SOURCE_ID = "activities-clustered";

export function MapView({ activities, orgSlug }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { activeLayers, selectActivity, setViewport } = useMapStore();

  // Keep orgSlug for future navigation
  void orgSlug;

  const initMap = useCallback(() => {
    if (!mapContainer.current || mapRef.current) return;

    const savedViewport = loadViewport();
    const center = savedViewport?.center ?? DEFAULT_CENTER;
    const zoom = savedViewport?.zoom ?? DEFAULT_ZOOM;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_STYLE_URL,
      center,
      zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      addSources(map);
      addLayers(map);
      updateLayerVisibility(map);
    });

    // Persist viewport on move
    map.on("moveend", () => {
      const c = map.getCenter();
      const z = map.getZoom();
      saveViewport({ center: [c.lng, c.lat], zoom: z });
      setViewport([c.lng, c.lat], z);
    });

    // Click handlers for markers and clusters
    map.on("click", "unclustered-point", (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const props = feature.properties;
      selectActivity({
        id: props.id,
        title: props.title,
        type: props.type,
        date: props.date,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        location_name: props.location_name || null,
        participant_count: props.participant_count,
        department_id: props.department_id || null,
        department_name: props.department_name || null,
        tags: props.tags ? props.tags.split(",").filter(Boolean) : [],
      });
    });

    // Zoom into cluster on click
    map.on("click", "clusters", (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const clusterId = feature.properties.cluster_id;
      const source = map.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({
          center: feature.geometry.type === "Point"
            ? (feature.geometry.coordinates as [number, number])
            : map.getCenter(),
          zoom,
        });
      });
    });

    // Cursor styling
    map.on("mouseenter", "unclustered-point", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "unclustered-point", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("mouseenter", "clusters", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "clusters", () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addSources(map: maplibregl.Map) {
    const geojson = activitiesToGeoJSON(activities);

    // Clustered source
    map.addSource(CLUSTER_SOURCE_ID, {
      type: "geojson",
      data: geojson,
      cluster: true,
      clusterRadius: CLUSTER_RADIUS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
    });

    // Non-clustered source (for heatmap)
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: geojson,
    });
  }

  function addLayers(map: maplibregl.Map) {
    // --- Heatmap layer ---
    map.addLayer({
      id: "heatmap-layer",
      type: "heatmap",
      source: SOURCE_ID,
      paint: {
        "heatmap-intensity": HEATMAP_INTENSITY,
        "heatmap-radius": HEATMAP_RADIUS,
        "heatmap-opacity": HEATMAP_OPACITY,
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "participant_count"],
          0, 0.1,
          100, 1,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(74,144,217,0)",
          0.2, "rgba(74,144,217,0.4)",
          0.4, "rgba(50,200,130,0.6)",
          0.6, "rgba(230,162,60,0.7)",
          0.8, "rgba(231,76,60,0.8)",
          1, "rgba(231,76,60,1)",
        ],
      },
    });

    // --- Cluster circles ---
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: CLUSTER_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#4a90d9",   // <10: blue
          10, "#50c878", // 10-30: green
          30, "#e6a23c", // 30-100: amber
          100, "#e74c3c", // 100+: red
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          16,
          10, 20,
          30, 26,
          100, 34,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
    });

    // --- Cluster count labels ---
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: CLUSTER_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Open Sans Bold"],
        "text-size": 13,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });

    // --- Unclustered individual markers ---
    map.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: CLUSTER_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": [
          "match",
          ["get", "type"],
          "event", ACTIVITY_TYPE_COLOURS.event,
          "meeting", ACTIVITY_TYPE_COLOURS.meeting,
          "outreach", ACTIVITY_TYPE_COLOURS.outreach,
          "workshop", ACTIVITY_TYPE_COLOURS.workshop,
          "service", ACTIVITY_TYPE_COLOURS.service,
          "training", ACTIVITY_TYPE_COLOURS.training,
          ACTIVITY_TYPE_COLOURS.other,
        ],
        "circle-radius": 8,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        // Temporal opacity: recent activities are more opaque, older ones fade
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "days_ago"],
          0, 1.0,     // today: fully opaque
          30, 0.8,    // 1 month: slightly faded
          90, 0.55,   // 3 months: moderately faded
          365, 0.35,  // 1 year: quite faded
        ],
      },
    });
  }

  function updateLayerVisibility(map: maplibregl.Map) {
    const showMarkers = activeLayers.has("markers");
    const showClusters = activeLayers.has("clusters");
    const showHeatmap = activeLayers.has("heatmap");

    // Individual markers visible when markers is on and clusters is off
    const pointVisibility = showMarkers && !showClusters ? "visible" : "none";
    // Cluster layers visible when clusters is on
    const clusterVisibility = showClusters ? "visible" : "none";
    // Unclustered point within cluster source visible when clusters on
    const unclusteredInCluster = showClusters ? "visible" : "none";

    if (map.getLayer("unclustered-point")) {
      map.setLayoutProperty(
        "unclustered-point",
        "visibility",
        showClusters ? unclusteredInCluster : pointVisibility
      );
    }
    if (map.getLayer("clusters")) {
      map.setLayoutProperty("clusters", "visibility", clusterVisibility);
    }
    if (map.getLayer("cluster-count")) {
      map.setLayoutProperty("cluster-count", "visibility", clusterVisibility);
    }
    if (map.getLayer("heatmap-layer")) {
      map.setLayoutProperty("heatmap-layer", "visibility", showHeatmap ? "visible" : "none");
    }
  }

  // Initialize map
  useEffect(() => {
    initMap();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initMap]);

  // Listen for fly-to events from search/geolocation
  useEffect(() => {
    function handleFlyTo(e: Event) {
      const { lng, lat, zoom } = (e as CustomEvent).detail;
      mapRef.current?.flyTo({ center: [lng, lat], zoom });
    }
    window.addEventListener("cv-map-fly-to", handleFlyTo);
    return () => window.removeEventListener("cv-map-fly-to", handleFlyTo);
  }, []);

  // Update data when activities change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const geojson = activitiesToGeoJSON(activities);

    const clusteredSource = map.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (clusteredSource) {
      clusteredSource.setData(geojson);
    }

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    }
  }, [activities]);

  // Update layer visibility when layer toggles change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateLayerVisibility(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayers]);

  return (
    <div
      ref={mapContainer}
      className="h-full w-full"
      role="application"
      aria-label="Activity map"
    />
  );
}
