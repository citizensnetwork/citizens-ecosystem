import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import EditEventForm from "@/components/events/EditEventForm";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <>
      <PageHeader
        title="Edit Event"
        subtitle={event.title}
        fallbackHref={`/events/${id}`}
      />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">
          <EditEventForm event={event} />
        </div>
      </div>
    </>
  );
}
