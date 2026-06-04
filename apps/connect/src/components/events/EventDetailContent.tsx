"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Globe,
  Mail,
  Phone,
  Camera,
  Radio,
  ChevronRight,
} from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import RSVPButton from "./RSVPButton";
import EventNotifyToggle from "./EventNotifyToggle";
import CommentSection from "./CommentSection";
import EventUpdatesList from "./EventUpdatesList";
import WhoIsAttending from "./WhoIsAttending";
import LiveTrackingPrompt from "./LiveTrackingPrompt";
import InlineEventRating from "@/components/reviews/InlineEventRating";
import SocialShareButtons from "@/components/ui/SocialShareButtons";
import MessageButton from "@/components/messaging/MessageButton";
import LocationSharingToggle from "./LocationSharingToggle";
import EventMediaStrip from "./EventMediaStrip";
import TagChipList from "./TagChipList";
import { CATEGORY_LABELS, CATEGORY_HEX } from "@/lib/categories";
import WeekendChip from "@/components/events/WeekendChip";
import { isWeekendEvent } from "@/lib/weekendTag";
import { ContributorChip } from "@/components/ui/ContributorChip";
import { ReportButton } from "@/components/ui/ReportButton";
import { buildGoogleCalendarUrl } from "@/lib/calendar";
import { isCancelledEvent, isDraftEvent, isCommunityEvent } from "@/lib/events/capabilities";
import { isApprovedContributor } from "@/lib/profiles/capabilities";
import OrgBroadcastList from "@/components/contributor/OrgBroadcastList";
import type { OrgBroadcast } from "@/components/contributor/OrgBroadcastList";
import VolunteerApplyButton from "@/components/volunteer/VolunteerApplyButton";
import type { VolunteerStatus } from "@/components/volunteer/VolunteerApplyButton";
import type { Event, EventMedia, EventTag } from "@/types/db";
import type { EventOrganiser } from "@/components/events/EventDetailServer";
import type { User } from "@supabase/supabase-js";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
  loading: () => (
    <div className="surface-card h-50 w-full rounded-xl p-3">
      <div className="skeleton h-full w-full rounded-lg" />
    </div>
  ),
});

type Attendee = {
  user_id: string;
  full_name: string;
  isFriend: boolean;
};

type Props = {
  event: Event;
  count: number;
  user: User | null;
  hasRsvped: boolean;
  /** Current per-event notification opt-in for the viewer's RSVP. */
  notifyUpdates?: boolean;
  attendees?: Attendee[];
  /** Other RSVPers who have opted in to be discoverable. Only shown when viewer has RSVPed. */
  discoverableAttendees?: { user_id: string; full_name: string; avatar_url: string | null }[];
  locationSharingEnabled?: boolean;
  media?: EventMedia[];
  tags?: EventTag[];
  organiser?: EventOrganiser | null;
  isAdmin?: boolean;
  broadcasts?: OrgBroadcast[];
  volunteerStatus?: VolunteerStatus;
  volunteerApplicationId?: string | null;
  organiserHandle?: string | null;
};

type DetailTab = "about" | "gallery" | "updates";

