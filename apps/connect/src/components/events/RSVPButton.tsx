"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RSVPButton({
  eventId,
  hasRsvped,
}: {
  eventId: string;
  hasRsvped: boolean;
}) {
  const [rsvped, setRsvped] = useState(hasRsvped);
  const [loading, setLoading] = useState(false);
  const [showProfileHint, setShowProfileHint] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);

    if (rsvped) {
      // Cancel RSVP via API
      const res = await fetch("/api/rsvp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });

      if (res.ok) {
        setRsvped(false);
        setShowProfileHint(false);
      } else if (res.status === 401) {
        router.push("/login");
        return;
      }
    } else {
      // Create RSVP via API
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });

      if (res.ok) {
        setRsvped(true);
        const data = await res.json();
        if (data.needsProfileSetup) {
          setShowProfileHint(true);
        }
      } else if (res.status === 401) {
        router.push("/login");
        return;
      }
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`px-6 py-2 rounded-md text-sm font-medium disabled:opacity-50 ${
          rsvped
            ? "bg-red-100 text-red-700 hover:bg-red-200"
            : "bg-(--gold) text-black hover:brightness-95"
        }`}
      >
        {loading
          ? "Processing..."
          : rsvped
          ? "Cancel RSVP"
          : "RSVP / Attend"}
      </button>
      {showProfileHint && (
        <p className="mt-2 text-xs text-gray-500">
          Set up your{" "}
          <Link href="/profile" className="font-medium text-(--gold) underline">
            interests
          </Link>{" "}
          to discover events you&#39;ll love.
          <button
            type="button"
            onClick={() => setShowProfileHint(false)}
            className="ml-1.5 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </p>
      )}
    </div>
  );
}
