// Server component that fetches and renders the full place detail
// body (without any page chrome). Used by both the standalone
// `/places/[id]` page and the intercepted `@panel/(.)places/[id]`
// drawer so the two stay in sync with zero duplication.
//
// `cache()` wraps the top-level fetch so if Next.js renders both
// the `children` and `@panel` slots in the same request, we share
// one DB round-trip instead of two.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ShareButton from "@/components/ui/ShareButton";
import ReviewList from "@/components/reviews/ReviewList";
import ReverifyPlaceButton from "@/components/places/ReverifyPlaceButton";
import FollowPlaceButton from "@/components/places/FollowPlaceButton";
import { ReportButton } from "@/components/ui/ReportButton";
import MediaStrip from "@/components/media/MediaStrip";
import { isAdmin as profileIsAdmin, isApprovedContributor } from "@/lib/profiles/capabilities";
import type { Event, Place, PlaceMedia, Review } from "@/types/db";

export const getPlaceById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("*, categories(*)")
    .eq("id", id)
    .maybeSingle<Place>();
  return data;
});

export default async function PlaceDetailServer({ id }: { id: string }) {
  const supabase = await createClient();

  const place = await getPlaceById(id);

  if (!place) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = !!user && user.id === place.created_by;

  const [reviewsRes, mediaRes, followerCountRes, userFollowRes, profileRes, ownerRes, upcomingEventsRes, pastEventsRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("*, profiles(full_name)")
      .eq("place_id", id)
      .order("created_at", { ascending: false })
      .returns<Review[]>(),
    supabase
      .from("place_media")
      .select("*")
      .eq("place_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<PlaceMedia[]>(),
    supabase
      .from("place_follows")
      .select("id", { count: "exact", head: true })
      .eq("place_id", id),
    user
      ? supabase
          .from("place_follows")
          .select("id")
          .eq("place_id", id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    place.created_by
      ? supabase
          .from("profiles")
          .select("id, full_name, role, contributor_status, contributor_slug")
          .eq("id", place.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    place.created_by
      ? supabase
          .from("events")
          .select("id, title, date, category, image_url")
          .eq("created_by", place.created_by)
          .eq("status", "active")
          .gte("date", new Date().toISOString())
          .order("date", { ascending: true })
          .limit(10)
          .returns<Pick<Event, "id" | "title" | "date" | "category" | "image_url">[]>()
      : Promise.resolve({ data: [] as Pick<Event, "id" | "title" | "date" | "category" | "image_url">[] }),
    place.created_by
      ? supabase
          .from("events")
          .select("id, title, date, category, image_url")
          .eq("created_by", place.created_by)
          .eq("status", "active")
          .lt("date", new Date().toISOString())
          .order("date", { ascending: false })
          .limit(10)
          .returns<Pick<Event, "id" | "title" | "date" | "category" | "image_url">[]>()
      : Promise.resolve({ data: [] as Pick<Event, "id" | "title" | "date" | "category" | "image_url">[] }),
  ]);

  const reviews = reviewsRes.data;
  const media = mediaRes.data ?? [];
  const followerCount = followerCountRes.count ?? 0;
  const isFollowing = !!userFollowRes.data;
  const isAdmin = profileIsAdmin(profileRes.data);
  const canEdit = isOwner || isAdmin;
  const upcomingEvents = upcomingEventsRes.data ?? [];
  const pastEvents = pastEventsRes.data ?? [];

  const owner = (ownerRes.data ?? null) as {
    id: string;
    full_name: string | null;
    role: string | null;
    contributor_status: string | null;
    contributor_slug: string | null;
  } | null;
  const ownerLinkable =
    isApprovedContributor(owner) &&
    !!owner?.contributor_slug;

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <div className="space-y-4">
      {place.image_url && (
        <div className="relative h-48 w-full">
          <Image
            src={place.image_url}
            alt={place.name}
            fill
            className="rounded-xl object-cover"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>
      )}

      <MediaStrip media={media} ariaLabel="Place media gallery" />

      <div className="flex items-start justify-between gap-3">
        <div>
          {place.categories && (
            <span className="inline-block rounded-full bg-(--gold-soft) px-2.5 py-0.5 text-xs font-semibold text-(--foreground-soft)">
              {place.categories.name}
            </span>
          )}
          <h2 className="mt-1 text-2xl font-bold text-black">
            {place.name}
          </h2>
          {owner?.full_name && (
            <p className="mt-1 text-xs text-black/60">
              Owned by{" "}
              {ownerLinkable ? (
                <Link
                  href={`/c/${encodeURIComponent(owner.contributor_slug!)}`}
                  className="font-medium text-(--gold) hover:underline"
                >
                  {owner.full_name}
                </Link>
              ) : (
                <span className="font-medium text-black/70">
                  {owner.full_name}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {avgRating !== null && (
            <div className="text-right">
              <div className="text-xl font-bold text-(--gold)">
                {avgRating.toFixed(1)}
              </div>
              <div className="text-xs text-black/50">
                {reviews?.length ?? 0} review{(reviews?.length ?? 0) !== 1 ? "s" : ""}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <FollowPlaceButton
              placeId={place.id}
              isFollowing={isFollowing}
              followerCount={followerCount}
            />
            <ShareButton title={place.name} />
            {user && user.id !== place.created_by && (
              <ReportButton
                targetType="place"
                targetId={place.id}
                isAuthenticated={true}
              />
            )}
          </div>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-black/80">
        {place.description}
      </p>

      <div className="space-y-1 text-sm text-black/70">
        <p>{place.address}</p>
        {place.phone && <p>{place.phone}</p>}
      </div>

      {place.website && /^https?:\/\//i.test(place.website) && (
        <div className="rounded-xl border border-black/8 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-black/40">
            Website
          </p>
          <a
            href={place.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-(--gold) hover:underline"
          >
            {place.website.replace(/^https?:\/\//, "")}
          </a>
        </div>
      )}

      {place.verified && (
        <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          Verified
        </span>
      )}

      {place.verification_flagged && (
        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Possibly closed (community reports)
        </span>
      )}

      {isOwner && <ReverifyPlaceButton placeId={place.id} />}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/places/${place.id}/edit`}
            className="inline-block rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
          >
            Edit Place
          </Link>
          {isOwner && (
            <Link
              href="/events/new"
              className="inline-block rounded-xl border border-(--gold) px-4 py-2 text-sm font-semibold text-(--gold) hover:bg-(--gold-soft)"
            >
              + Create Event
            </Link>
          )}
        </div>
      )}

      {(upcomingEvents.length > 0 || pastEvents.length > 0) && (
        <div className="mt-2 space-y-4">
          {upcomingEvents.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-black/50">
                Upcoming events from this organizer
              </h3>
              <ul className="divide-y divide-black/5 rounded-xl border border-black/8">
                {upcomingEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-black/3"
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
                      <span className="shrink-0 text-sm text-(--gold)">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pastEvents.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-black/50">
                Past events
              </h3>
              <ul className="divide-y divide-black/5 rounded-xl border border-black/8">
                {pastEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-black/70 transition-colors hover:bg-black/3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{e.title}</p>
                        <p className="text-xs text-black/50">
                          {new Date(e.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-black/40">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Reviews */}
      <div className="mt-2">
        <ReviewList placeId={place.id} title="Place Reviews" />
      </div>
    </div>
  );
}
