"use client";

import { useTimelineStore } from "@/stores/timelineStore";
import type { PlaybackSpeed } from "@/stores/timelineStore";

const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

export function PlaybackControl() {
  const {
    isPlaying,
    playbackSpeed,
    playbackCursor,
    togglePlayback,
    stopPlayback,
    setPlaybackSpeed,
  } = useTimelineStore();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={togglePlayback}
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          isPlaying
            ? "border-accent bg-accent/20 text-accent"
            : "border-border bg-surface text-text-secondary hover:text-text-primary"
        }`}
        aria-label={isPlaying ? "Pause playback" : "Start playback"}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      {isPlaying && (
        <button
          onClick={stopPlayback}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text-secondary hover:text-text-primary"
          aria-label="Stop playback"
          title="Stop"
        >
          ⏹
        </button>
      )}

      {/* Speed selector */}
      <div className="flex rounded border border-border bg-surface">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => setPlaybackSpeed(speed)}
            className={`px-2 py-1 text-xs transition-colors ${
              playbackSpeed === speed
                ? "bg-accent text-highlight font-medium"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Current position */}
      {playbackCursor && (
        <span className="text-xs text-text-secondary">
          {playbackCursor}
        </span>
      )}
    </div>
  );
}
