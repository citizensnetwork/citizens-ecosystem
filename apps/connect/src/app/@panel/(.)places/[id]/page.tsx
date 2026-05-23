// Intercepted route — when navigating to /places/[id] via a client-side
// transition (Link / router.push), render the full detail view inside a
// right-side drawer instead of the full page. Direct loads and refreshes
// fall through to /places/[id]/page.tsx unchanged.

import SidePanel from "@/components/ui/SidePanel";
import PlaceDetailServer, { getPlaceById } from "@/components/places/PlaceDetailServer";
import { Suspense } from "react";

export default async function InterceptedPlacePanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const place = await getPlaceById(id);
  const title = place?.name ?? "Place";

  return (
    <SidePanel title={title} fallbackHref="/events">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <Suspense
          fallback={
            <div className="p-6 space-y-4">
              <div className="skeleton h-48 w-full rounded-xl" />
              <div className="skeleton h-6 w-2/3 rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton h-24 w-full rounded-xl" />
            </div>
          }
        >
          <div className="p-6">
            <PlaceDetailServer id={id} />
          </div>
        </Suspense>
      </div>
    </SidePanel>
  );
}
