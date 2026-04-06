import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Event, Profile, InterestGroupWithItems } from "@/types/db";
import ProfileEditor from "@/components/auth/ProfileEditor";
import ProfileInterests from "@/components/onboarding/ProfileInterests";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch profile, RSVPs, social counts, following list, and interests in parallel
  const [
    { data: profile },
    { data: rsvps },
    { count: followersCount },
    { count: followingCount },
    { data: myFollowing },
    { data: interestGroups },
    { data: allInterests },
    { data: userInterests },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("rsvps")
      .select("event_id, events(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id),
    supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", user.id),
    supabase
      .from("interest_groups")
      .select("*")
      .order("sort_order"),
    supabase
      .from("interests")
      .select("*")
      .order("sort_order"),
    supabase
      .from("user_interests")
      .select("interest_id")
      .eq("user_id", user.id),
  ]);

  // Count friends (bidirectional follows)
  let friendsCount = 0;
  const followeeIds = (myFollowing ?? []).map((f) => f.followee_id);
  if (followeeIds.length > 0) {
    const { count } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id)
      .in("follower_id", followeeIds);
    friendsCount = count ?? 0;
  }

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

  const typedProfile: Profile = {
    id: profile?.id ?? user.id,
    email: profile?.email ?? user.email ?? "",
    role: profile?.role ?? "client",
    full_name: profile?.full_name ?? "",
    avatar_url: profile?.avatar_url ?? null,
    onboarding_completed: profile?.onboarding_completed ?? false,
    notification_email: profile?.notification_email ?? null,
    home_latitude: profile?.home_latitude ?? null,
    home_longitude: profile?.home_longitude ?? null,
    notification_radius_km: profile?.notification_radius_km ?? 50,
    created_at: profile?.created_at ?? "",
  };

  // Build interest groups with items
  const groups: InterestGroupWithItems[] = (interestGroups ?? []).map((g) => ({
    ...g,
    interests: (allInterests ?? []).filter((i) => i.group_id === g.id),
  }));

  const selectedInterestIds = (userInterests ?? []).map((ui) => ui.interest_id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        {typedProfile.avatar_url ? (
          <Image
            src={typedProfile.avatar_url}
            alt="Profile photo"
            width={64}
            height={64}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-black/10"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-(--gold-soft) text-black flex items-center justify-center text-2xl font-bold uppercase">
            {(displayName as string)?.[0] ?? "?"}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${
              isVendor
                ? "bg-(--gold-soft) text-black"
                : "bg-black/5 text-black/70"
            }`}
          >
            {isVendor ? "Organiser" : "Community Citizen"}
          </span>
          <div className="mt-2 flex gap-4 text-sm text-black/70">
            <span>
              <strong className="text-black">{followersCount ?? 0}</strong>{" "}
              {followersCount === 1 ? "follower" : "followers"}
            </span>
            <span>
              <strong className="text-black">{followingCount ?? 0}</strong>{" "}
              following
            </span>
            {friendsCount > 0 && (
              <span>
                <strong className="text-black">{friendsCount}</strong>{" "}
                {friendsCount === 1 ? "friend" : "friends"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Profile Editor (avatar, name, password) ─── */}
      <section className="mb-8 rounded-xl border border-black/8 bg-white p-5">
        <h2 className="text-lg font-semibold mb-4">Account Settings</h2>
        <ProfileEditor profile={typedProfile} email={user.email ?? ""} />
      </section>

      {/* ── Interests & Location ─── */}
      <ProfileInterests
        groups={groups}
        selectedInterestIds={selectedInterestIds}
        homeLatitude={typedProfile.home_latitude}
        homeLongitude={typedProfile.home_longitude}
        notificationRadiusKm={typedProfile.notification_radius_km}
        notificationEmail={typedProfile.notification_email}
      />

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">My RSVPs</h2>
        {rsvpedEvents.length === 0 ? (
          <p className="text-sm text-gray-500">
            You haven&apos;t RSVPed to any events yet.{" "}
            <Link href="/events" className="text-(--gold) hover:underline">
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
                  <span className="text-(--gold) text-sm">→</span>
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
              className="text-sm bg-(--gold) text-black px-3 py-1.5 rounded-md hover:brightness-95"
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
                    <span className="text-(--gold) text-sm">→</span>
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
