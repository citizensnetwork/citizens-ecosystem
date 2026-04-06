import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import EditEventForm from "@/components/events/EditEventForm";
import type { Event } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
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
    .single<Event>();

  if (!event) {
    notFound();
  }

  // Only owner or admin can edit
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (event.created_by !== user.id && profile?.role !== "admin") {
    redirect(`/events/${id}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <EditEventForm event={event} />
    </div>
  );
}
