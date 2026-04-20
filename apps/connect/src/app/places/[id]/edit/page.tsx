import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import EditPlaceForm from "@/components/places/EditPlaceForm";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Place, Category } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EditPlacePage({
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

  const [placeRes, profileRes, categoriesRes] = await Promise.all([
    supabase
      .from("places")
      .select("*, categories(*)")
      .eq("id", id)
      .single<Place>(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("categories")
      .select("*")
      .in("applies_to", ["places", "both"])
      .order("sort_order")
      .returns<Category[]>(),
  ]);

  const place = placeRes.data;
  if (!place) {
    notFound();
  }

  const isOwner = user.id === place.created_by;
  const isAdmin = profileRes.data?.role === "admin";

  if (!isOwner && !isAdmin) {
    redirect(`/places/${id}`);
  }

  return (
    <>
      <PageHeader
        title="Edit Place"
        subtitle={place.name}
        fallbackHref={`/places/${id}`}
      />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">
          <EditPlaceForm place={place} categories={categoriesRes.data ?? []} />
        </div>
      </div>
    </>
  );
}
