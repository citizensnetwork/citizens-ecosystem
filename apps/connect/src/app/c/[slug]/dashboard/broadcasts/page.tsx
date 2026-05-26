// /c/[slug]/dashboard/broadcasts/page.tsx — Broadcasts hub.
//
// Two modes:
//   • Directory (no query params): lists the contributor's owned events +
//     places with a "Broadcast" CTA on each.
//   • Entity context (?entity_type=event|place&entity_id=<uuid>): renders
//     the composer + recent broadcast history for that entity.
//
// Auth + admin-on-behalf is enforced by the dashboard layout. The composer
// itself re-checks via the API route (checkDashboardAccess) so opening the
// page with hand-crafted query params can never let an admin without an
// active session post.

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import { isValidUUID } from "@/lib/validation";
import BroadcastsDashboardClient from "@/components/contributor/dashboard/BroadcastsDashboardClient";

export const dynamic = "force-dynamic";

interface BroadcastRow {
  id: string;
  body: string;
  created_at: string;
}

interface EntityRef {
  id: string;
  name: string;
  type: "event" | "place";
}

export default async function BroadcastsDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ entity_type?: string; entity_id?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/broadcasts`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  // Owned entities — the directory + the entity-name lookup share the same
  // query so a hand-crafted ?entity_id can't reference a row the contributor
  // doesn't own (it simply won't be found in this list).
  const [eventsRes, placesRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, date")
      .eq("created_by", contributor.id)
      .order("date", { ascending: false })
      .limit(100),
    supabase
      .from("places")
      .select("id, name")
      .eq("created_by", contributor.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const events: EntityRef[] = (eventsRes.data ?? []).map((e) => ({
    id: e.id as string,
    name: (e.title as string) ?? "(untitled)",
    type: "event",
  }));
  const places: EntityRef[] = (placesRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "(unnamed)",
    type: "place",
  }));

  // Validate query params. An invalid uuid or type silently falls back to
  // the directory view — never throw on user-controlled input.
  const entityType =
    sp.entity_type === "event" || sp.entity_type === "place" ? sp.entity_type : null;
  const entityId = sp.entity_id && isValidUUID(sp.entity_id) ? sp.entity_id : null;

  let initialEntity: EntityRef | null = null;
  let initialHistory: BroadcastRow[] = [];

  if (entityType && entityId) {
    const found =
      entityType === "event"
        ? events.find((e) => e.id === entityId)
        : places.find((p) => p.id === entityId);
    if (found) {
      initialEntity = found;
      const { data: history } = await supabase
        .from("broadcast_messages")
        .select("id, body, created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      initialHistory = (history ?? []) as BroadcastRow[];
    }
  }

  // Per-entity broadcast counts for the directory view. One query, then
  // bucket client-side — cheaper than two grouped queries on a small table.
  const ownedIds = [...events, ...places].map((e) => e.id);
  const counts = new Map<string, number>();
  if (ownedIds.length > 0) {
    const { data: countRows } = await supabase
      .from("broadcast_messages")
      .select("entity_id")
      .eq("contributor_id", contributor.id)
      .is("deleted_at", null);
    for (const row of (countRows ?? []) as Array<{ entity_id: string }>) {
      counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
    }
  }

  return (
    <BroadcastsDashboardClient
      slug={slug}
      events={events.map((e) => ({ ...e, broadcastCount: counts.get(e.id) ?? 0 }))}
      places={places.map((p) => ({ ...p, broadcastCount: counts.get(p.id) ?? 0 }))}
      initialEntity={initialEntity}
      initialHistory={initialHistory}
    />
  );
}
