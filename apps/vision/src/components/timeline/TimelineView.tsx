"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTimelineStore } from "@/stores/timelineStore";
import { TimelineControls } from "./TimelineControls";
import { PlaybackControl } from "./PlaybackControl";
import { DensityStrip } from "./DensityStrip";
import { SwimLane, groupItemsIntoLanes } from "./SwimLane";
import type { TimelineResponse } from "@/types/metrics";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";

interface TimelineViewProps {
  orgId: string;
  orgSlug: string;
}

export function TimelineView({ orgId, orgSlug }: TimelineViewProps) {
  const {
    rangeStart,
    rangeEnd,
    zoom,
    swimLaneGrouping,
    isPlaying,
    playbackSpeed,
    playbackCursor,
    selectedItemId,
    setPlaybackCursor,
    stopPlayback,
    selectItem,
  } = useTimelineStore();

  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch timeline data when range changes
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      org_id: orgId,
      date_from: rangeStart,
      date_to: rangeEnd,
    });

    fetch(`/api/timeline?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch timeline data");
        return res.json();
      })
      .then((result: TimelineResponse) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          if (err instanceof Error && err.name !== "AbortError") {
            setError(err.message);
          }
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [orgId, rangeStart, rangeEnd]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying || !data) {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }

    const dates = data.density.map((b) => b.date).sort();
    if (dates.length === 0) {
      stopPlayback();
      return;
    }

    let currentIdx = playbackCursor
      ? dates.findIndex((d) => d >= playbackCursor)
      : 0;
    if (currentIdx < 0) currentIdx = 0;

    // Interval decreases with speed: base 1000ms / speed
    const intervalMs = 1000 / playbackSpeed;

    playbackTimerRef.current = setInterval(() => {
      if (currentIdx >= dates.length) {
        stopPlayback();
        return;
      }
      setPlaybackCursor(dates[currentIdx]);
      currentIdx++;
    }, intervalMs);

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, data, playbackCursor, stopPlayback, setPlaybackCursor]);

  const handleSelectItem = useCallback(
    (id: string) => {
      selectItem(selectedItemId === id ? null : id);
    },
    [selectItem, selectedItemId]
  );

  // Get selected item details
  const selectedItem = data?.items.find((i) => i.id === selectedItemId) ?? null;

  // Group into swim lanes
  const lanes = data
    ? groupItemsIntoLanes(data.items, data.milestones, swimLaneGrouping)
    : [];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimelineControls />
        <PlaybackControl />
      </div>

      {/* Density strip */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-text-secondary">Activity Density</span>
          {data && (
            <span className="text-xs text-text-secondary">
              {data.total_count} activities
            </span>
          )}
        </div>
        <DensityStrip
          buckets={data?.density ?? []}
          playbackCursor={playbackCursor}
        />
      </div>

      {/* Main timeline area */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading timeline">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded border border-border bg-surface"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        ) : data && lanes.length > 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            {/* Time axis header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-xs text-text-secondary">{rangeStart}</span>
              <span className="text-xs font-medium text-text-secondary uppercase">
                {zoom} view • {swimLaneGrouping}
              </span>
              <span className="text-xs text-text-secondary">{rangeEnd}</span>
            </div>

            {/* Swim lanes */}
            {lanes.map((lane) => (
              <SwimLane
                key={lane.key}
                label={lane.label}
                items={lane.items}
                milestones={lane.milestones}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                selectedItemId={selectedItemId}
                onSelectItem={handleSelectItem}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-12 text-text-secondary">
            <div className="text-center">
              <p className="text-lg">No activities in this date range</p>
              <p className="mt-1 text-sm">
                Adjust the date range or create new activities
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel (slides up when item selected) */}
      {selectedItem && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                {selectedItem.title}
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                {ACTIVITY_TYPE_LABELS[selectedItem.type] ?? selectedItem.type} •{" "}
                {selectedItem.date}
                {selectedItem.start_time && ` at ${selectedItem.start_time}`}
              </p>
              {selectedItem.department_name && (
                <p className="text-xs text-text-secondary">
                  Department: {selectedItem.department_name}
                </p>
              )}
              {selectedItem.project_name && (
                <p className="text-xs text-text-secondary">
                  Project: {selectedItem.project_name}
                </p>
              )}
              {selectedItem.aligned_goals.length > 0 && (
                <p className="text-xs text-text-secondary">
                  Goals: {selectedItem.aligned_goals.join(", ")}
                </p>
              )}
              {selectedItem.participant_count > 0 && (
                <p className="text-xs text-text-secondary">
                  Participants: {selectedItem.participant_count}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {selectedItem.latitude && selectedItem.longitude && (
                <a
                  href={`/${orgSlug}/map?lat=${selectedItem.latitude}&lng=${selectedItem.longitude}`}
                  className="text-xs text-accent hover:underline"
                >
                  View on Map →
                </a>
              )}
              <button
                onClick={() => selectItem(null)}
                className="text-xs text-text-secondary hover:text-text-primary"
                aria-label="Close detail panel"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
