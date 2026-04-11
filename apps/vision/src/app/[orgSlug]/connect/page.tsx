import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ConnectEventList } from "@/components/connect/ConnectEventList";
import { ConnectPlaceList } from "@/components/connect/ConnectPlaceList";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { ITEMS_PER_PAGE } from "@/lib/constants";

interface ConnectPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ConnectPage({
  params,
  searchParams,
}: ConnectPageProps) {
  const { orgSlug } = await params;
  const filters = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  const tab = filters.tab ?? "events";
  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * ITEMS_PER_PAGE;

  let events: unknown[] = [];
  let eventsTotal = 0;
  let places: unknown[] = [];
  let placesTotal = 0;

  if (tab === "events") {
    const { data, count } = await supabase
      .from("cc_events_mirror")
      .select("*", { count: "exact" })
      .or(`cv_org_id.is.null,cv_org_id.eq.${org.id}`)
      .order("date", { ascending: false, nullsFirst: false })
      .range(from, from + ITEMS_PER_PAGE - 1);

    events = data ?? [];
    eventsTotal = count ?? 0;
  } else {
    const { data, count } = await supabase
      .from("cc_places_mirror")
      .select("*", { count: "exact" })
      .or(`cv_org_id.is.null,cv_org_id.eq.${org.id}`)
      .order("synced_at", { ascending: false })
      .range(from, from + ITEMS_PER_PAGE - 1);

    places = data ?? [];
    placesTotal = count ?? 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          Citizens Connect
        </h1>
        <Link
          href={`/${orgSlug}/connect/sync`}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt"
        >
          Sync Status
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <Link
          href={`/${orgSlug}/connect?tab=events`}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "events"
              ? "border-accent text-accent"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Events
        </Link>
        <Link
          href={`/${orgSlug}/connect?tab=places`}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "places"
              ? "border-accent text-accent"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Places
        </Link>
      </div>

      <Suspense fallback={<LoadingSkeleton className="h-48 w-full" />}>
        {tab === "events" ? (
          <ConnectEventList
            initialEvents={events as Parameters<typeof ConnectEventList>[0]["initialEvents"]}
            orgId={org.id}
            orgSlug={orgSlug}
            total={eventsTotal}
            page={page}
            perPage={ITEMS_PER_PAGE}
          />
        ) : (
          <ConnectPlaceList
            initialPlaces={places as Parameters<typeof ConnectPlaceList>[0]["initialPlaces"]}
            orgId={org.id}
            orgSlug={orgSlug}
            total={placesTotal}
            page={page}
            perPage={ITEMS_PER_PAGE}
          />
        )}
      </Suspense>
    </div>
  );
}
