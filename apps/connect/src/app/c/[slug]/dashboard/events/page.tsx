// /c/[slug]/dashboard/events/page.tsx

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import EventsDashboardClient from "@/components/contributor/dashboard/EventsDashboardClient";

export const dynamic = "force-dynamic";

export default async function EventsDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/events`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const { data: events } = await supabase
    .from("events")
    .select(
      "id, title, date, end_date, category, status, image_url, lat, lng, place_id, created_at, rsvps(count)"
    )
    .eq("created_by", contributor.id)
    .order("date", { ascending: false });

  const { data: places } = await supabase
    .from("places")
    .select("id, name")
    .eq("created_by", contributor.id);

  return (
    <EventsDashboardClient
      slug={slug}
      events={events ?? []}
      places={places ?? []}
    />
  );
}
