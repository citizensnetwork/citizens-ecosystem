import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import EventFormWithIndemnity from "@/components/events/EventFormWithIndemnity";
import MapBackdropLazy from "@/components/map/MapBackdropLazy";
import { ORGANISER_ROLES, type Category, type UserRole } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
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
    .single();

  const role = profile?.role as UserRole | undefined;
  const isVendor = ORGANISER_ROLES.includes(role as UserRole);

  // Citizen spam-guard pre-check — migration 037 enforces "at most one
  // public community_contributor=true event per 30 days" via a DB
  // trigger. We query the same window here so we can show a friendly
  // banner before the form instead of surfacing a SQL exception on
  // submit. This is UX-only; the authoritative check lives in the DB.
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

  // Fetch place categories for organiser place-booking section
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
    <div className="map-bg relative min-h-[calc(100dvh-3.5rem)] px-4 py-6 sm:py-10">
      {/* Decorative live-map backdrop — behind the glass panel, non-interactive. */}
      <MapBackdropLazy />
      <div className="relative mx-auto w-full max-w-2xl">
        {citizenQuotaExhausted && (
          <div className="glass-panel mb-4 border border-(--gold)/40 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-black">
              You&apos;ve used your monthly community event
            </h2>
            <p className="mt-1 text-sm text-black/70">
              As a Citizen you can publish one public community event every 30
              days. You can try again
              {citizenNextAllowedAt ? ` after ${citizenNextAllowedAt}` : " in a few weeks"}.
            </p>
            <p className="mt-2 text-sm text-black/70">
              Run events regularly? {" "}
              <Link
                href="/contributor/apply"
                className="font-medium text-(--gold) underline hover:opacity-80"
              >
                Apply to become a Contributor
              </Link>{" "}
              to publish without monthly limits.
            </p>
          </div>
        )}
        <div className="glass-panel px-5 py-6 sm:px-7 sm:py-7">
          <EventFormWithIndemnity isVendor={isVendor} placeCategories={placeCategories} />
        </div>
      </div>
    </div>
  );
}

