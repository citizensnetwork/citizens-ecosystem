// Public Contributor profile renderer.  Invoked by /profile/[id] and
// /c/[slug] when the viewed profile belongs to an approved
// Contributor.  The Citizen variant continues to use the existing
// compact layout in /profile/[id]/page.tsx.
//
// Sections (top → bottom):
//   1. Header band — logo/avatar, name, kind chip, CTAs (Follow, Message)
//   2. About — bio + social links row
//   3. Find us — physical address + mini-map (if coords set)
//   4. Gallery — up to N images from gallery_urls
//   5. Upcoming events — published, date >= now
//   6. Past events — date < now, with any avg rating shown
//   7. Contact — website, social, email-to-reply (via MessageButton)
//
// Marked "use client" because it composes `next/dynamic` with
// `ssr: false` for the MapLibre-based MiniMap — Next.js 15 disallows
// `ssr: false` in Server Components.
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Globe, ChevronRight, MapPin, BadgeCheck } from "lucide-react";
import type { ContributorKind, ContributorLocation, Event, Place, Profile } from "@/types/db";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/messaging/MessageButton";
import { ReportButton } from "@/components/ui/ReportButton";
import MediaStrip from "@/components/media/MediaStrip";
import DashboardAccessButton from "@/components/contributor/DashboardAccessButton";
import CoverPhotoCarousel from "@/components/contributor/CoverPhotoCarousel";
import ContributorThemeOverride from "@/components/contributor/ContributorThemeOverride";
import { isContributorThemeEnabled } from "@/lib/dashboard/theme";
import { CONTRIBUTOR_KIND_LABELS } from "@/types/db";
import {
  INVOLVEMENT_COLORS,
  INVOLVEMENT_DESCRIPTIONS,
  type InvolvementLevel,
} from "@/lib/contributors/involvement";

type ContributorPlace = Pick<Place, "id" | "name" | "address" | "image_url" | "verified">;

type ProfileTab = "about" | "events" | "places" | "team";

// Mini-map is a client-only MapLibre component.  Dynamic import with
// SSR off matches the pattern in `MiniMap.tsx`.
const MiniMap = dynamic(
  () => import("@/components/map/MiniMap").then((m) => m.default),
  { ssr: false, loading: () => <MiniMapSkeleton /> },
);

export interface ContributorPublicProfileProps {
  profile: Profile;
  viewer: { id: string } | null;
  isFollowing: boolean;
  isFriend: boolean;
  followersCount: number;
  followingCount: number;
  upcomingEvents: Event[];
  pastEvents: Array<Event & { avg_rating?: number | null; reviews_count?: number }>;
  /** Places hosted by this contributor — powers the Places tab + stat. */
  places?: ContributorPlace[];
  /** Computed involvement-level proxy (see lib/contributors/involvement). */
  involvementLevel: InvolvementLevel;
  /** Additional venues (migration 060). Primary venue still uses
   *  `profile.physical_address` + lat/lng. */
  locations?: ContributorLocation[];
  /** Computed server-side: owner / admin-granted / admin-no-grant / null. */
  dashboardMode?: "owner" | "admin-granted" | "admin-no-grant" | null;
  /** Pending access request id when admin has an outstanding request. */
  dashboardPendingRequestId?: string | null;
  /** Active team members (safe columns only — id, name, avatar, role). */
  team?: Array<{
    member_id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
  }>;
  /** Stage H public analytics totals — 30-day follows + joins. */
  publicAnalytics?: Record<string, number>;
}

