import { createClient } from "@/lib/supabase/server";
import LandingPage from "@/components/ui/LandingPage";
import type { Event, Place } from "@/types/db";

export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();

  const now = new Date().toISOString();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const cutoff = sixMonths.toISOString();

  const [{ data: rawEvents }, { data: places }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("date", now)
      .lte("date", cutoff)
      .order("date", { ascending: true })
      .returns<Event[]>(),
    supabase
      .from("places")
      .select("*, categories(*)")
      .order("name")
      .returns<Place[]>(),
  ]);

  // Landing page only shows public events
  const events = (rawEvents ?? []).filter((e) => e.visibility !== "private");

  return <LandingPage events={events} places={places ?? []} />;
}