export default function EventDetailContent({
  event,
  count,
  user,
  hasRsvped,
  notifyUpdates = true,
  attendees = [],
  discoverableAttendees = [],
  locationSharingEnabled = false,
  media = [],
  tags = [],
  organiser = null,
  isAdmin = false,
  broadcasts = [],
  volunteerStatus = "none",
  volunteerApplicationId = null,
  organiserHandle = null,
}: Props) {
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const endStr = event.end_time
    ? (() => {
        const start = new Date(event.date);
        const end = new Date(event.end_time);
        // Same day? Only show time
        if (start.toDateString() === end.toDateString()) {
          return end.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        return end.toLocaleDateString("en-US", dateFmt);
      })()
    : null;

  const dayStr = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = new Date(event.date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasCoords = event.latitude != null && event.longitude != null;
  const cat = event.category ?? "church-services";
  const catHex = CATEGORY_HEX[cat];
  const isWeekend = isWeekendEvent(event);
  const isCancelled = isCancelledEvent(event);
  const isFull =
    event.max_attendees != null && count >= event.max_attendees;
  const canManageEvent = !!(user && (user.id === event.created_by || isAdmin));
  const isCommunity = isCommunityEvent({
    community_contributor: event.community_contributor,
    creator: organiser,
  });

  // Live event detection
  const now = new Date();
  const eventStart = new Date(event.date);
  const eventEnd = event.end_time ? new Date(event.end_time) : new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
  const isLive = eventStart <= now && eventEnd > now;
  const hasStarted = eventStart <= now;
  const durationMs = eventEnd.getTime() - eventStart.getTime();
  const isInSession = isLive && durationMs > 5 * 60 * 60 * 1000;

  // Fire-and-forget view tracking
  useEffect(() => {
    fetch(`/api/events/${event.id}/view`, { method: "POST" }).catch(() => {});
  }, [event.id]);

  // Deep-link ?review=1 from post-event review-prompt notifications —
  // when present we ask the rating widget to auto-focus itself.
  const searchParams = useSearchParams();
  const autoFocusReview = searchParams?.get("review") === "1";

  const [activeTab, setActiveTab] = useState<DetailTab>("about");
  const friendAttendees = attendees.filter((a) => a.isFriend);

  return (
    <div className="flex items-start justify-center sm:px-4 sm:py-6">
      <article className="w-full max-w-2xl overflow-hidden bg-white shadow-xl sm:rounded-3xl">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="relative h-60 shrink-0 overflow-hidden sm:h-72">
          {event.image_url ? (
            <Image
              src={event.image_url}
              alt={event.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 720px"
              priority
            />
          ) : (
            <div className="h-full w-full gold-gradient" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Back (Figma in-hero) */}
          <BackButton className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60" />

          {/* Live badge */}
          {isLive && (
            <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-white">
                {isInSession ? "In Session" : "Happening Now"}
              </span>
            </div>
          )}

          {/* Top-right glass actions (kept functionality, re-dressed) */}
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {user && user.id !== event.created_by && (
              <ReportButton
                targetType="event"
                targetId={event.id}
                isAuthenticated={!!user}
              />
            )}
            {canManageEvent && (
              <Link
                href={`/events/${event.id}/edit`}
                className="rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/60"
              >
                Edit
              </Link>
            )}
          </div>

          {/* Title block */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {event.category && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow"
                  style={{ background: catHex }}
                >
                  {CATEGORY_LABELS[cat]}
                </span>
              )}
              {event.volunteer_openings && (
                <span className="rounded-full bg-(--gold) px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  Volunteer Spots
                </span>
              )}
              {isWeekend && <WeekendChip />}
              {isCommunity && <ContributorChip variant="community" />}
            </div>
            <h1 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-lg">
              {event.title}
            </h1>
            {organiser && (
              <p className="mt-1 text-xs text-white/80">
                Organised by{" "}
                <Link
                  href={
                    isApprovedContributor(organiser) && organiser.contributor_slug
                      ? `/c/${organiser.contributor_slug}`
                      : `/profile/${organiser.id}`
                  }
                  prefetch={false}
                  className="font-semibold text-(--gold-light) hover:underline focus:underline focus:outline-none"
                >
                  {organiser.full_name || "Organiser"}
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="px-5 py-5 sm:px-6">
          {/* Status banners */}
          {isCancelled && (
            <div className="mb-3 rounded-xl border border-red-300 bg-red-100 px-3 py-2 text-center text-xs font-semibold text-red-800">
              This event has been cancelled
            </div>
          )}
          {isDraftEvent(event) && (
            <div className="mb-3 rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-center text-xs font-medium text-yellow-800">
              Draft — only you can see this event
            </div>
          )}

          {/* Primary action — RSVP / Connect */}
          <div className="border-b border-black/10 pb-4">
            {isCancelled ? (
              <div className="text-xs font-medium text-black/40">
                RSVP is disabled for cancelled events.
              </div>
            ) : hasStarted && !hasRsvped ? (
              <div className="text-xs font-medium text-black/40">
                This event has already started. RSVP is no longer available.
              </div>
            ) : user ? (
              <>
                <RSVPButton eventId={event.id} hasRsvped={hasRsvped} />
                {hasRsvped && !isCancelled && (
                  <EventNotifyToggle eventId={event.id} initial={notifyUpdates} />
                )}
                {hasRsvped && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a
                      href={buildGoogleCalendarUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-(--gold)/40 bg-(--gold-soft) px-2.5 py-1 text-[10px] font-medium text-black transition hover:bg-(--gold)/20"
                    >
                      Add to Google Calendar
                    </a>
                    <a
                      href={`/api/events/${event.id}/ical`}
                      download
                      className="inline-flex items-center gap-1 rounded-xl border border-(--gold)/40 bg-(--gold-soft) px-2.5 py-1 text-[10px] font-medium text-black transition hover:bg-(--gold)/20"
                    >
                      Download .ics
                    </a>
                  </div>
                )}
              </>
            ) : (
              <Link
                href="/login"
                className="inline-block rounded-xl bg-(--gold) px-5 py-2 text-xs font-semibold text-black transition hover:brightness-105"
              >
                Log in to RSVP
              </Link>
            )}
          </div>

          {/* Key info cards */}
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="surface-card rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <Calendar size={14} className="text-(--gold)" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-black/50">
                  Date
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">{dayStr}</p>
            </div>
            <div className="surface-card rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <Clock size={14} className="text-(--gold)" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-black/50">
                  Time
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {endStr ? `${timeStr} – ${endStr}` : timeStr}
              </p>
            </div>
            <div className="surface-card col-span-2 rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin size={14} className="text-(--gold)" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-black/50">
                  Location
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">{event.location}</p>
            </div>
          </div>

          {/* Attendance + rating (real data only — no fabricated stats) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <p className="text-xs font-medium text-black/50">
              {count === 0
                ? "No one attending yet"
                : `${count} attending${event.max_attendees ? ` / ${event.max_attendees}` : ""}`}
              {isFull && (
                <span className="ml-1.5 inline-block rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  Sold Out
                </span>
              )}
            </p>
            {hasStarted && (
              <InlineEventRating
                eventId={event.id}
                isAuthenticated={!!user}
                autoFocus={autoFocusReview}
              />
            )}
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-0 rounded-xl bg-(--gold-soft)/40 p-1">
            {(["about", "gallery", "updates"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition ${
                  activeTab === tab
                    ? "bg-white text-foreground shadow"
                    : "text-black/50 hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── About tab ── */}
          {activeTab === "about" && (
            <div className="fade-in space-y-5">
              <div>
                <h2 className="mb-1 text-sm font-semibold">About this event</h2>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-black/70">
                  {event.description}
                </p>
              </div>

              {tags.length > 0 && <TagChipList tags={tags} />}

              {/* Share */}
              <SocialShareButtons
                title={event.title}
                description={`${new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${event.location}`}
                entityType="event"
                entityId={event.id}
              />

              {/* Contact */}
              {(event.website_url || event.contact_email || event.contact_phone) && (
                <div className="space-y-2">
                  {event.website_url && /^https?:\/\//i.test(event.website_url) && (
                    <div className="flex items-center gap-2 text-xs text-black/60">
                      <Globe size={14} className="shrink-0 text-(--gold)" />
                      <a
                        href={event.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--gold) hover:underline"
                      >
                        {(() => {
                          try {
                            return new URL(event.website_url).hostname;
                          } catch {
                            return event.website_url;
                          }
                        })()}
                      </a>
                    </div>
                  )}
                  {event.contact_email && (
                    <div className="flex items-center gap-2 text-xs text-black/60">
                      <Mail size={14} className="shrink-0 text-(--gold)" />
                      <a href={`mailto:${event.contact_email}`} className="text-(--gold) hover:underline">
                        {event.contact_email}
                      </a>
                    </div>
                  )}
                  {event.contact_phone && (
                    <div className="flex items-center gap-2 text-xs text-black/60">
                      <Phone size={14} className="shrink-0 text-(--gold)" />
                      <a href={`tel:${event.contact_phone}`} className="text-(--gold) hover:underline">
                        {event.contact_phone}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {hasCoords && (
                <MiniMap
                  latitude={event.latitude!}
                  longitude={event.longitude!}
                  eventId={hasRsvped ? event.id : undefined}
                />
              )}

              {/* Organiser card */}
              {organiser && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">Organised by</h3>
                  <Link
                    href={
                      isApprovedContributor(organiser) && organiser.contributor_slug
                        ? `/c/${organiser.contributor_slug}`
                        : `/profile/${organiser.id}`
                    }
                    prefetch={false}
                    className="surface-card flex items-center gap-3 rounded-2xl p-3 transition hover:border-(--gold)/40"
                  >
                    {organiser.logo_url || organiser.avatar_url ? (
                      <Image
                        src={(organiser.logo_url || organiser.avatar_url)!}
                        alt={organiser.full_name || "Organiser"}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--gold-soft) text-base font-bold uppercase text-(--gold-dark)">
                        {(organiser.full_name || "O").charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {organiser.full_name || "Organiser"}
                      </span>
                      {isApprovedContributor(organiser) && (
                        <span className="block text-xs font-semibold text-(--gold)">
                          Contributor
                        </span>
                      )}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-black/30" />
                  </Link>
                </div>
              )}

              {/* Volunteer CTA */}
              {event.volunteer_openings && organiserHandle && (
                <VolunteerApplyButton
                  entityType="event"
                  entityId={event.id}
                  contributorHandle={organiserHandle}
                  userId={user?.id ?? null}
                  initialStatus={volunteerStatus}
                  initialApplicationId={volunteerApplicationId}
                  isOwner={user?.id === event.created_by}
                />
              )}

              {/* Message organiser */}
              {user && user.id !== event.created_by && (
                <MessageButton
                  recipientId={event.created_by}
                  recipientName={organiser?.full_name || "Organiser"}
                />
              )}

              {/* Live location sharing */}
              {user && hasRsvped && (
                <LocationSharingToggle
                  event={event}
                  isAttending={hasRsvped}
                  locationSharingEnabled={locationSharingEnabled}
                />
              )}

              {/* Friends attending */}
              {friendAttendees.length > 0 && (
                <div className="border-t border-black/10 pt-4">
                  <h3 className="mb-2 text-xs font-semibold text-black/60">Friends attending</h3>
                  <WhoIsAttending
                    attendees={friendAttendees}
                    totalCount={friendAttendees.length}
                    visibility="public"
                    isAuthenticated={!!user}
                    hideCountHeader
                  />
                </div>
              )}

              {/* Discoverable attendees (opt-in, RSVPed viewers only) */}
              {discoverableAttendees.length > 0 && (
                <div className="border-t border-black/10 pt-4">
                  <h3 className="mb-3 text-xs font-semibold text-black/60">People attending</h3>
                  <div className="flex flex-wrap gap-2">
                    {discoverableAttendees.map((attendee) => (
                      <div
                        key={attendee.user_id}
                        className="flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.02] py-1 pl-1 pr-2"
                      >
                        {attendee.avatar_url ? (
                          <Image
                            src={attendee.avatar_url}
                            alt={attendee.full_name}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-[10px] font-bold uppercase text-amber-800">
                            {attendee.full_name[0]}
                          </div>
                        )}
                        <span className="text-xs font-medium text-black/70">
                          {attendee.full_name.split(" ")[0]}
                        </span>
                        <MessageButton
                          recipientId={attendee.user_id}
                          recipientName={attendee.full_name}
                          variant="icon"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Gallery tab ── */}
          {activeTab === "gallery" && (
            <div className="fade-in">
              {media.length > 0 ? (
                <EventMediaStrip media={media} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Camera size={32} className="mb-3 text-black/20" />
                  <p className="text-sm text-black/50">No gallery photos yet</p>
                </div>
              )}
            </div>
          )}

          {/* ── Updates tab ── */}
          {activeTab === "updates" && (
            <div className="fade-in space-y-5">
              {broadcasts.length > 0 ? (
                <OrgBroadcastList broadcasts={broadcasts} showReactions />
              ) : (
                !canManageEvent && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Radio size={32} className="mb-3 text-black/20" />
                    <p className="text-sm text-black/50">No broadcast updates yet</p>
                  </div>
                )
              )}
              {/* Legacy event_updates — kept for owners/admins (composer) and
                  when there are no contributor broadcasts, to avoid two
                  "From the Organiser" feeds. */}
              {(canManageEvent || broadcasts.length === 0) && (
                <EventUpdatesList eventId={event.id} isOwner={canManageEvent} />
              )}
            </div>
          )}

          {/* Comments — always available, re-dressed */}
          <div className="mt-6 border-t border-black/10 pt-5">
            <CommentSection eventId={event.id} user={user} />
          </div>

          {/* Live location tracking prompt */}
          {user && hasRsvped && (
            <LiveTrackingPrompt
              eventId={event.id}
              eventDate={event.date}
              hasRsvped={hasRsvped}
              locationSharingEnabled={locationSharingEnabled}
            />
          )}
        </div>
      </article>
    </div>
  );
}
