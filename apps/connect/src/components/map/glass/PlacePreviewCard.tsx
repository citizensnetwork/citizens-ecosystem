"use client";

import Link from "next/link";
import { useState } from "react";
import {
  X,
  Star,
  MessageSquare,
  ImageIcon,
  BadgeCheck,
  HandHeart,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import type { Place } from "@/types/db";

type Props = {
  place: Place;
  onClose: () => void;
};

function categoryLabel(place: Place): string {
  return place.categories?.name ?? place.custom_category ?? "Community";
}

/**
 * Glass place preview card from the Figma design ("Harvest Hope Cooperative"
 * panel). Wired entirely to real Place fields — image, category, rating,
 * reviews, verification and volunteering — with a CTA into the full place page
 * for actions the glass card intentionally keeps light.
 */
export default function PlacePreviewCard({ place, onClose }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const rating = place.avg_rating ?? 0;
  const reviews = place.reviews_count ?? 0;
  const ratingPct = Math.max(0, Math.min(100, (rating / 5) * 100));

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-1200 flex items-start justify-end p-3 sm:p-4">
      <div className="cc-glass cc-glass-enter-right pointer-events-auto mt-20 flex w-80 max-w-[88vw] flex-col overflow-hidden rounded-3xl">
        {/* Image header */}
        <div className="relative h-36 w-full">
          {place.image_url && imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={place.image_url}
              alt={place.name}
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-black/10 to-black/5 text-black/25">
              <ImageIcon className="h-9 w-9" />
            </div>
          )}

          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-black/80 shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-(--gold)" />
            {categoryLabel(place)}
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-black/60 shadow-sm backdrop-blur transition hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-4">
          <div>
            <div className="flex items-start gap-1.5">
              <h2 className="text-lg font-bold leading-tight text-black">{place.name}</h2>
              {place.verified && (
                <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-(--gold)" aria-label="Verified" />
              )}
            </div>
            {place.description && (
              <p className="mt-1 line-clamp-2 text-sm text-black/55">{place.description}</p>
            )}
          </div>

          {/* Real stat columns */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--gold)/12 text-(--gold)">
                <Star className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-base font-bold text-black">{rating ? rating.toFixed(1) : "—"}</p>
                <p className="text-[11px] text-black/45">Rating</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--gold)/12 text-(--gold)">
                <MessageSquare className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-base font-bold text-black">{reviews}</p>
                <p className="text-[11px] text-black/45">Reviews</p>
              </div>
            </div>
          </div>

          {/* Rating meter */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-black/70">
                <Star className="h-3 w-3 text-(--gold)" /> Community rating
              </span>
              <span className="font-semibold text-black/70">{rating ? `${Math.round(ratingPct)}%` : "—"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-(--gold) transition-all"
                style={{ width: `${ratingPct}%` }}
              />
            </div>
          </div>

          {place.volunteer_openings && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-(--gold)">
              <HandHeart className="h-3.5 w-3.5" /> Volunteers welcome
            </p>
          )}

          {place.address && (
            <p className="flex items-start gap-1.5 text-xs text-black/50">
              <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {place.address}
            </p>
          )}

          <Link
            href={`/places/${place.id}`}
            className="gold-glow flex items-center justify-center gap-1.5 rounded-full bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition active:scale-[0.98]"
          >
            View Place <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
