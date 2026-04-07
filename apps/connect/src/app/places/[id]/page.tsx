import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ShareButton from "@/components/ui/ShareButton";
import ReviewList from "@/components/reviews/ReviewList";
import ReverifyPlaceButton from "@/components/places/ReverifyPlaceButton";
import type { Place, Review } from "@/types/db";

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

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, profiles(full_name)")
    .eq("place_id", id)
    .order("created_at", { ascending: false })
    .returns<Review[]>();

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/events"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black"
      >
        ← Back to map
      </Link>

      <div className="surface-card space-y-4 rounded-2xl p-6">
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
            <ShareButton title={place.name} />
          </div>
        </div>

        <p className="text-sm leading-relaxed text-black/80">
          {place.description}
        </p>

        <div className="space-y-1 text-sm text-black/70">
          <p>📍 {place.address}</p>
          {place.phone && <p>📞 {place.phone}</p>}
          {place.website && (
            <p>
              🌐{" "}
              <a
                href={place.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--gold) underline"
              >
                {place.website.replace(/^https?:\/\//, "")}
              </a>
            </p>
          )}
        </div>

        {place.verified && (
          <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            ✓ Verified
          </span>
        )}

        {place.verification_flagged && (
          <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            ⚠ Possibly closed (community reports)
          </span>
        )}

        {isOwner && <ReverifyPlaceButton placeId={place.id} />}
      </div>

      {/* Reviews */}
      <div className="mt-6">
        <ReviewList placeId={place.id} title="Place Reviews" />
      </div>
    </div>
  );
}
