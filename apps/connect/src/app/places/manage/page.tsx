import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ManagePlacesView from "@/components/places/ManagePlacesView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manage Places — Citizens Connect",
};

export default async function ManagePlacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage Places</h1>
      <ManagePlacesView />
    </div>
  );
}
