import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Event } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Get events the user has RSVPed to
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("event_id, events(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rsvpedEvents: Event[] = (rsvps ?? [])
    .map((r: { event_id: string; events: unknown }) => r.events as Event)
    .filter(Boolean);

  // If vendor, get events they created
  const isVendor = profile?.role === "vendor";
  let createdEvents: Event[] = [];
  if (isVendor) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("created_by", user.id)
      .order("date", { ascending: true })
      .returns<Event[]>();
    createdEvents = data ?? [];
  }

  const displayName =
    profile?.full_name || user.user_metadata?.full_name || user.email;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold uppercase">
          {(displayName as string)?.[0] ?? "?"}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${
              isVendor
                ? "bg-purple-100 text-purple-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {isVendor ? "Organiser / Vendor" : "Community Member"}
          </span>
        </div>
      </div>

      {/* RSVPed events */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">My RSVPs</h2>
        {rsvpedEvents.length === 0 ? (
          <p className="text-sm text-gray-500">
            You haven&apos;t RSVPed to any events yet.{" "}
            <Link href="/events" className="text-blue-600 hover:underline">
              Browse events →
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {rsvpedEvents.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="flex items-center justify-between border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                >
                  <div>
                    <p className="font-medium text-sm">{e.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(e.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="text-blue-600 text-sm">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Created events (vendors only) */}
      {isVendor && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">My Events</h2>
            <Link
              href="/events/new"
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
            >
              + New Event
            </Link>
          </div>
          {createdEvents.length === 0 ? (
            <p className="text-sm text-gray-500">
              You haven&apos;t created any events yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {createdEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex items-center justify-between border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <div>
                      <p className="font-medium text-sm">{e.title}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(e.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-blue-600 text-sm">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
