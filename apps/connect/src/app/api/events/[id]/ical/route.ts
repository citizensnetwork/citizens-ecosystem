import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateICalString } from "@/lib/calendar";
import type { Event } from "@/types/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single<Event>();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status !== "published") {
    return NextResponse.json(
      { error: "Calendar export not available for this event" },
      { status: 404 }
    );
  }

  const ical = generateICalString(event);
  const filename = `${event.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
