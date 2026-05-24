// Intercepted route — when navigating to /events/[id]/edit via a client-side
// transition from the event detail panel, render the edit form inside the same
// right-side drawer instead of opening a full-screen page beneath the panel.
// Direct loads and refreshes fall through to /events/[id]/edit/page.tsx.

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import SidePanel from "@/components/ui/SidePanel";
import EditEventForm from "@/components/events/EditEventForm";
import { isAdmin as profileIsAdmin } from "@/lib/profiles/capabilities";
import type { Event } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function InterceptedEditEventPanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle<Event>();

  if (!event) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isOwner = user.id === event.created_by;
  const isAdmin = profileIsAdmin(profile);

  if (!isOwner && !isAdmin) {
    redirect(`/events/${id}`);
  }

  return (
    <SidePanel title={`Edit — ${event.title}`} fallbackHref={`/events/${id}`}>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-6">
          <EditEventForm event={event} />
        </div>
      </div>
    </SidePanel>
  );
}
