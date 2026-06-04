"use client";

import { useState, type ReactNode } from "react";
import {
  X,
  Calendar,
  MapPin,
  ImageIcon,
  Eye,
  UserPlus,
  Check,
  Share2,
  Bookmark,
  Globe,
  HandHeart,
} from "lucide-react";
import type { Event } from "@/types/db";
import { CATEGORY_LABELS, CATEGORY_HEX } from "@/lib/categories";
import { getTemporalStyle } from "@/lib/map/markers";

export type EventAction = "view" | "join" | "share" | "consider" | "visit";

type Props = {
  event: Event;
  joined: boolean;
  considering: boolean;
  onAction: (action: EventAction, event: Event) => void;
  onClose: () => void;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/**
 * Glass event preview side panel (Figma "Glassmorphism Community Map"). Replaces
 * the legacy MapLibre popup + intercepted route panel. Carries the 5 real event
 * actions (View / Join / Share / Consider / Visit) wired to handleQuickAction.
 * Category colour appears minimally as the badge/accent.
 */
export default function EventPreviewCard({ event, joined, considering, onAction, onClose }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const hex = event.category ? CATEGORY_HEX[event.category] : "#C9A84C";
  const categoryLabel = event.category ? CATEGORY_LABELS[event.category] : "Event";
  const hasWebsite = !!event.website_url && /^https?:\/\//i.test(event.website_url);
  const isLive = getTemporalStyle(event.date, event.end_time).isLive;

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-1200 flex items-start justify-end p-3 sm:p-4">
      <div className="cc-glass cc-glass-enter-right pointer-events-auto mt-20 flex w-80 max-w-[88vw] flex-col overflow-hidden rounded-3xl">
        {/* Cover photo with title overlay (Figma EventPreviewPanel) */}
        <div className="relative h-40 w-full">
          {event.image_url && imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.image_url}
              alt={event.title}
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${hex}, ${hex}99)` }}
            >
              <ImageIcon className="h-9 w-9 text-white/40" />
            </div>
          )}

          {/* Scrim so the overlaid title + badges read on any photo */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/20" />

          {/* Category badge (solid category colour) */}
          <span
            className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow-lg"
            style={{ background: hex }}
          >
            {categoryLabel}
          </span>

          {/* Live badge */}
          {isLive && (
            <span className="absolute right-12 top-3 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 shadow-lg">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              <span className="text-[9px] font-bold text-white">LIVE</span>
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white shadow-sm backdrop-blur transition hover:bg-black/60"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Title overlay */}
          <div className="absolute inset-x-3 bottom-3">
            <h2 className="font-display text-base font-bold leading-tight text-white drop-shadow-lg line-clamp-2">
              {event.title}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1 text-sm text-black/55">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" style={{ color: hex }} />
              {formatWhen(event.date)}
            </span>
            {event.location && (
              <span className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: hex }} />
                <span className="line-clamp-1">{event.location}</span>
              </span>
            )}
          </div>

          {event.description && (
            <p className="line-clamp-3 text-sm text-black/55">{event.description}</p>
          )}

          {event.volunteer_openings && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-(--gold)">
              <HandHeart className="h-3.5 w-3.5" /> Volunteers welcome
            </p>
          )}

          {/* The 5 actions */}
          <div className="mt-1 grid grid-cols-5 gap-1">
            <ActionButton
              label="View"
              onClick={() => onAction("view", event)}
              icon={<Eye className="h-4 w-4" />}
            />
            <ActionButton
              label={joined ? "Joined" : "Join"}
              active={joined}
              onClick={() => onAction("join", event)}
              icon={joined ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            />
            <ActionButton
              label="Share"
              onClick={() => onAction("share", event)}
              icon={<Share2 className="h-4 w-4" />}
            />
            <ActionButton
              label={considering ? "Saved" : "Consider"}
              active={considering}
              onClick={() => onAction("consider", event)}
              icon={<Bookmark className="h-4 w-4" fill={considering ? "currentColor" : "none"} />}
            />
            <ActionButton
              label="Visit"
              disabled={!hasWebsite}
              onClick={() => onAction("visit", event)}
              icon={<Globe className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition active:scale-95 disabled:opacity-30 ${
        active ? "bg-(--gold)/15 text-(--gold)" : "text-black/70 hover:bg-black/[0.05]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
