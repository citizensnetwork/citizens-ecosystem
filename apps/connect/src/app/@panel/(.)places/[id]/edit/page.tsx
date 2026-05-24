// Intercepted route — when navigating to /places/[id]/edit via a client-side
// transition from the place detail panel, render the edit form inside the same
// right-side drawer instead of opening a full-screen page.
// Direct loads and refreshes fall through to /places/[id]/edit/page.tsx.

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import SidePanel from "@/components/ui/SidePanel";
import EditPlaceForm from "@/components/places/EditPlaceForm";
import { isAdmin as profileIsAdmin } from "@/lib/profiles/capabilities";
import type { Place, Category, PlaceMedia } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function InterceptedEditPlacePanel({
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

  const [placeRes, profileRes, categoriesRes, mediaRes] = await Promise.all([
    supabase
      .from("places")
      .select("*, categories(*)")
      .eq("id", id)
      .maybeSingle<Place>(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("categories")
      .select("*")
      .in("applies_to", ["places", "both"])
      .order("sort_order")
      .returns<Category[]>(),
    supabase
      .from("place_media")
      .select("*")
      .eq("place_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<PlaceMedia[]>(),
  ]);

  const place = placeRes.data;
  if (!place) {
    notFound();
  }

  const isOwner = user.id === place.created_by;
  const isAdmin = profileIsAdmin(profileRes.data);

  if (!isOwner && !isAdmin) {
    redirect(`/places/${id}`);
  }

  return (
    <SidePanel title={`Edit — ${place.name}`} fallbackHref={`/places/${id}`}>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-6">
          <EditPlaceForm
            place={place}
            categories={categoriesRes.data ?? []}
            media={mediaRes.data ?? []}
          />
        </div>
      </div>
    </SidePanel>
  );
}
