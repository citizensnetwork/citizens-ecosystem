// /c/[slug]/dashboard/places/page.tsx

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import PlacesDashboardClient from "@/components/contributor/dashboard/PlacesDashboardClient";

export const dynamic = "force-dynamic";

export default async function PlacesDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/places`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const { data: places } = await supabase
    .from("places")
    .select(
      "id, name, category, address, lat, lng, image_url, status, created_at, place_follows(count)"
    )
    .eq("created_by", contributor.id)
    .order("created_at", { ascending: false });

  return <PlacesDashboardClient slug={slug} places={places ?? []} />;
}
