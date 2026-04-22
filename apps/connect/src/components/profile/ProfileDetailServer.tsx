// Server component that fetches and renders the public profile body
// (contributor or standard) without page chrome. Shared by the
// standalone `/profile/[id]` page and the intercepted
// `@panel/(.)profile/[id]` drawer.
//
// `cache()` wraps the profile fetch so if Next.js renders both slots
// in the same request (standalone page + drawer), we share one
// DB round-trip instead of two.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FollowButton from "@/components/social/FollowButton";
import MessageButton from "@/components/messaging/MessageButton";
import { ContributorPublicProfile } from "@/components/contributor/ContributorPublicProfile";
import type { Event, Profile, UserRole } from "@/types/db";
import { ORGANISER_ROLES, getRoleDisplayLabel } from "@/types/db";

export const getProfileById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<Profile>();
  return data;
});

export default async function ProfileDetailServer({ id }: { id: string }) {
  const supabase = await createClient();

  const profile = await getProfileById(id);

  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Note: viewing-own-profile redirect is handled by the page-level
  // wrapper so the shared server component can safely render in both
  // the standalone page and the side-drawer interception.

  const [
    { count: followersCount },
    { count: followingCount },
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

  // Derive follow/friend state from the follow lists we already have —
  // avoids two extra single-row queries.
  const myFollowingIds = new Set(
    (myFollowingResult.data ?? []).map((f) => f.followee_id),
  );
  const theirFollowingIds = new Set(
    (theirFollowingResult.data ?? []).map((f) => f.followee_id),
  );
  const isFollowing = !!user && myFollowingIds.has(id);
  const isFriend = isFollowing && theirFollowingIds.has(user!.id);

  let mutualFriendsCount = 0;
  if (user && myFollowingResult.data && theirFollowingResult.data) {
    mutualFriendsCount = [...theirFollowingIds].filter((fid) =>
      myFollowingIds.has(fid),
    ).length;
  }

  const isOrganiser = ORGANISER_ROLES.includes(profile.role as UserRole);
  const displayName = profile.full_name || profile.email;

  // Contributor branch — richer public profile.
  if (
    profile.role === "contributor" &&
    profile.contributor_status === "approved"
  ) {
    const now = new Date().toISOString();
    const allEvents = createdEvents ?? [];
    const upcoming = allEvents.filter((e) => e.date >= now);
    const past = allEvents.filter((e) => e.date < now).reverse();

    let pastWithRatings: Array<
      Event & { avg_rating?: number | null; reviews_count?: number }
    > = past;
    if (past.length > 0) {
      const { data: reviewRows } = await supabase
        .from("reviews")
        .select("event_id, rating")
        .in(
          "event_id",
          past.map((e) => e.id),
        );
      const byEvent = new Map<string, number[]>();
      for (const r of reviewRows ?? []) {
        const key = r.event_id as string;
        if (!byEvent.has(key)) byEvent.set(key, []);
        byEvent.get(key)!.push(r.rating as number);
      }
      pastWithRatings = past.map((e) => {
        const arr = byEvent.get(e.id);
        if (!arr || arr.length === 0) return e;
        const avg = arr.reduce((s, n) => s + n, 0) / arr.length;
        return { ...e, avg_rating: avg, reviews_count: arr.length };
      });
    }

    return (
      <ContributorPublicProfile
        profile={profile}
        viewer={user ? { id: user.id } : null}
        isFollowing={isFollowing}
        isFriend={isFriend}
        followersCount={followersCount ?? 0}
        followingCount={followingCount ?? 0}
        upcomingEvents={upcoming}
        pastEvents={pastWithRatings}
      />
    );
  }

  // Standard profile body.
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
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
            {getRoleDisplayLabel(
              (profile.role as UserRole) ?? "citizen",
              profile.contributor_kind ?? null,
            )}
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
            {mutualFriendsCount > 0 && (
              <span>
                <strong className="text-black">{mutualFriendsCount}</strong>{" "}
                mutual
              </span>
            )}
          </div>

          {isFriend && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-(--gold-soft) px-2.5 py-0.5 text-xs font-semibold text-black">
              ✨ Friends
            </span>
          )}
        </div>

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

      {(createdEvents ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">
            Events by {profile.full_name?.split(" ")[0] ?? "this user"}
          </h2>
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
