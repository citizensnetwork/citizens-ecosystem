// Intercepted route — when navigating to /events/[id] via a client
// side transition (Link / router.push), render the full detail view
// inside a right-side drawer instead of the full page. Direct loads
// and refreshes fall through to /events/[id]/page.tsx unchanged.

import SidePanel from "@/components/ui/SidePanel";
import EventDetailServer, {
  getEventById,
} from "@/components/events/EventDetailServer";
import { Suspense } from "react";

export default async function InterceptedEventPanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Cached by React — the inner EventDetailServer re-uses this
  // exact query result instead of hitting the DB again.
  const event = await getEventById(id);
  const title = event?.title ?? "Event";
  return (
    <SidePanel title={title} fallbackHref="/events">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <Suspense
          fallback={
            <div className="p-6">
              <div className="skeleton h-6 w-2/3 rounded" />
              <div className="skeleton mt-3 h-4 w-1/2 rounded" />
              <div className="skeleton mt-6 h-48 w-full rounded-xl" />
            </div>
          }
        >
          <EventDetailServer id={id} />
        </Suspense>
      </div>
    </SidePanel>
  );
}
