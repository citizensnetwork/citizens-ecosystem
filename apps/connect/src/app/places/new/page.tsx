import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlaceForm from "@/components/places/PlaceForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ORGANISER_ROLES, type Category, type UserRole } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NewPlacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Only organiser roles and admins can add places directly
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!ORGANISER_ROLES.includes(profile?.role as UserRole)) {
    redirect("/events");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("applies_to", ["places", "both"])
    .order("sort_order")
    .returns<Category[]>();

  return (
    <>
      <PageHeader title="Add a Place" fallbackHref="/events" />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel mx-auto w-full max-w-2xl px-6 py-8 sm:px-8">
          <PlaceForm categories={categories ?? []} />
        </div>
      </div>
    </>
  );
}
