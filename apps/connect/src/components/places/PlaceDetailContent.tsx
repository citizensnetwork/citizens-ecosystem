"use client";

// Client body for the place detail surface — the Figma "PlaceProfile"
// layout (cover hero, Follow/Message action row, real stats, and
// About / Events / Gallery tabs). Rendered by the server component
// `PlaceDetailServer`, which does all the data fetching and passes the
// already-resolved props in. Shared by both the full `/places/[id]`
// page and the intercepted `@panel/(.)places/[id]` drawer.

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  MapPin,
  Phone,
  Globe,
  Users,
  Star,
  Camera,
  ChevronRight,
  HandHeart,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";
import ShareButton from "@/components/ui/ShareButton";
import ReviewList from "@/components/reviews/ReviewList";
import ReverifyPlaceButton from "@/components/places/ReverifyPlaceButton";
import FollowPlaceButton from "@/components/places/FollowPlaceButton";
import { ReportButton } from "@/components/ui/ReportButton";
import MediaStrip from "@/components/media/MediaStrip";
import OrgBroadcastList from "@/components/contributor/OrgBroadcastList";
import VolunteerApplyButton from "@/components/volunteer/VolunteerApplyButton";
import type { VolunteerStatus } from "@/components/volunteer/VolunteerApplyButton";
import MessageButton from "@/components/messaging/MessageButton";
import type { Event, Place, PlaceMedia } from "@/types/db";

type PlaceOwner = {
  id: string;
  full_name: string | null;
  role: string | null;
  contributor_status: string | null;
  contributor_slug: string | null;
} | null;

type PlaceEvent = Pick<Event, "id" | "title" | "date" | "category" | "image_url">;

type Props = {
  place: Place;
  owner: PlaceOwner;
  ownerLinkable: boolean;
  media: PlaceMedia[];
  followerCount: number;
  isFollowing: boolean;
  avgRating: number | null;
  reviewsCount: number;
  upcomingEvents: PlaceEvent[];
  pastEvents: PlaceEvent[];
  broadcasts: { id: string; body: string; created_at: string }[];
  volunteerStatus: VolunteerStatus;
  volunteerApplicationId: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  isOwner: boolean;
  canEdit: boolean;
};

type PlaceTab = "about" | "events" | "gallery";

