"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Props = {
  user: User | null;
  placeId?: string;
  eventId?: string;
  onSubmitted?: () => void;
};

export default function ReviewForm({ user, placeId, eventId, onSubmitted }: Props) {
  const supabase = useRef(createClient()).current;
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [stillExists, setStillExists] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isPlaceReview = useMemo(() => !!placeId, [placeId]);
  const isReady = !!(placeId || eventId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !isReady) return;

    setSaving(true);
    setError("");

    const payload = {
      place_id: placeId ?? null,
      event_id: eventId ?? null,
      user_id: user.id,
      rating,
      body: body.trim(),
      still_exists: isPlaceReview ? stillExists : true,
    };

    const target = isPlaceReview ? "place_id,user_id" : "event_id,user_id";

    const { error: upsertError } = await supabase
      .from("reviews")
      .upsert(payload, { onConflict: target });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setBody("");
    onSubmitted?.();
    setSaving(false);
  }

  if (!user) {
    return (
      <p className="text-sm text-black/60">
        <Link href="/login" className="text-(--gold) underline">
          Log in
        </Link>{" "}
        to add a review.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-black/10 bg-white/70 p-4">
      <h3 className="text-sm font-semibold text-black">Share your experience</h3>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            className={`text-xl leading-none transition ${
              value <= rating ? "text-(--gold)" : "text-black/25"
            }`}
            aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={1000}
        className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        placeholder="Optional comment"
      />

      {isPlaceReview && (
        <label className="flex items-center gap-2 text-sm text-black/75">
          <input
            type="checkbox"
            checked={stillExists}
            onChange={(e) => setStillExists(e.target.checked)}
          />
          This place still exists
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving || !isReady}
        className="rounded-lg bg-(--gold) px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        {saving ? "Saving..." : "Submit review"}
      </button>
    </form>
  );
}
