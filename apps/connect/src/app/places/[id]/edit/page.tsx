import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import EditPlaceForm from "@/components/places/EditPlaceForm";
import Link from "next/link";
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
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-6">
      <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">
        <Link
          href={`/places/${id}`}
          className="mb-4 inline-block text-sm text-black/60 hover:text-black"
        >
          ← Back to place
        </Link>
        <EditPlaceForm place={place} categories={categoriesRes.data ?? []} />
      </div>
    </div>
  );
}
