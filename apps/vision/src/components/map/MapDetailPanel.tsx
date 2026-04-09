"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMapStore } from "@/stores/mapStore";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "@/lib/constants";
import { ACTIVITY_TYPE_COLOURS } from "@/lib/map/config";

interface MapDetailPanelProps {
  orgSlug: string;
}

export function MapDetailPanel({ orgSlug }: MapDetailPanelProps) {
  const { selectedActivity, detailPanelOpen, closeDetailPanel } = useMapStore();

  // Close panel on Escape key
  useEffect(() => {
    if (!detailPanelOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDetailPanel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [detailPanelOpen, closeDetailPanel]);

  if (!detailPanelOpen || !selectedActivity) return null;

  const a = selectedActivity;
  const typeLabel = ACTIVITY_TYPE_LABELS[a.type] ?? a.type;
  const typeIcon = ACTIVITY_TYPE_ICONS[a.type] ?? "📋";
  const typeColour = ACTIVITY_TYPE_COLOURS[a.type] ?? ACTIVITY_TYPE_COLOURS.other;

  return (
    <div
      className="absolute right-0 top-0 z-20 flex h-full w-80 flex-col border-l border-border bg-surface shadow-xl"
      role="complementary"
      aria-label="Activity detail panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Activity Details</h2>
        <button
          onClick={closeDetailPanel}
          className="rounded p-1 text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          aria-label="Close detail panel"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Type badge */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${typeColour}33`, color: typeColour }}
          >
            {typeIcon} {typeLabel}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-text-primary">{a.title}</h3>

        {/* Metadata */}
        <div className="mt-4 space-y-3">
          <MetaRow label="Date" value={new Date(a.date).toLocaleDateString("en-ZA")} />
          {a.location_name && <MetaRow label="Location" value={a.location_name} />}
          <MetaRow label="Coordinates" value={`${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`} />
          <MetaRow label="Participants" value={String(a.participant_count)} />
          {a.department_name && <MetaRow label="Department" value={a.department_name} />}
        </div>

        {/* Tags */}
        {a.tags.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-text-secondary">Tags</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {a.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-accent-light px-2 py-0.5 text-xs text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Link to full detail */}
        <div className="mt-6">
          <Link
            href={`/${orgSlug}/activities/${a.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover"
          >
            View Full Detail →
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className="text-sm text-text-primary">{value}</p>
    </div>
  );
}
