import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlaceForm from "@/components/places/PlaceForm";
import type { Category } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NewPlacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("applies_to", ["places", "both"])
    .order("sort_order")
    .returns<Category[]>();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PlaceForm categories={categories ?? []} />
    </div>
  );
}
