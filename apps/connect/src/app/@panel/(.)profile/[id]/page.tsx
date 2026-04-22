// Intercepted route — /profile/[id] opens as a side drawer when
// navigated to from within the app. Deep-links and refreshes still
// render the full /profile/[id]/page.tsx.

import SidePanel from "@/components/ui/SidePanel";
import ProfileDetailServer from "@/components/profile/ProfileDetailServer";
import { Suspense } from "react";

export default async function InterceptedProfilePanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SidePanel title="Profile" fallbackHref="/events">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <Suspense
          fallback={
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="skeleton h-16 w-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-1/2 rounded" />
                  <div className="skeleton h-4 w-1/3 rounded" />
                </div>
              </div>
              <div className="skeleton mt-6 h-32 w-full rounded-xl" />
            </div>
          }
        >
          <ProfileDetailServer id={id} />
        </Suspense>
      </div>
    </SidePanel>
  );
}
