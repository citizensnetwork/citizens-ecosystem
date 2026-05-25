// Intercepted route — when navigating to /events/new via a client-side
// transition (Link / router.push), render the create-event form inside the
// right-side SidePanel drawer instead of a full-page load.
//
// Without this file, the dynamic-segment interceptor at
// @panel/(.)events/[id] would match "new" as an event id, look it up in the
// DB, find nothing, and show the "Not found" panel — the bug the user
// reported. Static segments take priority over dynamic ones in Next.js
// App Router, so this file wins for the /events/new path.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import SidePanel from "@/components/ui/SidePanel";
import EventFormWithIndemnity from "@/components/events/EventFormWithIndemnity";
import { ORGANISER_ROLES, type Category, type UserRole } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function InterceptedNewEventPanel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  const isVendor = ORGANISER_ROLES.includes(role as UserRole);

  // Citizen spam-guard pre-check — same logic as /events/new/page.tsx.
  let citizenQuotaExhausted = false;
  let citizenNextAllowedAt: string | null = null;
  if (role === "citizen") {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recent } = await supabase
      .from("events")
      .select("created_at")
      .eq("created_by", user.id)
      .eq("community_contributor", true)
      .eq("visibility", "public")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recent && recent.length > 0) {
      citizenQuotaExhausted = true;
      const lastAt = new Date(recent[0].created_at).getTime();
      citizenNextAllowedAt = new Date(
        lastAt + 30 * 24 * 60 * 60 * 1000,
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  let placeCategories: Category[] = [];
  if (isVendor) {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .in("applies_to", ["places", "both"])
      .order("sort_order")
      .returns<Category[]>();
    placeCategories = data ?? [];
  }

  return (
    <SidePanel title="Create Event" fallbackHref="/events">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-5 py-6 space-y-4">
          {citizenQuotaExhausted && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
              <h2 className="text-sm font-semibold text-black">
                Monthly community event used
              </h2>
              <p className="mt-1 text-xs text-black/70">
                Citizens can publish one public community event every 30 days.
                {citizenNextAllowedAt
                  ? ` Try again after ${citizenNextAllowedAt}.`
                  : " Try again in a few weeks."}
              </p>
              <p className="mt-1.5 text-xs text-black/70">
                Run events regularly?{" "}
                <Link
                  href="/contributor/apply"
                  className="font-medium text-(--gold) underline hover:opacity-80"
                >
                  Apply to become a Contributor
                </Link>
                .
              </p>
            </div>
          )}
          <EventFormWithIndemnity
            isVendor={isVendor}
            placeCategories={placeCategories}
          />
        </div>
      </div>
    </SidePanel>
  );
}