export function ContributorPublicProfile({
  profile,
  viewer,
  isFollowing,
  isFriend,
  followersCount,
  upcomingEvents,
  pastEvents,
  places = [],
  involvementLevel,
  locations = [],
  dashboardMode = null,
  dashboardPendingRequestId = null,
  team = [],
  publicAnalytics = {},
}: ContributorPublicProfileProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("about");
  const displayName = profile.full_name || profile.email;
  const firstName = profile.full_name?.split(" ")[0] ?? "them";
  const coverPhotos = Array.isArray(profile.cover_photo_urls)
    ? profile.cover_photo_urls
    : [];
  const galleryMedia = Array.isArray(profile.gallery_urls)
    ? profile.gallery_urls.slice(0, 6)
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
        .map((url, index) => ({
          id: `${profile.id}-gallery-${index}`,
          url,
          kind: "image" as const,
          thumbnail_url: null,
          title: null,
        }))
    : [];
  const hasCoords =
    typeof profile.physical_latitude === "number" &&
    typeof profile.physical_longitude === "number";

  // Apply contributor theme tint across the entire contributor-owned
  // public profile experience (A8). Respect dev override env flag.
  const contributorThemeEnabled = isContributorThemeEnabled();

  const eventCount = upcomingEvents.length + pastEvents.length;
  const tabs: ProfileTab[] = ["about", "events", "places", "team"];

  return (
    <div
      data-contributor-ui={contributorThemeEnabled ? "" : undefined}
      className="bg-[#faf9f6] pb-16"
    >
      <ContributorThemeOverride />

      {/* ── Cover hero ── */}
      {coverPhotos.length > 0 ? (
        <CoverPhotoCarousel photos={coverPhotos} altLabel={displayName ?? "Contributor"} />
      ) : (
        <div className="h-40 w-full gold-gradient sm:h-52" />
      )}

      {/* ── Header card (overlaps the cover) ── */}
      <div className="mx-auto -mt-12 max-w-4xl px-4">
        <div className="relative rounded-3xl border border-black/5 bg-white p-5 shadow-lg sm:p-6">
          <div className="flex items-end gap-4">
            {profile.logo_url || profile.avatar_url ? (
              <Image
                src={(profile.logo_url ?? profile.avatar_url) as string}
                alt=""
                width={96}
                height={96}
                className="-mt-16 h-20 w-20 shrink-0 rounded-2xl object-cover shadow-lg ring-4 ring-white sm:h-24 sm:w-24"
              />
            ) : (
              <div className="-mt-16 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-(--gold-soft) text-3xl font-bold uppercase text-black shadow-lg ring-4 ring-white sm:h-24 sm:w-24">
                {displayName?.[0] ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-2xl font-bold text-black sm:text-3xl">
                  {displayName}
                </h1>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white shadow"
                  style={{ background: INVOLVEMENT_COLORS[involvementLevel] }}
                  title={INVOLVEMENT_DESCRIPTIONS[involvementLevel]}
                >
                  {involvementLevel}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-(--gold) px-2.5 py-0.5 text-[11px] font-semibold text-black"
                  title="Approved Citizens Connect Contributor"
                >
                  <VerifiedIcon /> Contributor
                </span>
                {isFriend && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-(--gold-soft) px-2 py-0.5 text-[11px] font-semibold text-black">
                    Friends
                  </span>
                )}
              </div>
              <ContributorKindLink contributorKind={profile.contributor_kind} />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="surface-card rounded-2xl p-3">
              <p className="text-base font-bold text-foreground">
                {followersCount.toLocaleString()}
              </p>
              <p className="text-[10px] text-black/50">
                {followersCount === 1 ? "Follower" : "Followers"}
              </p>
            </div>
            <div className="surface-card rounded-2xl p-3">
              <p className="text-base font-bold text-foreground">{eventCount}</p>
              <p className="text-[10px] text-black/50">Events</p>
            </div>
            <div className="surface-card rounded-2xl p-3">
              <p className="text-base font-bold text-foreground">{places.length}</p>
              <p className="text-[10px] text-black/50">Places</p>
            </div>
          </div>

          {/* Actions */}
          {viewer ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {dashboardMode && profile.contributor_slug && (
                <DashboardAccessButton
                  slug={profile.contributor_slug}
                  mode={dashboardMode}
                  pendingRequestId={dashboardPendingRequestId}
                />
              )}
              <FollowButton
                followeeId={profile.id}
                isFollowing={isFollowing}
                isFriend={isFriend}
              />
              {viewer.id !== profile.id && (
                <MessageButton
                  recipientId={profile.id}
                  recipientName={profile.full_name || "Organiser"}
                  variant="icon"
                />
              )}
              {profile.website_url && /^https?:\/\//i.test(profile.website_url) && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/15 text-black/60 transition hover:border-(--gold) hover:text-(--gold)"
                >
                  <Globe size={16} />
                </a>
              )}
              {viewer.id !== profile.id && (
                <ReportButton targetType="user" targetId={profile.id} isAuthenticated={true} />
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-black/10 bg-(--gold-soft)/30 px-4 py-3 text-center text-sm text-black/70">
              <Link href="/login" className="font-semibold text-(--gold) hover:underline">
                Log in
              </Link>{" "}
              to follow and message {firstName}.
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-4 mt-5 flex gap-0 overflow-x-auto rounded-xl bg-(--gold-soft)/40 p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                activeTab === tab
                  ? "bg-white text-foreground shadow"
                  : "text-black/50 hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="pb-4">
          {/* About */}
          {activeTab === "about" && (
            <div className="fade-in space-y-6">
              {profile.bio && (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-black/80">
                  {profile.bio}
                </p>
              )}
              <SocialLinksRow profile={profile} standalone />

              {(profile.physical_address || hasCoords || locations.length > 0) && (
                <Section title="Find us">
                  {profile.physical_address && (
                    <div>
                      {locations.length > 0 && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">
                          Main
                        </p>
                      )}
                      <p className="text-sm text-black/70">{profile.physical_address}</p>
                    </div>
                  )}
                  {hasCoords && (
                    <div className="mt-3 h-48 w-full overflow-hidden rounded-xl">
                      <MiniMap
                        latitude={profile.physical_latitude as number}
                        longitude={profile.physical_longitude as number}
                      />
                    </div>
                  )}
                  {locations.length > 0 && (
                    <ul className="mt-4 space-y-3 border-t border-black/5 pt-4">
                      {locations.map((loc) => (
                        <li key={loc.id}>
                          {loc.label && (
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">
                              {loc.label}
                            </p>
                          )}
                          <p className="text-sm text-black/70">{loc.address}</p>
                          {typeof loc.latitude === "number" &&
                            typeof loc.longitude === "number" && (
                              <div className="mt-2 h-40 w-full overflow-hidden rounded-xl">
                                <MiniMap latitude={loc.latitude} longitude={loc.longitude} />
                              </div>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {galleryMedia.length > 0 && (
                <Section title="Gallery">
                  <MediaStrip
                    media={galleryMedia}
                    ariaLabel="Contributor media gallery"
                    plainImages
                  />
                </Section>
              )}

              {(publicAnalytics.follows ?? 0) + (publicAnalytics.joins ?? 0) > 0 && (
                <Section title="Activity (30d)">
                  <div className="flex flex-wrap gap-2">
                    {(publicAnalytics.follows ?? 0) > 0 && (
                      <span className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/80">
                        {publicAnalytics.follows!.toLocaleString()} new follows
                      </span>
                    )}
                    {(publicAnalytics.joins ?? 0) > 0 && (
                      <span className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/80">
                        {publicAnalytics.joins!.toLocaleString()} joins
                      </span>
                    )}
                  </div>
                </Section>
              )}

              {!profile.bio &&
                !profile.physical_address &&
                !hasCoords &&
                locations.length === 0 &&
                galleryMedia.length === 0 &&
                (publicAnalytics.follows ?? 0) + (publicAnalytics.joins ?? 0) === 0 && (
                  <p className="py-8 text-center text-sm text-black/50">No details yet.</p>
                )}
            </div>
          )}

          {/* Events */}
          {activeTab === "events" && (
            <div className="fade-in space-y-6">
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/60">
                  Upcoming
                </h2>
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-black/55">Nothing scheduled right now.</p>
                ) : (
                  <EventRows events={upcomingEvents} />
                )}
              </div>
              {pastEvents.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/60">
                    Past
                  </h2>
                  <EventRows events={pastEvents} showRatings />
                </div>
              )}
            </div>
          )}

          {/* Places */}
          {activeTab === "places" && (
            <div className="fade-in space-y-3">
              {places.length === 0 ? (
                <p className="py-8 text-center text-sm text-black/50">No places yet.</p>
              ) : (
                places.map((p) => (
                  <Link
                    key={p.id}
                    href={`/places/${p.id}`}
                    className="surface-card flex items-center gap-3 rounded-2xl p-3 transition hover:border-(--gold)/40"
                  >
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        width={56}
                        height={56}
                        className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="h-14 w-14 shrink-0 rounded-xl gold-gradient" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-bold text-foreground">
                        <span className="truncate">{p.name}</span>
                        {p.verified && (
                          <BadgeCheck size={13} className="shrink-0 text-emerald-500" />
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-black/55">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">{p.address}</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-black/30" />
                  </Link>
                ))
              )}
            </div>
          )}

          {/* Team */}
          {activeTab === "team" && (
            <div className="fade-in">
              {team.length === 0 ? (
                <p className="py-8 text-center text-sm text-black/50">
                  No team members listed.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-3">
                  {team.map((member) => (
                    <li
                      key={member.member_id}
                      className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5"
                    >
                      {member.avatar_url ? (
                        <Image
                          src={member.avatar_url}
                          alt=""
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-(--gold-soft) text-[11px] font-semibold uppercase text-black">
                          {member.full_name?.[0] ?? "?"}
                        </div>
                      )}
                      <span className="text-xs font-medium text-black/80">
                        {member.full_name ?? "Member"}
                      </span>
                      {member.role === "owner" && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-(--gold)">
                          Owner
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/60">
        {title}
      </h2>
      <div className="rounded-xl border border-black/10 bg-white p-4">
        {children}
      </div>
    </section>
  );
}

/** Clickable contributor kind label — taps through to the events search
 *  pre-populated with this kind (e.g. "Ministry") so the user can browse
 *  all contributors of the same type. */
function ContributorKindLink({
  contributorKind,
}: {
  contributorKind: ContributorKind | null | undefined;
}) {
  if (!contributorKind) return null;
  const label = CONTRIBUTOR_KIND_LABELS[contributorKind];
  return (
    <Link
      href={`/events?q=${encodeURIComponent(label)}`}
      className="mt-1 inline-block text-sm text-black/50 underline-offset-2 hover:text-black/80 hover:underline"
      title={`Browse all ${label} contributors`}
    >
      {label}
    </Link>
  );
}

type SocialLink = {
  label: string;
  href: string;
  icon: ReactNode;
  pillClass: string;
};

function SocialLinksRow({
  profile,
  standalone = false,
}: {
  profile: Profile;
  standalone?: boolean;
}) {
  const links: SocialLink[] = [];

  if (profile.website_url)
    links.push({
      label: "Website",
      href: profile.website_url,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
      pillClass: "border-black/15 bg-white text-black/80 hover:border-black/40",
    });

  if (profile.instagram_handle)
    links.push({
      label: "Instagram",
      href: `https://instagram.com/${profile.instagram_handle.replace(/^@/, "")}`,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      ),
      pillClass: "border-pink-200 bg-gradient-to-r from-purple-50 to-pink-50 text-pink-700 hover:from-purple-100 hover:to-pink-100",
    });

  if (profile.facebook_url)
    links.push({
      label: "Facebook",
      href: profile.facebook_url,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      ),
      pillClass: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
    });

  if (profile.tiktok_handle)
    links.push({
      label: "TikTok",
      href: `https://tiktok.com/@${profile.tiktok_handle.replace(/^@/, "")}`,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.88a8.28 8.28 0 0 0 4.86 1.55V7a4.85 4.85 0 0 1-1.09-.31z" />
        </svg>
      ),
      pillClass: "border-black/20 bg-black text-white hover:bg-black/80",
    });

  if (profile.youtube_url)
    links.push({
      label: "YouTube",
      href: profile.youtube_url,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" /><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white" />
        </svg>
      ),
      pillClass: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    });

  if (links.length === 0) return null;

  const content = (
    <ul className={`flex flex-wrap gap-2 ${standalone ? "" : "mt-4"}`}>
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${l.pillClass}`}
          >
            {l.icon}
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );

  if (!standalone) return content;
  return (
    <Section title="Find us online">
      {content}
    </Section>
  );
}

function EventRows({
  events,
  showRatings = false,
}: {
  events: Array<Event & { avg_rating?: number | null; reviews_count?: number }>;
  showRatings?: boolean;
}) {
  return (
    <ul className="divide-y divide-black/5">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`/events/${e.id}`}
            className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-black/3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-black">{e.title}</p>
              <p className="text-xs text-black/60">
                {new Date(e.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {showRatings && e.avg_rating ? (
              <span className="shrink-0 text-xs text-black/60">
                ★ {e.avg_rating.toFixed(1)}
                {e.reviews_count ? ` (${e.reviews_count})` : ""}
              </span>
            ) : (
              <span className="shrink-0 text-sm text-(--gold)">→</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MiniMapSkeleton() {
  return <div className="h-48 w-full animate-pulse rounded-xl bg-black/5" />;
}

function VerifiedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3 w-3"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
