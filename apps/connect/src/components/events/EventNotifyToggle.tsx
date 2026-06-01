"use client";

import { useState } from "react";

/**
 * Per-event notification opt-in toggle. Shown only when the viewer has an
 * RSVP (attending or considering). Lets the user mute event updates +
 * organiser broadcasts for this single event without un-RSVPing.
 * Backed by PATCH /api/events/[id]/notify-preference (migration 126 RPC).
 */
export default function EventNotifyToggle({
  eventId,
  initial,
}: {
  eventId: string;
  initial: boolean;
}) {
  const [notify, setNotify] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !notify;
    setSaving(true);
    setError(null);
    // Optimistic
    setNotify(next);
    try {
      const res = await fetch(`/api/events/${eventId}/notify-preference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_updates: next }),
      });
      if (!res.ok) {
        setNotify(!next); // revert
        const data = await res.json().catch(() => ({}));
        setError(
          (typeof data?.error === "string" && data.error) ||
            "Couldn't update. Please try again.",
        );
      }
    } catch {
      setNotify(!next);
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={notify}
        className="inline-flex items-center gap-2 text-[11px] font-medium text-black/60 hover:text-black/80 disabled:opacity-50 transition"
      >
        <span
          className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${
            notify ? "bg-(--gold)" : "bg-black/20"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${
              notify ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
        <span>
          {notify ? "Notifying you about updates" : "Updates muted for this event"}
        </span>
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
