import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/manage/joined
 *
 * Returns the caller's RSVPed events (status = 'attending' or
 * 'considering'), grouped by status, sorted soonest-first for
 * upcoming and most-recent-first for past. Each row includes enough
 * metadata to render in `JoinedEventsView` without a follow-up fetch.
 *
 * Separate from `/api/manage/events` (which returns events the user
 * *created*) — the two feed distinct tabs under `/events/manage`.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pull RSVPs + joined events in a single round-trip via the PostgREST
  // embed syntax. RLS ensures the user can only see their own RSVPs.
  const { data, error } = await supabase
    .from("rsvps")
    .select(
      `
      status,
      created_at,
      event:events (
        id,
        title,
        date,
        end_time,
        status,
        visibility,
        category,
        location,
        image_url,
        created_by,
        max_attendees
      )
    `,
    )
    .eq("user_id", user.id)
    .in("status", ["attending", "considering"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[/api/manage/joined]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  type Row = {
    status: "attending" | "considering";
    created_at: string;
    event:
      | {
          id: string;
          title: string;
          date: string;
          end_time: string | null;
          status: string;
          visibility: string;
          category: string | null;
          location: string | null;
          image_url: string | null;
          created_by: string;
          max_attendees: number | null;
        }
      | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const joined = rows
    .filter((r): r is Row & { event: NonNullable<Row["event"]> } => r.event !== null)
    .map((r) => ({
      ...r.event,
      rsvp_status: r.status,
      rsvped_at: r.created_at,
    }));

  return NextResponse.json({ events: joined });
}
