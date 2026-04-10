"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import type { Event, Place, FeaturedListing } from "@/types/db";

type Props = {
  onSelectEvent?: (event: Event) => void;
  onSelectPlace?: (place: Place) => void;
  fallbackEvents?: Event[];
};

export default function FeaturedPanel({
  onSelectEvent,
  onSelectPlace,
  fallbackEvents = [],
}: Props) {
  const [listings, setListings] = useState<FeaturedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIdx, setHeroIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/featured")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setListings(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Auto-rotate hero carousel every 5s
  const heroListings = listings.length > 0 ? listings.slice(0, 5) : [];
  useEffect(() => {
    if (heroListings.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroListings.length);
    }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [heroListings.length]);

  const handleHeroDot = useCallback((idx: number) => {
    setHeroIdx(idx);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // Use fallback events (latest with images) when no featured listings exist
  const fallbackCards = fallbackEvents
    .filter((e) => e.image_url)
    .slice(0, 8);

  const hasContent = listings.length > 0 || fallbackCards.length > 0;

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4 pt-5">
        <div className="h-5 w-32 animate-pulse rounded bg-black/8" />
        <div className="h-48 animate-pulse rounded-2xl bg-black/8" />
        <div className="h-28 animate-pulse rounded-2xl bg-black/8" />
        <div className="h-28 animate-pulse rounded-2xl bg-black/8" />
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-black/40">
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 h-10 w-10 text-black/20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
          </svg>
          No featured content yet
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-5">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-(--gold)">
          <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
        </svg>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-black/70">
          Featured
        </h2>
      </div>

      {/* ── Hero carousel (admin-featured) ───────────── */}
      {heroListings.length > 0 && (
        <div className="relative mx-4 mb-4 overflow-hidden rounded-2xl shadow-lg">
          {heroListings.map((listing, idx) => {
            const isEvent = !!listing.events;
            const title = isEvent ? listing.events!.title : listing.places?.name ?? "";
            return (
              <div
                key={listing.id}
                className="absolute inset-0 transition-opacity duration-700"
                style={{ opacity: idx === heroIdx ? 1 : 0, zIndex: idx === heroIdx ? 1 : 0 }}
              >
                <div className="relative h-48 w-full">
                  <Image
                    src={listing.cover_url}
                    alt={title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 84vw, 384px"
                    priority={idx === 0}
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                {/* Content overlay */}
                <div className="absolute inset-x-0 bottom-0 z-2 p-4">
                  <span className="mb-1 inline-block rounded-full border border-(--gold)/40 bg-(--gold)/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                    {isEvent ? "Featured Event" : "Featured Place"}
                  </span>
                  <h3 className="text-base font-bold leading-tight text-white drop-shadow-sm">
                    {title}
                  </h3>
                  {listing.tagline && (
                    <p className="mt-0.5 text-xs leading-tight text-white/80">
                      {listing.tagline}
                    </p>
                  )}
                </div>
                {/* Click target */}
                <button
                  type="button"
                  className="absolute inset-0 z-3 cursor-pointer"
                  aria-label={`View ${title}`}
                  onClick={() => {
                    if (isEvent && listing.events) onSelectEvent?.(listing.events);
                    else if (listing.places) onSelectPlace?.(listing.places);
                  }}
                />
              </div>
            );
          })}
          {/* Make container have height */}
          <div className="h-48" />
          {/* Dot indicators */}
          {heroListings.length > 1 && (
            <div className="absolute bottom-2 left-1/2 z-4 flex -translate-x-1/2 gap-1.5">
              {heroListings.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleHeroDot(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === heroIdx
                      ? "w-4 bg-(--gold)"
                      : "w-1.5 bg-white/50"
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Feed cards ───────────────────────────────── */}
      <div className="flex flex-col gap-3 px-4 pb-6">
        {/* Admin-featured cards (non-hero) */}
        {listings.slice(heroListings.length > 0 ? 5 : 0).map((listing) => (
          <FeaturedCard
            key={listing.id}
            listing={listing}
            onSelectEvent={onSelectEvent}
            onSelectPlace={onSelectPlace}
          />
        ))}

        {/* Fallback: latest events with images when no admin listings */}
        {listings.length === 0 && fallbackCards.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelectEvent?.(event)}
            className="group relative overflow-hidden rounded-2xl text-left shadow-md transition-transform active:scale-[0.98]"
          >
            <div className="relative h-28 w-full">
              <Image
                src={event.image_url!}
                alt={event.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 84vw, 384px"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="text-sm font-semibold text-white drop-shadow-sm">
                {event.title}
              </h3>
              <p className="mt-0.5 text-xs text-white/70">
                {new Date(event.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                {" · "}
                {event.location}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Sub-component: Featured Card ────────────────── */

function FeaturedCard({
  listing,
  onSelectEvent,
  onSelectPlace,
}: {
  listing: FeaturedListing;
  onSelectEvent?: (event: Event) => void;
  onSelectPlace?: (place: Place) => void;
}) {
  const isEvent = !!listing.events;
  const title = isEvent ? listing.events!.title : listing.places?.name ?? "";
  const subtitle = isEvent
    ? `${new Date(listing.events!.date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })} · ${listing.events!.location}`
    : listing.places?.address ?? "";

  return (
    <button
      type="button"
      onClick={() => {
        if (isEvent && listing.events) onSelectEvent?.(listing.events);
        else if (listing.places) onSelectPlace?.(listing.places);
      }}
      className="group relative overflow-hidden rounded-2xl text-left shadow-md transition-transform active:scale-[0.98]"
    >
      <div className="relative h-28 w-full">
        <Image
          src={listing.cover_url}
          alt={title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 84vw, 384px"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <span className="mb-0.5 inline-block rounded-full border border-(--gold)/30 bg-(--gold)/15 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-white/90">
          {isEvent ? "Event" : "Place"}
        </span>
        <h3 className="text-sm font-semibold leading-tight text-white drop-shadow-sm">
          {title}
        </h3>
        {listing.tagline ? (
          <p className="mt-0.5 text-xs text-white/70">{listing.tagline}</p>
        ) : (
          <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>
        )}
      </div>
    </button>
  );
}