export default function PlaceDetailContent({
  place,
  owner,
  ownerLinkable,
  media,
  followerCount,
  isFollowing,
  avgRating,
  reviewsCount,
  upcomingEvents,
  pastEvents,
  broadcasts,
  volunteerStatus,
  volunteerApplicationId,
  userId,
  isAuthenticated,
  isOwner,
  canEdit,
}: Props) {
  const [activeTab, setActiveTab] = useState<PlaceTab>("about");

  const category = place.categories;
  const catColor = category?.color ?? "var(--gold)";
  const allEvents = [...upcomingEvents, ...pastEvents];

  return (
    <div className="flex items-start justify-center sm:px-4 sm:py-6">
      <article className="w-full max-w-2xl overflow-hidden bg-white shadow-xl sm:rounded-3xl">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="relative h-60 shrink-0 overflow-hidden sm:h-64">
          {place.image_url ? (
            <Image
              src={place.image_url}
              alt={place.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 720px"
              priority
            />
          ) : (
            <div className="h-full w-full gold-gradient" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Top-right glass actions */}
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <ShareButton title={place.name} entityType="place" entityId={place.id} />
            {isAuthenticated && !isOwner && (
              <ReportButton targetType="place" targetId={place.id} isAuthenticated />
            )}
            {canEdit && (
              <Link
                href={`/places/${place.id}/edit`}
                className="rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/60"
              >
                Edit
              </Link>
            )}
          </div>

          {/* Title block */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {category && (
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow"
                  style={{ background: catColor }}
                >
                  {category.emoji ? `${category.emoji} ` : ""}
                  {category.name}
                </span>
              )}
              {place.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  <BadgeCheck size={11} /> Verified
                </span>
              )}
              {place.verification_flagged && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  <AlertTriangle size={11} /> Possibly closed
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-lg">
              {place.name}
            </h1>
            <div className="mt-1 flex items-center gap-1.5">
              <MapPin size={12} className="text-white/70" />
              <span className="text-xs text-white/80">{place.address}</span>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="px-5 py-5 sm:px-6">
          {/* Action row — Follow + Message */}
          <div className="flex flex-wrap items-center gap-2 border-b border-black/10 pb-4">
            <FollowPlaceButton
              placeId={place.id}
              isFollowing={isFollowing}
              followerCount={followerCount}
            />
            {isAuthenticated && !isOwner && owner && (
              <MessageButton
                recipientId={place.created_by}
                recipientName={owner.full_name || "Owner"}
              />
            )}
            {isOwner && <ReverifyPlaceButton placeId={place.id} />}
          </div>

          {/* Stats — real data only (Followers + Rating; Figma "Hours" omitted, no field) */}
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="surface-card rounded-2xl p-4">
              <div className="mb-1 flex items-center gap-2">
                <Users size={14} className="text-(--gold)" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-black/50">
                  Followers
                </span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {followerCount.toLocaleString()}
              </p>
            </div>
            <div className="surface-card rounded-2xl p-4">
              <div className="mb-1 flex items-center gap-2">
                <Star size={14} className="text-(--gold)" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-black/50">
                  Rating
                </span>
              </div>
              {avgRating !== null ? (
                <p className="text-lg font-bold text-foreground">
                  {avgRating.toFixed(1)}
                  <span className="ml-1 text-xs font-medium text-black/50">
                    ({reviewsCount})
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium text-black/40">No reviews yet</p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-0 rounded-xl bg-(--gold-soft)/40 p-1">
            {(["about", "events", "gallery"] as const).map((tab) => (
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
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80">
                {place.description}
              </p>

              {/* Contact */}
              {(place.phone || (place.website && /^https?:\/\//i.test(place.website))) && (
                <div className="space-y-2">
                  {place.phone && (
                    <div className="flex items-center gap-2 text-xs text-black/60">
                      <Phone size={14} className="shrink-0 text-(--gold)" />
                      <a href={`tel:${place.phone}`} className="text-(--gold) hover:underline">
                        {place.phone}
                      </a>
                    </div>
                  )}
                  {place.website && /^https?:\/\//i.test(place.website) && (
                    <div className="flex items-center gap-2 text-xs text-black/60">
                      <Globe size={14} className="shrink-0 text-(--gold)" />
                      <a
                        href={place.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--gold) hover:underline"
                      >
                        {place.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Managed by */}
              {owner?.full_name && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">Managed by</h3>
                  {ownerLinkable ? (
                    <Link
                      href={`/c/${encodeURIComponent(owner.contributor_slug!)}`}
                      className="surface-card flex items-center gap-3 rounded-2xl p-3 transition hover:border-(--gold)/40"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--gold-soft) text-base font-bold uppercase text-(--gold-dark)">
                        {owner.full_name.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">
                          {owner.full_name}
                        </span>
                        <span className="block text-xs font-semibold text-(--gold)">
                          Contributor
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-black/30" />
                    </Link>
                  ) : (
                    <div className="surface-card flex items-center gap-3 rounded-2xl p-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--gold-soft) text-base font-bold uppercase text-(--gold-dark)">
                        {owner.full_name.charAt(0)}
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {owner.full_name}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Serve Here — ongoing volunteer need */}
              {place.volunteer_openings && owner?.contributor_slug && (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/40 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500">
                      <HandHeart size={18} className="text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Serve Here</p>
                      <p className="text-xs text-emerald-700">
                        Volunteer opportunities are available at this place.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <VolunteerApplyButton
                      entityType="place"
                      entityId={place.id}
                      contributorHandle={owner.contributor_slug}
                      userId={userId}
                      initialStatus={volunteerStatus}
                      initialApplicationId={volunteerApplicationId}
                      isOwner={isOwner}
                    />
                  </div>
                </div>
              )}

              {/* Owner: create event */}
              {isOwner && (
                <Link
                  href="/events/new"
                  className="inline-block rounded-xl border border-(--gold) px-4 py-2 text-sm font-semibold text-(--gold) transition hover:bg-(--gold-soft)"
                >
                  + Create Event
                </Link>
              )}

              {/* From the Organiser — broadcasts */}
              {broadcasts.length > 0 && (
                <div className="border-t border-black/10 pt-4">
                  <OrgBroadcastList broadcasts={broadcasts} />
                </div>
              )}

              {/* Reviews */}
              <div className="border-t border-black/10 pt-4">
                <ReviewList placeId={place.id} title="Place Reviews" />
              </div>
            </div>
          )}

          {/* ── Events tab ── */}
          {activeTab === "events" && (
            <div className="fade-in space-y-3">
              {allEvents.length > 0 ? (
                allEvents.map((e) => {
                  const isPast = new Date(e.date) < new Date();
                  return (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      className={`surface-card flex items-center gap-3 rounded-2xl p-3 transition hover:border-(--gold)/40 ${
                        isPast ? "opacity-70" : ""
                      }`}
                    >
                      {e.image_url ? (
                        <Image
                          src={e.image_url}
                          alt={e.title}
                          width={56}
                          height={56}
                          className="h-14 w-14 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="h-14 w-14 shrink-0 rounded-xl gold-gradient" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">
                          {e.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-black/55">
                          {new Date(e.date).toLocaleDateString("en-US", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {isPast && " · past"}
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-black/30" />
                    </Link>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-black/50">
                    No events from this organiser yet
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Gallery tab ── */}
          {activeTab === "gallery" && (
            <div className="fade-in">
              {media.length > 0 ? (
                <MediaStrip media={media} ariaLabel="Place media gallery" />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Camera size={32} className="mb-3 text-black/20" />
                  <p className="text-sm text-black/50">No gallery photos yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
