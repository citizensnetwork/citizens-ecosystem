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

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { Event, Profile } from "@/types/db";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/messaging/MessageButton";
import { getRoleDisplayLabel } from "@/types/db";

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
}

export function ContributorPublicProfile({
  profile,
  viewer,
  isFollowing,
  isFriend,
  followersCount,
  followingCount,
  upcomingEvents,
  pastEvents,
}: ContributorPublicProfileProps) {
  const displayName = profile.full_name || profile.email;
  const firstName = profile.full_name?.split(" ")[0] ?? "them";
  const gallery = Array.isArray(profile.gallery_urls)
    ? profile.gallery_urls.slice(0, 6)
    : [];
  const hasCoords =
    typeof profile.physical_latitude === "number" &&
    typeof profile.physical_longitude === "number";

  return (
    <div className="min-h-screen bg-[#faf9f6] pb-16">
      {/* ── 1. Header band ─────────────────────────────── */}
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-start sm:gap-6 sm:py-8">
          {profile.logo_url || profile.avatar_url ? (
            <Image
              src={(profile.logo_url ?? profile.avatar_url) as string}
              alt=""
              width={96}
              height={96}
              className="h-20 w-20 shrink-0 rounded-2xl object-cover sm:h-24 sm:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-(--gold-soft) text-3xl font-bold uppercase text-black sm:h-24 sm:w-24">
              {displayName?.[0] ?? "?"}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-black sm:text-3xl">
                {displayName}
              </h1>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-(--gold,#D4AF37) px-2.5 py-0.5 text-[11px] font-semibold text-black"
                title="Approved Citizens Connect Contributor"
              >
                <VerifiedIcon /> Contributor
              </span>
            </div>
            <p className="mt-1 text-sm text-black/60">
              {getRoleDisplayLabel("contributor", profile.contributor_kind)}
            </p>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-black/70">
              <span>
                <strong className="text-black">{followersCount}</strong>{" "}
                {followersCount === 1 ? "follower" : "followers"}
              </span>
              <span>
                <strong className="text-black">{followingCount}</strong> following
              </span>
              {isFriend && (
                <span className="inline-flex items-center gap-1 rounded-full bg-(--gold-soft) px-2 py-0.5 text-xs font-semibold text-black">
                  Friends
                </span>
              )}
            </div>
          </div>

          {viewer && (
            <div className="flex shrink-0 items-center gap-2">
              <MessageButton
                recipientId={profile.id}
                recipientName={profile.full_name}
                variant="icon"
              />
              <FollowButton
                followeeId={profile.id}
                isFollowing={isFollowing}
                isFriend={isFriend}
              />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        {/* ── 2. About ──────────────────────────────────── */}
        {profile.bio ? (
          <Section title="About">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-black/80">
              {profile.bio}
            </p>
            <SocialLinksRow profile={profile} />
          </Section>
        ) : (
          <SocialLinksRow profile={profile} standalone />
        )}

        {/* ── 3. Find us ────────────────────────────────── */}
        {(profile.physical_address || hasCoords) && (
          <Section title="Find us">
            {profile.physical_address && (
              <p className="text-sm text-black/70">{profile.physical_address}</p>
            )}
            {hasCoords && (
              <div className="mt-3 h-48 w-full overflow-hidden rounded-xl">
                <MiniMap
                  latitude={profile.physical_latitude as number}
                  longitude={profile.physical_longitude as number}
                />
              </div>
            )}
          </Section>
        )}

        {/* ── 4. Gallery ────────────────────────────────── */}
        {gallery.length > 0 && (
          <Section title="Gallery">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gallery.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="relative aspect-square overflow-hidden rounded-lg"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 5. Upcoming events ───────────────────────── */}
        <Section title={`Upcoming events from ${firstName}`}>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-black/60">Nothing scheduled right now.</p>
          ) : (
            <EventRows events={upcomingEvents} />
          )}
        </Section>

        {/* ── 6. Past events ───────────────────────────── */}
        {pastEvents.length > 0 && (
          <Section title="Past events">
            <EventRows events={pastEvents} showRatings />
          </Section>
        )}

        {/* ── 7. Contact fallback for unauthenticated ──── */}
        {!viewer && (
          <div className="rounded-xl border border-black/10 bg-white p-4 text-center text-sm text-black/70">
            <Link
              href="/login"
              className="font-semibold text-(--gold) hover:underline"
            >
              Log in
            </Link>{" "}
            to follow and message {firstName}.
          </div>
        )}
      </main>
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

function SocialLinksRow({
  profile,
  standalone = false,
}: {
  profile: Profile;
  standalone?: boolean;
}) {
  const links: Array<{ label: string; href: string }> = [];
  if (profile.website_url)
    links.push({ label: "Website", href: profile.website_url });
  if (profile.instagram_handle)
    links.push({
      label: "Instagram",
      href: `https://instagram.com/${profile.instagram_handle.replace(/^@/, "")}`,
    });
  if (profile.facebook_url)
    links.push({ label: "Facebook", href: profile.facebook_url });
  if (profile.tiktok_handle)
    links.push({
      label: "TikTok",
      href: `https://tiktok.com/@${profile.tiktok_handle.replace(/^@/, "")}`,
    });
  if (profile.youtube_url)
    links.push({ label: "YouTube", href: profile.youtube_url });

  if (links.length === 0) return null;

  const content = (
    <ul className={`flex flex-wrap gap-2 ${standalone ? "" : "mt-4"}`}>
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/80 hover:border-(--gold) hover:text-black"
          >
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
