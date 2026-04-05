"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const supabase = createClient();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const isPlaceReview = !!placeId;

  const fetchReviews = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("reviews")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });

    query = placeId ? query.eq("place_id", placeId) : query.eq("event_id", eventId ?? "");

    const { data } = await query;
    setReviews((data as Review[]) ?? []);
    setLoading(false);
  }, [eventId, placeId, supabase]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

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
  }, [fetchReviews, supabase]);

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
            <span className="font-semibold text-[var(--gold)]">{avgRating.toFixed(1)}</span> / 5 from {reviews.length} review{reviews.length !== 1 ? "s" : ""}
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
        <p className="text-sm text-black/50">No reviews yet.</p>
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
