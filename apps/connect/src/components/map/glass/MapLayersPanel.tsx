"use client";

import { TrendingUp, Activity, Share2, Layers as LayersIcon, X } from "lucide-react";
import type { MapLayerKey, MapLayers } from "./mapLayers";

type Props = {
  layers: MapLayers;
  onToggle: (key: MapLayerKey) => void;
  onClose: () => void;
};

const ROWS: {
  key: MapLayerKey;
  label: string;
  desc: string;
  Icon: typeof TrendingUp;
}[] = [
  { key: "glow", label: "Impact Glow", desc: "Show organization reach", Icon: TrendingUp },
  { key: "pulse", label: "Activity Pulse", desc: "Animated activity rings", Icon: Activity },
  { key: "connections", label: "Connections", desc: "Show collaborations", Icon: Share2 },
];

/**
 * Glass "Map Layers" panel from the Figma design. Toggles drive the marker
 * visualization layers (Impact Glow / Activity Pulse / Connections).
 */
export default function MapLayersPanel({ layers, onToggle, onClose }: Props) {
  return (
    <div
      className="cc-glass cc-glass-enter pointer-events-auto w-72 rounded-3xl p-4"
      role="dialog"
      aria-label="Map layers"
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-(--gold)/15 text-(--gold)">
          <LayersIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-black">Map Layers</h2>
          <p className="text-xs text-black/50">Toggle visualization layers</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close layers"
          className="flex h-6 w-6 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {ROWS.map(({ key, label, desc, Icon }) => {
          const on = layers[key];
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-black/[0.03]"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-(--gold)/10 text-(--gold)">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight text-black">{label}</p>
                <p className="text-xs text-black/45">{desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${label}: ${on ? "on" : "off"}`}
                data-on={on}
                onClick={() => onToggle(key)}
                className="cc-switch"
              >
                <span />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
