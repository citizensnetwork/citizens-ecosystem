"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Event, Place, FeaturedListing, TrendingEvent } from "@/types/db";
import { CATEGORY_HEX, CATEGORY_LABELS } from "@/lib/categories";
import type { EventCategory } from "@/types/db";

type QuickAction = "view" | "join" | "share" | "consider";

type Props = {
  trendingEvents?: TrendingEvent[];
  onSelectEvent?: (event: Event) => void;
  onSelectPlace?: (place: Place) => void;
  onQuickAction?: (action: QuickAction, event: Event) => void;
  fallbackEvents?: Event[];
};

/** Convert hex colour to rgba string. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function FeaturedPanel({
  trendingEvents = [],
  onSelectEvent,
  onQuickAction,
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

  // Auto-rotate hero carousel every 5s (used in featured fallback mode)
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

  // ── Trending mode: show trending events as glass blocks ──
  const hasTrending = trendingEvents.length > 0;

  if (hasTrending) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pb-2 pt-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-black/70">
            Trending
          </h2>
        </div>

        {/* Trending event glass blocks */}
        <div className="flex flex-col gap-3 px-4 pb-6">
          {trendingEvents.map((event) => (
            <TrendingBlock
              key={event.id}
              event={event}
              onSelectEvent={onSelectEvent}
              onQuickAction={onQuickAction}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Featured fallback mode ──
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4 pt-5">
        <div className="h-5 w-32 animate-pulse rounded bg-black/8" />
        <div className="h-48 animate-pulse rounded-2xl bg-black/8" />
        <div className="h-28 animate-pulse rounded-2xl bg-black/8" />
      </div>
    );
  }

  const fallbackCards = fallbackEvents.filter((e) => e.image_url).slice(0, 8);
  const hasContent = listings.length > 0 || fallbackCards.length > 0;

  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-black/40">
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 h-10 w-10 text-black/20">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13"/>
          </svg>
          No trending content yet
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-black/70">
          Trending
        </h2>
      </div>

      {/* Hero carousel (admin-featured) */}
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
                <div className="relative h-48 w-full bg-black/10">
                  {listing.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.cover_url}
                      alt={title}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                <div className="absolute inset-x-0 bottom-0 z-2 p-4">
                  <span className="mb-1 inline-block rounded-full border border-(--gold)/40 bg-(--gold)/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                    {isEvent ? "Featured Event" : "Featured Place"}
                  </span>
                  <h3 className="text-base font-bold leading-tight text-white drop-shadow-sm">{title}</h3>
                  {listing.tagline && (
                    <p className="mt-0.5 text-xs leading-tight text-white/80">{listing.tagline}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="absolute inset-0 z-3 cursor-pointer"
                  aria-label={`View ${title}`}
                  onClick={() => {
                    if (isEvent && listing.events) onSelectEvent?.(listing.events);
                  }}
                />
              </div>
            );
          })}
          <div className="h-48" />
          {heroListings.length > 1 && (
            <div className="absolute bottom-2 left-1/2 z-4 flex -translate-x-1/2 gap-1.5">
              {heroListings.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleHeroDot(idx)}
                  className={`h-1.5 rounded-full transition-all ${idx === heroIdx ? "w-4 bg-(--gold)" : "w-1.5 bg-white/50"}`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feed cards */}
      <div className="flex flex-col gap-3 px-4 pb-6">
        {/* Fallback: latest events with images */}
        {listings.length === 0 && fallbackCards.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelectEvent?.(event)}
            className="group relative overflow-hidden rounded-2xl text-left shadow-md transition-transform active:scale-[0.98]"
          >
            <div className="relative h-28 w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.image_url!}
                alt={event.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="text-sm font-semibold text-white drop-shadow-sm">{event.title}</h3>
              <p className="mt-0.5 text-xs text-white/70">
                {new Date(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {" · "}{event.location}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Trending Block ─────────────────────────────────────── */

function TrendingBlock({
  event,
  onSelectEvent,
  onQuickAction,
}: {
  event: TrendingEvent;
  onSelectEvent?: (event: Event) => void;
  onQuickAction?: (action: QuickAction, event: Event) => void;
}) {
  const cat = (event.category ?? "church") as EventCategory;
  const hex = CATEGORY_HEX[cat] ?? "#D4AF37";
  const label = CATEGORY_LABELS[cat] ?? "Event";
  const now = new Date();
  const hasStarted = new Date(event.date) <= now;

  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/40"
      style={{
        background: hexToRgba(hex, 0.60),
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Category colour strip */}
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
        style={{ background: hex }}
      />

      <div className="pl-4 pr-3 pt-3 pb-2">
        {/* Top row: category + rsvp count */}
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: hexToRgba(hex, 0.45), border: `1px solid ${hexToRgba(hex, 0.5)}` }}
          >
            {label}
          </span>
          {event.rsvp_count > 0 && (
            <span className="text-[11px] font-semibold text-white/90">
              {event.rsvp_count} going
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className="text-sm font-bold leading-snug text-white drop-shadow-sm line-clamp-1 cursor-pointer hover:underline"
          onClick={() => onSelectEvent?.(event)}
        >
          {event.title}
        </h3>

        {/* Date + location */}
        <p className="mt-0.5 text-[11px] text-white/85 line-clamp-1">
          {dateStr} · {event.location}
        </p>

        {/* Brief description */}
        {event.description && (
          <p className="mt-1 text-[11px] leading-snug text-white/75 line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Quick actions */}
        <div className="mt-2.5 flex gap-1.5 flex-wrap">
          <ActionButton
            label="View"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            onClick={() => onSelectEvent?.(event)}
          />
          <ActionButton
            label="Join"
            disabled={hasStarted}
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>}
            onClick={() => onQuickAction?.("join", event)}
          />
          <ActionButton
            label="Consider"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}
            onClick={() => onQuickAction?.("consider", event)}
          />
          <ActionButton
            label="Share"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
            onClick={() => onQuickAction?.("share", event)}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white transition-all active:scale-95 ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/25"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
