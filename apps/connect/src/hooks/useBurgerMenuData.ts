"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Event,
  TrendingEvent,
  FavouriteOrg,
  FriendAttending,
  FriendConsidering,
  Profile,
} from "@/types/db";

type BurgerMenuData = {
  trending: TrendingEvent[];
  favouriteOrgs: FavouriteOrg[];
  friends: FriendAttending[];
  /** FEAT-04: events friends are currently considering. */
  friendConsiderings: FriendConsidering[];
  /** FEAT-04: events the current user is considering. */
  userConsidering: Event[];
  /** FEAT-04: events for which the current user has been convinced by ≥1 friend. */
  incomingConvinceEventIds: Set<string>;
  /** FEAT-04: `${eventId}|${toUserId}` keys for convinces the user has already sent. */
  outgoingConvinceKeys: Set<string>;
  profile: Profile | null;
  loading: boolean;
  /** Force re-fetch (e.g. after toggling consider / sending convince). */
  refetch: () => void;
};

/**
 * Lazily fetches social data for the burger menu when the drawer opens.
 * Caches results across open/close cycles and re-fetches on userId change.
 *
 * Optimised: uses trending_events RPC, single-query favourite orgs,
 * and parallelised batches to minimise round-trips.
 *
 * FEAT-04 additions: friends-considering aggregation, current user's
 * considerings, and incoming/outgoing convince state — all powered by
 * the same friendIds list so no extra round-trips for mutuals.
 */
