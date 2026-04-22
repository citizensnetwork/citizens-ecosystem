// Intercepted route — /c/[slug] opens as a side drawer when
// navigated to from within the app. Deep-links and refreshes still
// render the full /c/[slug]/page.tsx.
//
// Note: React `cache()` wraps `resolveContributorSlug` so if Next.js
// renders both the standalone page and this drawer in a single
// request we share one DB round-trip.

import { Suspense } from "react";
import SidePanel from "@/components/ui/SidePanel";
import ProfileDetailServer from "@/components/profile/ProfileDetailServer";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";

export default async function InterceptedContributorPanel({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await resolveContributorSlug(slug);
  const title = profile?.full_name ?? "Contributor";

  return (
    <SidePanel title={title} fallbackHref="/events">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <Suspense
          fallback={
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="skeleton h-20 w-20 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-1/2 rounded" />
                  <div className="skeleton h-4 w-1/3 rounded" />
                </div>
              </div>
              <div className="skeleton mt-6 h-48 w-full rounded-xl" />
              <div className="skeleton mt-4 h-32 w-full rounded-xl" />
            </div>
          }
        >
          {profile?.id ? (
            <ProfileDetailServer id={profile.id} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-black/60">
              Contributor not found.
            </div>
          )}
        </Suspense>
      </div>
    </SidePanel>
  );
}
