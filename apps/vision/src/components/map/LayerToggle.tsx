"use client";

import { useMapStore, type MapLayer } from "@/stores/mapStore";

const LAYERS: { id: MapLayer; label: string; icon: string; description: string }[] = [
  { id: "markers", label: "Markers", icon: "●", description: "Individual activity markers" },
  { id: "clusters", label: "Clusters", icon: "◉", description: "Grouped activity clusters" },
  { id: "heatmap", label: "Heatmap", icon: "▓", description: "Activity density heatmap" },
  { id: "boundaries", label: "Boundaries", icon: "◻", description: "Service area boundaries with coverage" },
];

export function LayerToggle() {
  const { activeLayers, toggleLayer } = useMapStore();

  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Layers
      </h3>
      <div className="space-y-1">
        {LAYERS.map((layer) => {
          const isActive = activeLayers.has(layer.id);
          return (
            <button
              key={layer.id}
              onClick={() => toggleLayer(layer.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                isActive
                  ? "bg-accent-light text-accent"
                  : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
              }`}
              title={layer.description}
              aria-pressed={isActive}
            >
              <span className="w-4 text-center text-xs">{layer.icon}</span>
              <span>{layer.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