export function useBurgerMenuData(
  userId: string | null,
  isOpen: boolean
): BurgerMenuData {
  const [trending, setTrending] = useState<TrendingEvent[]>([]);
  const [favouriteOrgs, setFavouriteOrgs] = useState<FavouriteOrg[]>([]);
  const [friends, setFriends] = useState<FriendAttending[]>([]);
  const [friendConsiderings, setFriendConsiderings] = useState<FriendConsidering[]>([]);
  const [userConsidering, setUserConsidering] = useState<Event[]>([]);
  const [incomingConvinceEventIds, setIncomingConvinceEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [outgoingConvinceKeys, setOutgoingConvinceKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchedForRef = useRef<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();

  const fetchData = useCallback(async () => {
    const supabase = supabaseRef.current!;
    const now = new Date().toISOString();
    setLoading(true);

    try {
      // ── Trending: server-side aggregation via RPC ──
      const trendingPromise = (async () => {
        const { data: topRows } = await supabase.rpc("trending_events", { lim: 5 });
        if (!topRows || topRows.length === 0) return [] as TrendingEvent[];

        const topIds = topRows.map((r: { event_id: string }) => r.event_id);
        const countMap = new Map(
          topRows.map((r: { event_id: string; rsvp_count: number }) => [r.event_id, r.rsvp_count])
        );

        const { data: topEvents } = await supabase
          .from("events")
          .select("*")
          .in("id", topIds);

        return (topEvents ?? [])
          .map((e: Event) => ({ ...e, rsvp_count: (countMap.get(e.id) as number) ?? 0 }))
          .sort((a: TrendingEvent, b: TrendingEvent) => b.rsvp_count - a.rsvp_count);
      })();

      if (!userId) {
        const trendingResult = await trendingPromise;
        setTrending(trendingResult);
        setFavouriteOrgs([]);
        setFriends([]);
        setFriendConsiderings([]);
        setUserConsidering([]);
        setIncomingConvinceEventIds(new Set());
        setOutgoingConvinceKeys(new Set());
        setProfile(null);
        return;
      }

      const [
        trendingResult,
        profileResult,
        followsResult,
        userRsvpsResult,
        incomingConvincesResult,
        outgoingConvincesResult,
      ] = await Promise.all([
        trendingPromise,
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("follows").select("followee_id").eq("follower_id", userId),
        supabase
          .from("rsvps")
          .select("event_id, status")
          .eq("user_id", userId)
          .eq("status", "considering"),
        supabase
          .from("convinces")
          .select("event_id, from_user_id")
          .eq("to_user_id", userId),
        supabase
          .from("convinces")
          .select("event_id, to_user_id")
          .eq("from_user_id", userId),
      ]);

      setTrending(trendingResult);
      setProfile(profileResult.data as Profile | null);

      const userConsideringEventIds = (userRsvpsResult.data ?? []).map(
        (r: { event_id: string }) => r.event_id,
      );
      if (userConsideringEventIds.length > 0) {
        const { data: ucEvents } = await supabase
          .from("events")
          .select("*")
          .in("id", userConsideringEventIds)
          .eq("status", "published")
          .gte("date", now)
          .order("date", { ascending: true });
        setUserConsidering((ucEvents ?? []) as Event[]);
      } else {
        setUserConsidering([]);
      }

      setIncomingConvinceEventIds(
        new Set(
          (incomingConvincesResult.data ?? []).map(
            (c: { event_id: string }) => c.event_id,
          ),
        ),
      );
      setOutgoingConvinceKeys(
        new Set(
          (outgoingConvincesResult.data ?? []).map(
            (c: { event_id: string; to_user_id: string }) =>
              `${c.event_id}|${c.to_user_id}`,
          ),
        ),
      );

      const followeeIds = (followsResult.data ?? []).map(
        (f: { followee_id: string }) => f.followee_id
      );

      const [vendorProfilesResult, mutualsResult] = await Promise.all([
        followeeIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, full_name, avatar_url, role")
              .in("id", followeeIds)
              .eq("role", "contributor")
          : Promise.resolve({ data: [] as { id: string; full_name: string; avatar_url: string | null; role: string }[] }),
        followeeIds.length > 0
          ? supabase
              .from("follows")
              .select("follower_id")
              .eq("followee_id", userId)
              .in("follower_id", followeeIds)
          : Promise.resolve({ data: [] as { follower_id: string }[] }),
      ]);

      const vendorProfiles = vendorProfilesResult.data ?? [];
      const vendorIds = vendorProfiles.map((vp: { id: string }) => vp.id);

      let allVendorEvents: Event[] = [];
      if (vendorIds.length > 0) {
        const { data: vEvents } = await supabase
          .from("events")
          .select("*")
          .in("created_by", vendorIds)
          .eq("status", "published")
          .gte("date", now)
          .order("date", { ascending: true })
          .limit(50);
        allVendorEvents = (vEvents ?? []) as Event[];
      }

      const orgs: FavouriteOrg[] = vendorProfiles.map(
        (vp: { id: string; full_name: string; avatar_url: string | null }) => ({
          id: vp.id,
          full_name: vp.full_name,
          avatar_url: vp.avatar_url,
          upcoming_events: allVendorEvents
            .filter((e) => e.created_by === vp.id)
            .slice(0, 5),
        })
      );
      setFavouriteOrgs(orgs);

      const friendIds = (mutualsResult.data ?? []).map(
        (m: { follower_id: string }) => m.follower_id
      );

      if (friendIds.length > 0) {
        const [friendProfilesResult, friendRsvpsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", friendIds),
          supabase
            .from("rsvps")
            .select("user_id, event_id, status")
            .in("user_id", friendIds),
        ]);

        const friendRsvps = (friendRsvpsResult.data ?? []) as {
          user_id: string;
          event_id: string;
          status: "attending" | "considering";
        }[];

        const friendEventIds = [...new Set(friendRsvps.map((r) => r.event_id))];

        let allFriendEvents: Event[] = [];
        if (friendEventIds.length > 0) {
          const { data: fEvents } = await supabase
            .from("events")
            .select("*")
            .in("id", friendEventIds)
            .eq("status", "published")
            .gte("date", now);
          allFriendEvents = (fEvents ?? []) as Event[];
        }
        const eventById = new Map<string, Event>(
          allFriendEvents.map((e) => [e.id, e]),
        );
        const friendProfileById = new Map<
          string,
          { id: string; full_name: string; avatar_url: string | null }
        >(
          (friendProfilesResult.data ?? []).map(
            (fp: { id: string; full_name: string; avatar_url: string | null }) => [fp.id, fp],
          ),
        );

        // Friends ATTENDING
        const friendsResult: FriendAttending[] = Array.from(friendProfileById.values()).map(
          (fp) => {
            const theirEventIds = friendRsvps
              .filter((r) => r.user_id === fp.id && r.status === "attending")
              .map((r) => r.event_id);
            return {
              id: fp.id,
              full_name: fp.full_name,
              avatar_url: fp.avatar_url,
              attending_events: theirEventIds
                .map((id) => eventById.get(id))
                .filter((e): e is Event => Boolean(e)),
            };
          },
        );
        setFriends(friendsResult);

        // Friends CONSIDERING (grouped by event)
        const considerByEvent = new Map<
          string,
          { id: string; full_name: string; avatar_url: string | null }[]
        >();
        for (const r of friendRsvps) {
          if (r.status !== "considering") continue;
          const ev = eventById.get(r.event_id);
          if (!ev) continue;
          const friend = friendProfileById.get(r.user_id);
          if (!friend) continue;
          const list = considerByEvent.get(r.event_id) ?? [];
          list.push({
            id: friend.id,
            full_name: friend.full_name,
            avatar_url: friend.avatar_url,
          });
          considerByEvent.set(r.event_id, list);
        }
        const considerings: FriendConsidering[] = Array.from(considerByEvent.entries())
          .map(([eventId, friendList]) => {
            const ev = eventById.get(eventId);
            if (!ev) return null;
            return { event: ev, friends: friendList };
          })
          .filter((x): x is FriendConsidering => x !== null)
          .sort(
            (a, b) =>
              new Date(a.event.date).getTime() - new Date(b.event.date).getTime(),
          );
        setFriendConsiderings(considerings);
      } else {
        setFriends([]);
        setFriendConsiderings([]);
      }
    } catch (err) {
      console.error("Failed to load burger menu data:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const cacheKey = userId ?? "__anon__";
    if (isOpen && fetchedForRef.current !== cacheKey) {
      fetchedForRef.current = cacheKey;
      fetchData();
    }
  }, [isOpen, userId, fetchData]);

  const refetch = useCallback(() => {
    fetchedForRef.current = null;
    fetchData();
  }, [fetchData]);

  return {
    trending,
    favouriteOrgs,
    friends,
    friendConsiderings,
    userConsidering,
    incomingConvinceEventIds,
    outgoingConvinceKeys,
    profile,
    loading,
    refetch,
  };
}
