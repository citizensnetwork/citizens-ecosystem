"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ManagedPlace = {
  id: string;
  name: string;
  address: string;
  verified: boolean;
  created_at: string;
  follow_count: number;
  review_count: number;
  avg_rating: number | null;
};

export default function ManagePlacesView() {
  const [places, setPlaces] = useState<ManagedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manage/places")
      .then((r) => r.json())
      .then((data) => {
        setPlaces(data.places ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-black/50 text-sm">You haven&apos;t created any places yet.</p>
        <p className="text-xs text-black/40 mt-1">
          Places are created when you book an event at a new venue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {places.map((place) => (
        <Link
          key={place.id}
          href={`/places/${place.id}`}
          className="block rounded-xl border border-black/8 bg-white px-5 py-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm truncate">{place.name}</h3>
                {place.verified && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                    ✓ Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-black/50 truncate">{place.address}</p>
              <p className="text-xs text-black/40 mt-1">
                Created {new Date(place.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>

            <div className="flex gap-4 text-center shrink-0">
              <div>
                <p className="text-lg font-bold text-black">{place.follow_count}</p>
                <p className="text-[10px] text-black/50">Followers</p>
              </div>
              <div>
                <p className="text-lg font-bold text-(--gold)">
                  {place.avg_rating != null ? place.avg_rating.toFixed(1) : "—"}
                </p>
                <p className="text-[10px] text-black/50">Rating</p>
              </div>
              <div>
                <p className="text-lg font-bold text-black/40">{place.review_count}</p>
                <p className="text-[10px] text-black/50">Reviews</p>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
