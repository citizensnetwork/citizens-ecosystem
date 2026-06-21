import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ConnectEventList } from "@/components/connect/ConnectEventList";
import { ConnectPlaceList } from "@/components/connect/ConnectPlaceList";
import { LinkConnectAccount } from "@/components/connect/LinkConnectAccount";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import {
  getOrgConnectContributorId,
  listOrgConnectEvents,
  listOrgConnectPlaces,
} from "@/lib/connect/feed";

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

  const connectContributorId = await getOrgConnectContributorId(supabase, org.id);

  const header = (
    <h1 className="text-2xl font-semibold text-text-primary">
      Citizens Connect
    </h1>
  );

  // Not linked yet — the org must connect its Citizens Connect contributor first.
  if (!connectContributorId) {
    return (
      <div className="space-y-6">
        {header}
        <LinkConnectAccount orgId={org.id} />
      </div>
    );
  }

  const tab = filters.tab ?? "events";
  const page = Math.max(1, parseInt(filters.page ?? "1", 10));

  let events: Awaited<ReturnType<typeof listOrgConnectEvents>>["events"] = [];
  let eventsTotal = 0;
  let places: Awaited<ReturnType<typeof listOrgConnectPlaces>>["places"] = [];
  let placesTotal = 0;

  if (tab === "events") {
    ({ events, total: eventsTotal } = await listOrgConnectEvents(supabase, {
      orgId: org.id,
      connectContributorId,
      page,
      perPage: ITEMS_PER_PAGE,
    }));
  } else {
    ({ places, total: placesTotal } = await listOrgConnectPlaces(supabase, {
      orgId: org.id,
      connectContributorId,
      page,
      perPage: ITEMS_PER_PAGE,
    }));
  }

  return (
    <div className="space-y-6">
      {header}

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
            initialEvents={events}
            orgId={org.id}
            orgSlug={orgSlug}
            total={eventsTotal}
            page={page}
            perPage={ITEMS_PER_PAGE}
          />
        ) : (
          <ConnectPlaceList
            initialPlaces={places}
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
