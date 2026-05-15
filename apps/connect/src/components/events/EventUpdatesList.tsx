"use client";

/**
 * EventUpdatesList — read-only viewer for the "From the Organiser" channel
 * surfaced above CommentSection on the event detail page.
 *
 * Why this lives in its own component (rather than inline in
 * EventDetailContent):
 *   - Comments and updates have very different lifecycles (organiser-only
 *     authoring vs anyone-can-post chat) and we want the empty state of one
 *     to never bleed into the other.
 *   - The composer already lives in ManageEventsView (where the contributor
 *     manages their own events) so this component is purely a viewer.  No
 *     POST handler here on purpose; that keeps the surface area small and
 *     makes it impossible to accidentally call the create endpoint from the
 *     wrong place.
 *
 * Author names are looked up in a single follow-up `profiles` query rather
 * than via a join on the API to keep the API route stable for the existing
 * `/api/events/[id]/updates.test.ts` test contract.  We map ids → names
 * client-side and fall back to a friendly "Organiser" label for any author
 * whose profile we can't read (rare; possible if the profile was deleted).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { EventUpdate } from "@/types/db";

type AuthorMap = Record<string, { full_name: string; avatar_url: string | null }>;

type Props = {
  eventId: string;
};

/** Friendly relative-time formatter (matches the look of CommentSection). */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  // Fall back to an absolute date for older updates so the user gets context.
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function EventUpdatesList({ eventId }: Props) {
  const [updates, setUpdates] = useState<EventUpdate[]>([]);
  const [authors, setAuthors] = useState<AuthorMap>({});
  const [loading, setLoading] = useState(true);
  // Viewer identity is resolved once on mount and drives whether the
  // inline Delete affordance is rendered on each row. A null value means
  // "not signed in or still resolving" — in both cases the button stays
  // hidden. The DELETE API independently enforces the policy via RLS.
  const [viewer, setViewer] = useState<{ id: string; isAdmin: boolean } | null>(null);
  // Track in-flight deletes so users can't double-tap and so we can show
  // a subtle pending state. Realtime DELETE events will also clean up.
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  // Hold a single Supabase client across renders to avoid re-creating WebSocket
  // / fetch adapters on every state change.
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const supabase = supabaseRef.current;

    async function loadViewer() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = (profile as { role?: string } | null)?.role;
      setViewer({ id: user.id, isAdmin: role === "admin" });
    }

    // Resolve a single author's display info into state on demand — used
    // by the realtime INSERT path so a brand-new update from another
    // organiser still shows their name/avatar without a full reload.
    async function resolveAuthor(authorId: string) {
      // Reading from `authors` directly inside a callback would close over
      // a stale value, so we use the functional setter to dedupe.
      let alreadyKnown = false;
      setAuthors((prev) => {
        if (prev[authorId]) alreadyKnown = true;
        return prev;
      });
      if (alreadyKnown) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", authorId)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as { id: string; full_name: string; avatar_url: string | null };
      setAuthors((prev) =>
        prev[row.id]
          ? prev
          : { ...prev, [row.id]: { full_name: row.full_name, avatar_url: row.avatar_url } },
      );
    }

    async function load() {
      try {
        const res = await fetch(`/api/events/${eventId}/updates`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          // Fail silently — the section just stays empty.  An organiser-only
          // channel that quietly disappears for unauthenticated edge cases
          // is preferable to an angry red banner.
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as { updates?: EventUpdate[] };
        const items = json.updates ?? [];

        // Resolve author display names in one round-trip.  We don't gate the
        // initial render on this; the messages render with "Organiser" as a
        // placeholder until the names arrive.
        if (items.length > 0) {
          const authorIds = Array.from(new Set(items.map((u) => u.author_id)));
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", authorIds);
          if (!cancelled && profiles) {
            const map: AuthorMap = {};
            for (const p of profiles as Array<{ id: string; full_name: string; avatar_url: string | null }>) {
              map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
            }
            setAuthors(map);
          }
        }

        if (!cancelled) {
          // Merge rather than replace so any realtime INSERT that won the
          // race against the initial fetch (sub-second window where the
          // channel is already subscribed but `load()` hasn't resolved)
          // isn't clobbered by the snapshot.
          setUpdates((prev) => {
            const seen = new Set(items.map((u) => u.id));
            const extras = prev.filter((u) => !seen.has(u.id));
            return [...extras, ...items];
          });
          setLoading(false);
        }
      } catch (err) {
        // AbortError is expected on unmount — ignore.
        if ((err as { name?: string }).name === "AbortError") return;
        if (!cancelled) setLoading(false);
      }
    }
    void loadViewer();
    void load();

    // Live broadcast subscription. Migration 071 adds event_updates to the
    // supabase_realtime publication; without that the postgres_changes
    // events would never fire. We listen for INSERT and DELETE only —
    // updates aren't editable in this product.
    const channel = supabase
      .channel(`event-updates-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_updates",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as EventUpdate;
          if (!row?.id) return;
          setUpdates((prev) =>
            prev.some((u) => u.id === row.id) ? prev : [row, ...prev],
          );
          void resolveAuthor(row.author_id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "event_updates",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (!deletedId) return;
          setUpdates((prev) => prev.filter((u) => u.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      ctrl.abort();
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  async function handleDelete(updateId: string) {
    if (pendingDeletes.has(updateId)) return;
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.add(updateId);
      return next;
    });
    try {
      const res = await fetch(
        `/api/events/${eventId}/updates/${updateId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        // Optimistic local removal — the realtime DELETE event will also
        // catch this for other viewers / tabs.
        setUpdates((prev) => prev.filter((u) => u.id !== updateId));
      }
    } finally {
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(updateId);
        return next;
      });
    }
  }

  // Hide the entire section while empty.  Comments still anchor the area
  // below; we don't want a perpetually-empty "From the organiser" box on
  // every event that hasn't received an update yet.
  if (loading) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-black/80">From the Organiser</h2>
        <div className="h-16 animate-pulse rounded-xl bg-black/5" />
      </div>
    );
  }
  if (updates.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black/80">From the Organiser</h2>
        <span className="rounded-full bg-(--gold-soft) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black/70">
          {updates.length} {updates.length === 1 ? "update" : "updates"}
        </span>
      </div>

      <ul className="space-y-2">
        {updates.map((u) => {
          const author = authors[u.author_id];
          const name = author?.full_name?.trim() || "Organiser";
          const initial = name.charAt(0).toUpperCase() || "O";
          const canDelete = !!viewer && (viewer.id === u.author_id || viewer.isAdmin);
          const isPending = pendingDeletes.has(u.id);
          return (
            <li
              key={u.id}
              className="rounded-xl border border-(--gold)/40 bg-(--gold-soft)/40 p-3"
            >
              <div className="flex items-start gap-2.5">
                {/* Avatar — fall back to gold initial bubble; explicitly not
                    using next/image because we render placeholders most of
                    the time and the runtime cost of <img> here is trivial. */}
                {author?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={author.avatar_url}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-black/10"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--gold) text-[11px] font-bold text-black"
                  >
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      href={`/profile/${u.author_id}`}
                      className="truncate text-xs font-semibold text-black hover:underline"
                    >
                      {name}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[10px] text-black/50">
                        {timeAgo(u.created_at)}
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u.id)}
                          disabled={isPending}
                          className="text-[10px] font-medium text-black/40 transition hover:text-red-700 disabled:opacity-40"
                          aria-label="Delete update"
                        >
                          {isPending ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* whitespace-pre-wrap preserves intentional line breaks
                      from the composer textarea (e.g. step-by-step venue
                      directions) without letting users inject HTML. */}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-black/85">
                    {u.body}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
