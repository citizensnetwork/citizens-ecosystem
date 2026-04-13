import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ManageEventsView from "@/components/events/ManageEventsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manage Events — Citizens Connect",
};

export default async function ManageEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // All authenticated users can manage their own events
  const isVendor = true;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage Events</h1>
      <ManageEventsView isVendor={isVendor} />
    </div>
  );
}
