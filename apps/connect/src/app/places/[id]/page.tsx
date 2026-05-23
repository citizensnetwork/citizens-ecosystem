import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import PlaceDetailServer, { getPlaceById } from "@/components/places/PlaceDetailServer";

export const dynamic = "force-dynamic";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const place = await getPlaceById(id);

  if (!place) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={place.name}
        subtitle={(place.categories as { name?: string } | null)?.name}
        fallbackHref="/events"
      />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">
          <Suspense
            fallback={
              <div className="space-y-4">
                <div className="skeleton h-48 w-full rounded-xl" />
                <div className="skeleton h-6 w-2/3 rounded" />
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-24 w-full rounded-xl" />
              </div>
            }
          >
            <PlaceDetailServer id={id} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
