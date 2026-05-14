import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ShareButton from "@/components/ui/ShareButton";
import ReviewList from "@/components/reviews/ReviewList";
import ReverifyPlaceButton from "@/components/places/ReverifyPlaceButton";
import FollowPlaceButton from "@/components/places/FollowPlaceButton";
import { ReportButton } from "@/components/ui/ReportButton";
import { PageHeader } from "@/components/ui/PageHeader";
import MediaStrip from "@/components/media/MediaStrip";
import type { Place, PlaceMedia, Review } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: place } = await supabase
    .from("places")
    .select("*, categories(*)")
    .eq("id", id)
    .single<Place>();

  if (!place) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = !!user && user.id === place.created_by;

  // Fetch reviews, media, follow data, profile, and place owner in parallel
  const [reviewsRes, mediaRes, followerCountRes, userFollowRes, profileRes, ownerRes] = await Promise.all([
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
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    place.created_by
      ? supabase
          .from("profiles")
          .select("id, full_name, role, contributor_status, contributor_slug")
          .eq("id", place.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const reviews = reviewsRes.data;
  const media = mediaRes.data ?? [];
  const followerCount = followerCountRes.count ?? 0;
  const isFollowing = !!userFollowRes.data;
  const isAdmin = profileRes.data?.role === "admin";
  const canEdit = isOwner || isAdmin;
  // Surface the contributor that created this place so visitors can
  // jump to the org profile. Only link approved contributors with a
  // public slug — citizens and pending contributors render as plain
  // text (or are hidden entirely below).
  const owner = (ownerRes.data ?? null) as {
    id: string;
    full_name: string | null;
    role: string | null;
    contributor_status: string | null;
    contributor_slug: string | null;
  } | null;
  const ownerLinkable =
    owner?.role === "contributor" &&
    owner.contributor_status === "approved" &&
    !!owner.contributor_slug;

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <>
      <PageHeader title={place.name} subtitle={place.categories?.name} fallbackHref="/events" />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">

      <div className="space-y-4 rounded-2xl p-6">
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
            <h1 className="mt-1 text-2xl font-bold text-black">
              {place.name}
            </h1>
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
                  {reviews!.length} review{reviews!.length !== 1 ? "s" : ""}
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
          <Link
            href={`/places/${place.id}/edit`}
            className="inline-block rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
          >
            Edit Place
          </Link>
        )}
      </div>

      {/* Reviews */}
      <div className="mt-6">
        <ReviewList placeId={place.id} title="Place Reviews" />
      </div>
        </div>
      </div>
    </>
  );
}
