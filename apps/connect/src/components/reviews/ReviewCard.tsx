"use client";

import type { Review } from "@/types/db";

type Props = {
  review: Review;
  showStillExists?: boolean;
};

function renderStars(rating: number) {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

export default function ReviewCard({ review, showStillExists = false }: Props) {
  return (
    <div className="surface-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-black">
          {review.profiles?.full_name ?? "Community member"}
        </span>
        <span className="text-sm text-(--gold)">{renderStars(review.rating)}</span>
      </div>

      {review.body && (
        <p className="mt-1 text-sm leading-relaxed text-black/80 whitespace-pre-wrap">
          {review.body}
        </p>
      )}

      {showStillExists && review.still_exists === false && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Reported as possibly closed
        </p>
      )}

      <p className="mt-2 text-xs text-black/45">
        {new Date(review.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}
