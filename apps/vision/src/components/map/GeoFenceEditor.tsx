"use client";

import { useState, useCallback, useRef } from "react";
import { isValidBoundaryGeoJSON } from "@/lib/map/geo";
import { BOUNDARY_COLOURS } from "@/lib/constants";

interface GeoFenceEditorProps {
  initialGeoJSON?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onSave: (geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon) => void;
  onCancel: () => void;
}

export function GeoFenceEditor({ initialGeoJSON, onSave, onCancel }: GeoFenceEditorProps) {
  const [geoJsonText, setGeoJsonText] = useState(
    initialGeoJSON ? JSON.stringify(initialGeoJSON, null, 2) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePaste = useCallback((text: string) => {
    setGeoJsonText(text);
    setError(null);
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit file size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content !== "string") return;

      try {
        const parsed = JSON.parse(content);
        // Support GeoJSON Feature or raw geometry
        let geometry = parsed;
        if (parsed.type === "Feature" && parsed.geometry) {
          geometry = parsed.geometry;
        } else if (parsed.type === "FeatureCollection" && parsed.features?.length > 0) {
          geometry = parsed.features[0].geometry;
        }

        if (isValidBoundaryGeoJSON(geometry)) {
          setGeoJsonText(JSON.stringify(geometry, null, 2));
          setError(null);
        } else {
          setError("File must contain a valid Polygon or MultiPolygon geometry.");
        }
      } catch {
        setError("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleSubmit = useCallback(() => {
    try {
      const parsed = JSON.parse(geoJsonText);
      let geometry = parsed;
      if (parsed.type === "Feature" && parsed.geometry) {
        geometry = parsed.geometry;
      } else if (parsed.type === "FeatureCollection" && parsed.features?.length > 0) {
        geometry = parsed.features[0].geometry;
      }

      if (!isValidBoundaryGeoJSON(geometry)) {
        setError("Invalid GeoJSON. Must be a Polygon or MultiPolygon with valid coordinates.");
        return;
      }

      setError(null);
      onSave(geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
    } catch {
      setError("Invalid JSON syntax.");
    }
  }, [geoJsonText, onSave]);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Boundary GeoJSON
        </label>
        <p className="mb-2 text-xs text-text-secondary">
          Paste GeoJSON Polygon/MultiPolygon geometry or import from file.
        </p>
        <textarea
          value={geoJsonText}
          onChange={(e) => handlePaste(e.target.value)}
          rows={12}
          className="w-full rounded-lg border border-border bg-surface-alt p-3 font-mono text-xs text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder='{"type": "Polygon", "coordinates": [[[lng, lat], ...]]}'
          spellCheck={false}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.geojson"
          onChange={handleFileImport}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          Import File
        </button>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!geoJsonText.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {initialGeoJSON ? "Update Boundary" : "Set Boundary"}
          </button>
        </div>
      </div>

      {/* Quick reference for boundary colours */}
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium text-text-secondary">Available Colours</p>
        <div className="flex gap-2">
          {BOUNDARY_COLOURS.map((colour) => (
            <div
              key={colour}
              className="h-6 w-6 rounded-full border border-border"
              style={{ backgroundColor: colour }}
              title={colour}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
