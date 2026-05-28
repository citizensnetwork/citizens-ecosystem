import { createClient } from "@/lib/supabase/server";
import LandingPage from "@/components/ui/LandingPage";

export const revalidate = 60;

const PRETORIA_BOUNDS = {
  latMin: -26.05,
  latMax: -25.45,
  lngMin: 27.95,
  lngMax: 28.55,
};

export default async function Home() {
  const supabase = await createClient();

  const now = new Date().toISOString();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const cutoff = sixMonths.toISOString();

  const [{ count: pretoriaEventCount }, { count: pretoriaPlaceCount }] = await Promise.all([
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .neq("visibility", "private")
      .gte("date", now)
      .lte("date", cutoff)
      .gte("latitude", PRETORIA_BOUNDS.latMin)
      .lte("latitude", PRETORIA_BOUNDS.latMax)
      .gte("longitude", PRETORIA_BOUNDS.lngMin)
      .lte("longitude", PRETORIA_BOUNDS.lngMax),
    supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .gte("latitude", PRETORIA_BOUNDS.latMin)
      .lte("latitude", PRETORIA_BOUNDS.latMax)
      .gte("longitude", PRETORIA_BOUNDS.lngMin)
      .lte("longitude", PRETORIA_BOUNDS.lngMax),
  ]);

  return (
    <LandingPage
      pretoriaEventCount={pretoriaEventCount ?? 0}
      pretoriaPlaceCount={pretoriaPlaceCount ?? 0}
    />
  );
}


