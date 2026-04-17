import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EventFormWithIndemnity from "@/components/events/EventFormWithIndemnity";
import { ORGANISER_ROLES, type Category, type UserRole } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
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

  const isVendor = ORGANISER_ROLES.includes(profile?.role as UserRole);

  // Fetch place categories for organiser place-booking section
  let placeCategories: Category[] = [];
  if (isVendor) {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .in("applies_to", ["places", "both"])
      .order("sort_order")
      .returns<Category[]>();
    placeCategories = data ?? [];
  }

  return (
    <div className="map-bg min-h-[calc(100dvh-3.5rem)] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="glass-panel px-5 py-6 sm:px-7 sm:py-7">
          <EventFormWithIndemnity isVendor={isVendor} placeCategories={placeCategories} />
        </div>
      </div>
    </div>
  );
}
