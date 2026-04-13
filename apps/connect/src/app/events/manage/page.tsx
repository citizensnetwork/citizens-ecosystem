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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isVendor = profile?.role === "vendor" || profile?.role === "admin";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage Events</h1>
      <ManageEventsView isVendor={isVendor} />
    </div>
  );
}
