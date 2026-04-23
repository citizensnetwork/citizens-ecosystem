"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  eventId: string;
  isAuthenticated: boolean;
  /** When true, scroll this widget into view + pulse + focus first star.
   *  Used by the post-event review-prompt deep link (`?review=1`). */
  autoFocus?: boolean;
};

export default function InlineEventRating({ eventId, isAuthenticated, autoFocus = false }: Props) {
  const supabaseRef = useRef(createClient());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstStarRef = useRef<HTMLButtonElement | null>(null);
  const [pulse, setPulse] = useState(false);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState(0);
  const [saving, setSaving] = useState(false);

  const fetchRatings = useCallback(async () => {
    const supabase = supabaseRef.current;

    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating, user_id")
      .eq("event_id", eventId);

    if (!reviews || reviews.length === 0) {
      setAvgRating(null);
      setTotalCount(0);
      return;
    }

    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    setAvgRating(avg);
    setTotalCount(reviews.length);

    // Find current user's rating
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const mine = reviews.find((r) => r.user_id === user.id);
      setUserRating(mine?.rating ?? null);
    }
  }, [eventId]);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  // Deep-link focus: when routed here via ?review=1 (post-event review
  // prompt), scroll the widget into view, briefly pulse the gold ring,
  // and focus the first star for keyboard users.
  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstStarRef.current?.focus();
      setPulse(true);
      window.setTimeout(() => setPulse(false), 2200);
    }, 150);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  async function handleRate(star: number) {
    if (!isAuthenticated || saving) return;

    setSaving(true);
    const supabase = supabaseRef.current;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    await supabase.from("reviews").upsert(
      {
        event_id: eventId,
        user_id: user.id,
        rating: star,
        body: "",
        still_exists: true,
      },
      { onConflict: "event_id,user_id" }
    );

    setUserRating(star);
    await fetchRatings();
    setSaving(false);
  }

  const displayRating = hoverRating || userRating || 0;

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition ${
        pulse ? "bg-(--gold-soft,#f5ecd3) ring-2 ring-(--gold,#c9a348)" : ""
      }`}
    >
      {/* Interactive stars */}
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            ref={star === 1 ? firstStarRef : undefined}
            disabled={!isAuthenticated || saving}
            onClick={() => handleRate(star)}
            onMouseEnter={() => isAuthenticated && setHoverRating(star)}
            className={`text-lg leading-none transition-colors ${
              star <= displayRating
                ? "text-(--gold)"
                : "text-black/20"
            } ${isAuthenticated ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
      </div>

      {/* Average + count */}
      {avgRating !== null && (
        <span className="text-sm text-black/45">
          {avgRating.toFixed(1)} ({totalCount})
        </span>
      )}
      {avgRating === null && (
        <span className="text-xs text-black/30">No ratings yet</span>
      )}
    </div>
  );
}
