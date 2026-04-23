"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Review } from "@/types/db";
import type { User } from "@supabase/supabase-js";
import ReviewCard from "./ReviewCard";
import ReviewForm from "./ReviewForm";

type Props = {
  placeId?: string;
  eventId?: string;
  title?: string;
};

export default function ReviewList({ placeId, eventId, title = "Reviews" }: Props) {
  const supabaseRef = useRef(createClient());
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const isPlaceReview = !!placeId;

  const fetchReviews = useCallback(async () => {
    setLoading(true);

    let query = supabaseRef.current
      .from("reviews")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });

    query = placeId ? query.eq("place_id", placeId) : query.eq("event_id", eventId ?? "");

    const { data } = await query;
    setReviews((data as Review[]) ?? []);
    setLoading(false);
  }, [eventId, placeId]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const {
        data: { user: currentUser },
      } = await supabaseRef.current.auth.getUser();

      if (active) {
        setUser(currentUser);
      }

      if (active) {
        await fetchReviews();
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [fetchReviews]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return null;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-lg font-bold text-black">{title}</h2>
        {avgRating !== null && (
          <p className="text-sm text-black/70">
            <span className="font-semibold text-(--gold)">{avgRating.toFixed(1)}</span> / 5 from {reviews.length} review{reviews.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <ReviewForm
        user={user}
        placeId={placeId}
        eventId={eventId}
        onSubmitted={fetchReviews}
      />

      {loading ? (
        <p className="text-sm text-black/50">Loading reviews...</p>
      ) : reviews.length === 0 ? (
        <div className="surface-card rounded-2xl py-10 text-center text-(--foreground-soft)">
          <p className="text-sm font-medium text-black">No reviews yet</p>
          <p className="mt-1 text-xs">
            Share your experience to help others decide.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              showStillExists={isPlaceReview}
            />
          ))}
        </div>
      )}
    </section>
  );
}
