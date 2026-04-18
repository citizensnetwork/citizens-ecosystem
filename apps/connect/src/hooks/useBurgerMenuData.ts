"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Event,
  TrendingEvent,
  FavouriteOrg,
  FriendAttending,
  Profile,
} from "@/types/db";

type BurgerMenuData = {
  trending: TrendingEvent[];
  favouriteOrgs: FavouriteOrg[];
  friends: FriendAttending[];
  profile: Profile | null;
  loading: boolean;
};

/**
 * Lazily fetches social data for the burger menu when the drawer opens.
 * Caches results across open/close cycles and re-fetches on userId change.
 *
 * Optimised: uses trending_events RPC, single-query favourite orgs,
 * and parallelised batches to minimise round-trips.
 */
export function useBurgerMenuData(
  userId: string | null,
  isOpen: boolean
): BurgerMenuData {
  const [trending, setTrending] = useState<TrendingEvent[]>([]);
  const [favouriteOrgs, setFavouriteOrgs] = useState<FavouriteOrg[]>([]);
  const [friends, setFriends] = useState<FriendAttending[]>([]);
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

      // ── Auth-gated sections (run in parallel with trending) ──
      if (!userId) {
        const trendingResult = await trendingPromise;
        setTrending(trendingResult);
        setFavouriteOrgs([]);
        setFriends([]);
        setProfile(null);
        return;
      }

      // Batch 1: profile + follows + trending (all independent)
      const [trendingResult, profileResult, followsResult] = await Promise.all([
        trendingPromise,
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("follows").select("followee_id").eq("follower_id", userId),
      ]);

      setTrending(trendingResult);
      setProfile(profileResult.data as Profile | null);

      const followeeIds = (followsResult.data ?? []).map(
        (f: { followee_id: string }) => f.followee_id
      );

      // Batch 2: contributor profiles + mutual follows (both depend on followeeIds)
      // Surfaces the user's followed contributors as "Favourite Orgs" further
      // down — see migration 033 (role rename: vendor → contributor).
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

      // ── Favourite Orgs: single query for all vendor events (no N+1) ──
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

      // ── Friends: bidirectional follows ──
      const friendIds = (mutualsResult.data ?? []).map(
        (m: { follower_id: string }) => m.follower_id
      );

      if (friendIds.length > 0) {
        // Batch 3: friend profiles + friend RSVPs (independent of each other)
        const [friendProfilesResult, friendRsvpsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", friendIds),
          supabase
            .from("rsvps")
            .select("user_id, event_id")
            .in("user_id", friendIds),
        ]);

        const friendRsvps = friendRsvpsResult.data ?? [];
        const friendEventIds = [
          ...new Set(friendRsvps.map((r: { event_id: string }) => r.event_id)),
        ];

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

        const friendsResult: FriendAttending[] = (friendProfilesResult.data ?? []).map(
          (fp: { id: string; full_name: string; avatar_url: string | null }) => {
            const theirEventIds = friendRsvps
              .filter((r: { user_id: string }) => r.user_id === fp.id)
              .map((r: { event_id: string }) => r.event_id);

            return {
              id: fp.id,
              full_name: fp.full_name,
              avatar_url: fp.avatar_url,
              attending_events: allFriendEvents.filter((e) =>
                theirEventIds.includes(e.id)
              ),
            };
          }
        );

        setFriends(friendsResult);
      } else {
        setFriends([]);
      }
    } catch (err) {
      console.error("Failed to load burger menu data:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // Only fetch when drawer opens and data hasn't been fetched for this user
    const cacheKey = userId ?? "__anon__";
    if (isOpen && fetchedForRef.current !== cacheKey) {
      fetchedForRef.current = cacheKey;
      fetchData();
    }
  }, [isOpen, userId, fetchData]);

  return { trending, favouriteOrgs, friends, profile, loading };
}
