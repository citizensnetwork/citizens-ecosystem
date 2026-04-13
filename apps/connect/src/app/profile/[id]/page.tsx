import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/messaging/MessageButton";
import type { Event, Profile, UserRole } from "@/types/db";
import { ORGANISER_ROLES, ROLE_LABELS } from "@/types/db";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", id)
    .single();

  if (!profile) return { title: "Profile Not Found" };

  return {
    title: `${profile.full_name} — Citizens Connect`,
    description: `${profile.full_name}'s profile on Citizens Connect.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single<Profile>();

  if (!profile) notFound();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If viewing own profile, redirect to /profile
  if (user?.id === id) {
    redirect("/profile");
  }

  // Fetch social counts + follow state + mutual friends data in parallel
  const [
    { count: followersCount },
    { count: followingCount },
    currentUserFollows,
    theyFollowBack,
    { data: createdEvents },
    myFollowingResult,
    theirFollowingResult,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", id),
    user
      ? supabase
          .from("follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("followee_id", id)
          .single()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("follows")
          .select("id")
          .eq("follower_id", id)
          .eq("followee_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("events")
      .select("*")
      .eq("created_by", id)
      .eq("status", "published")
      .order("date", { ascending: true })
      .returns<Event[]>(),
    user
      ? supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", user.id)
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", id)
      : Promise.resolve({ data: null }),
  ]);

  const isFollowing = !!currentUserFollows.data;
  const isFriend = isFollowing && !!theyFollowBack.data;

  // Compute mutual friends from parallel-fetched data
  let mutualFriendsCount = 0;
  if (myFollowingResult.data && theirFollowingResult.data) {
    const mySet = new Set(myFollowingResult.data.map((f) => f.followee_id));
    mutualFriendsCount = theirFollowingResult.data.filter((f) =>
      mySet.has(f.followee_id)
    ).length;
  }

  const isOrganiser = ORGANISER_ROLES.includes(profile.role as UserRole);
  const displayName = profile.full_name || profile.email;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-(--gold-soft) text-2xl font-bold uppercase text-black">
          {(displayName as string)?.[0] ?? "?"}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              isOrganiser
                ? "bg-(--gold-soft) text-black"
                : "bg-black/5 text-black/70"
            }`}
          >
            {ROLE_LABELS[(profile.role as UserRole) ?? "individual"] ?? "Community Citizen"}
          </span>

          {/* Social counts */}
          <div className="mt-2 flex gap-4 text-sm text-black/70">
            <span>
              <strong className="text-black">{followersCount ?? 0}</strong>{" "}
              {followersCount === 1 ? "follower" : "followers"}
            </span>
            <span>
              <strong className="text-black">{followingCount ?? 0}</strong>{" "}
              following
            </span>
            {mutualFriendsCount > 0 && (
              <span>
                <strong className="text-black">{mutualFriendsCount}</strong>{" "}
                mutual
              </span>
            )}
          </div>

          {/* Friend badge */}
          {isFriend && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-(--gold-soft) px-2.5 py-0.5 text-xs font-semibold text-black">
              ✨ Friends
            </span>
          )}
        </div>

        {/* Follow + Message buttons */}
        {user && (
          <div className="flex items-center gap-2">
            <MessageButton
              recipientId={id}
              recipientName={profile.full_name}
              variant="icon"
            />
            <FollowButton
              followeeId={id}
              isFollowing={isFollowing}
              isFriend={isFriend}
            />
          </div>
        )}
      </div>

      {/* Events created by this user */}
      {(createdEvents ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">
            Events by {profile.full_name?.split(" ")[0] ?? "this user"}
          </h2>
          {(createdEvents ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No published events yet.</p>
          ) : (
            <ul className="space-y-2">
              {(createdEvents ?? []).map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 transition-shadow hover:shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium">{e.title}</p>
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
                    <span className="text-sm text-(--gold)">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!user && (
        <div className="mt-8 rounded-xl border border-black/10 bg-black/3 px-4 py-3 text-center text-sm text-black/70">
          <Link
            href="/login"
            className="font-semibold text-(--gold) hover:underline"
          >
            Log in
          </Link>{" "}
          to follow {profile.full_name?.split(" ")[0] ?? "this person"} and
          connect.
        </div>
      )}
    </div>
  );
}
