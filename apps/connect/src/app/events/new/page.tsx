import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EventForm from "@/components/events/EventForm";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user is a vendor
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "vendor") {
    redirect("/events");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <EventForm />
    </div>
  );
}
