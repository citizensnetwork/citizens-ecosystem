"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function RSVPButton({
  eventId,
  hasRsvped,
}: {
  eventId: string;
  hasRsvped: boolean;
}) {
  const [rsvped, setRsvped] = useState(hasRsvped);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleClick() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    if (rsvped) {
      // Cancel RSVP
      await supabase
        .from("rsvps")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId);
      setRsvped(false);
    } else {
      // Create RSVP
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });

      if (res.ok) {
        setRsvped(true);
      }
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-6 py-2 rounded-md text-sm font-medium disabled:opacity-50 ${
        rsvped
          ? "bg-red-100 text-red-700 hover:bg-red-200"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
    >
      {loading
        ? "Processing..."
        : rsvped
        ? "Cancel RSVP"
        : "RSVP / Attend"}
    </button>
  );
}
