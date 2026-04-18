import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SyncStatusPanel } from "@/components/connect/SyncStatusPanel";

interface SyncPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function SyncPage({ params }: SyncPageProps) {
  const { orgSlug } = await params;
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

  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org.id)
    .single();

  const canTrigger =
    !!membership && ["org_admin", "org_manager"].includes(membership.role);

  // Fetch sync logs
  const { data: logs } = await supabase
    .from("cc_sync_log")
    .select("*")
    .eq("org_id", org.id)
    .order("started_at", { ascending: false })
    .limit(20);

  // Fetch claimed stats
  const [eventsResult, placesResult] = await Promise.all([
    supabase
      .from("cc_events_mirror")
      .select("cc_event_id", { count: "exact", head: true })
      .eq("cv_org_id", org.id),
    supabase
      .from("cc_places_mirror")
      .select("cc_place_id", { count: "exact", head: true })
      .eq("cv_org_id", org.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Sync Status</h1>
      <SyncStatusPanel
        logs={logs ?? []}
        orgId={org.id}
        canTrigger={canTrigger}
        stats={{
          claimed_events: eventsResult.count ?? 0,
          claimed_places: placesResult.count ?? 0,
          last_sync: logs?.[0] ?? null,
        }}
      />
    </div>
  );
}
