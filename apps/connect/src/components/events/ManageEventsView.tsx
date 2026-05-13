"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABELS, CATEGORY_BADGE_CLASSES } from "@/lib/categories";
import type { EventCategory } from "@/types/db";

type ManagedEvent = {
  id: string;
  title: string;
  date: string;
  end_time: string | null;
  status: string;
  visibility: string;
  category: EventCategory | null;
  max_attendees: number | null;
  attendee_count: number;
  consider_count: number;
  view_count: number;
  attendees: { full_name: string; created_at: string }[];
};

type Props = {
  isVendor?: boolean;
  /**
   * When true, groups events into sections: Happening now, Upcoming, Past,
   * Cancelled. Used by the contributor dashboard ({@link /profile/contributor/dashboard})
   * to give contributors an at-a-glance view of their lifecycle pipeline.
   */
  groupByLifecycle?: boolean;
};

type Lifecycle = "live" | "upcoming" | "past" | "cancelled";

// ~2 hour fallback when an event has no end_time (mirrors EventStatusBadge).
export const MANAGE_LIVE_FALLBACK_MS = 2 * 60 * 60 * 1000;

export function lifecycleOf(
  e: Pick<ManagedEvent, "status" | "date" | "end_time">,
  now: number,
): Lifecycle {
  if (e.status === "cancelled") return "cancelled";
  const start = new Date(e.date).getTime();
  const end = e.end_time
    ? new Date(e.end_time).getTime()
    : start + MANAGE_LIVE_FALLBACK_MS;
  if (now < start) return "upcoming";
  if (now <= end) return "live";
  return "past";
}

const LIFECYCLE_ORDER: Lifecycle[] = ["live", "upcoming", "past", "cancelled"];
const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  live: "Happening now",
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ManageEventsView({ isVendor, groupByLifecycle = false }: Props) {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manage/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-black/50 text-sm">You haven&apos;t created any events yet.</p>
        <Link
          href="/events/new"
          className="mt-4 inline-block rounded-lg bg-(--gold) px-4 py-2 text-sm font-semibold text-black"
        >
          Create Event
        </Link>
      </div>
    );
  }

  // Aggregate analytics across all managed events.
  const totals = events.reduce(
    (acc, e) => {
      acc.events += 1;
      acc.views += e.view_count ?? 0;
      acc.rsvps += e.attendee_count ?? 0;
      acc.considers += e.consider_count ?? 0;
      if (e.status === "published") acc.published += 1;
      if (e.status === "draft") acc.drafts += 1;
      if (e.status === "cancelled") acc.cancelled += 1;
      const capacity = e.max_attendees;
      if (capacity != null && (e.attendee_count ?? 0) >= capacity) acc.soldOut += 1;
      return acc;
    },
    {
      events: 0,
      views: 0,
      rsvps: 0,
      considers: 0,
      published: 0,
      drafts: 0,
      cancelled: 0,
      soldOut: 0,
    },
  );

  return (
    <div className="space-y-4">
      {/* ── Vendor analytics summary ─────────────────────── */}
      <section
        aria-label="Analytics summary"
        className="rounded-2xl border border-black/8 bg-white/80 backdrop-blur p-4 sm:p-5"
      >
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Your events at a glance</h2>
          <span className="text-[11px] text-black/40">
            {totals.published} published · {totals.drafts} draft · {totals.cancelled} cancelled
          </span>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AnalyticStat label="Events" value={totals.events} />
          <AnalyticStat label="Total views" value={totals.views} />
          <AnalyticStat label="Total RSVPs" value={totals.rsvps} />
          <AnalyticStat label="Considering" value={totals.considers} />
        </dl>
        {totals.soldOut > 0 && (
          <p className="mt-3 text-[11px] text-black/50">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle mr-1.5" />
            {totals.soldOut} {totals.soldOut === 1 ? "event is" : "events are"} sold out — consider raising capacity.
          </p>
        )}
      </section>

      <div className="space-y-3">
      {(() => {
        if (!groupByLifecycle) {
          return events.map((event) => renderEventRow(event));
        }
        // Group once per render — events list is small (per-organiser),
        // so the O(n) sort is cheap vs. useMemo complexity.
        const now = Date.now();
        const grouped: Record<Lifecycle, ManagedEvent[]> = {
          live: [],
          upcoming: [],
          past: [],
          cancelled: [],
        };
        for (const e of events) grouped[lifecycleOf(e, now)].push(e);
        // Upcoming: soonest first; past: most recent first.
        grouped.upcoming.sort((a, b) => +new Date(a.date) - +new Date(b.date));
        grouped.past.sort((a, b) => +new Date(b.date) - +new Date(a.date));

        return LIFECYCLE_ORDER.filter((k) => grouped[k].length > 0).map((k) => (
          <section key={k} className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-black/45">
              {LIFECYCLE_LABELS[k]} · {grouped[k].length}
            </h3>
            {grouped[k].map((event) => renderEventRow(event))}
          </section>
        ));
      })()}
      </div>
    </div>
  );

  function renderEventRow(event: ManagedEvent) {
    const cat = event.category ?? "church-services";
    const isExpanded = expandedId === event.id;
    const isFull = event.max_attendees != null && event.attendee_count >= event.max_attendees;

    return (
          <div
            key={event.id}
            className="rounded-xl border border-black/8 bg-white overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
              className="w-full px-5 py-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_BADGE_CLASSES[cat]}`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                        event.status === "published"
                          ? "bg-green-100 text-green-700"
                          : event.status === "cancelled"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {event.status}
                    </span>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                        event.visibility === "private"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {event.visibility === "private" ? "Private" : "Public"}
                    </span>
                    {isFull && (
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Sold Out
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm truncate">{event.title}</h3>
                  <p className="text-xs text-black/50 mt-0.5">
                    {new Date(event.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-center shrink-0">
                  <div>
                    <p className="text-lg font-bold text-black">{event.attendee_count}</p>
                    <p className="text-[10px] text-black/50">Attending</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-(--gold)">{event.consider_count}</p>
                    <p className="text-[10px] text-black/50">Considering</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-black/40">{event.view_count}</p>
                    <p className="text-[10px] text-black/50">Views</p>
                  </div>
                </div>
              </div>
            </button>

            {/* Expanded: attendee list + actions */}
            {isExpanded && (
              <div className="border-t border-black/5 px-5 py-4">
                <div className="flex flex-wrap gap-2 mb-4">
                  <Link
                    href={`/events/${event.id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                  >
                    View Event
                  </Link>
                  <Link
                    href={`/events/${event.id}/edit`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                  >
                    Edit Event
                  </Link>
                  <InviteButton eventId={event.id} eventTitle={event.title} />
                </div>

                {event.attendees.length > 0 ? (
                  <div>
                    <h4 className="text-xs font-semibold text-black/50 uppercase tracking-wider mb-2">
                      Attendees ({event.attendee_count})
                    </h4>
                    <ul className="space-y-1">
                      {event.attendees.map((a, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span>{a.full_name}</span>
                          <span className="text-xs text-black/40">
                            {new Date(a.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-black/40">No attendees yet.</p>
                )}

                {/* Post an update — goes to all attendees + considerers */}
                <EventUpdateComposer eventId={event.id} />
              </div>
            )}
          </div>
    );
  }
}

/** Small stat card used inside the analytics summary. */
function AnalyticStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-black/3 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-black/40 font-medium">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/* ── InviteButton: invite via email or friends list ────── */

type FriendOption = { id: string; full_name: string };

function InviteButton({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || friendsLoaded) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      // Get mutual follows (friends)
      const { data: following } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id);
      if (!following || following.length === 0) { setFriendsLoaded(true); return; }
      const followeeIds = following.map((f) => f.followee_id);
      const { data: mutual } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("followee_id", user.id)
        .in("follower_id", followeeIds);
      const friendIds = (mutual ?? []).map((f) => f.follower_id);
      if (friendIds.length === 0) { setFriendsLoaded(true); return; }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", friendIds);
      setFriends((profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name ?? "Friend" })));
      setFriendsLoaded(true);
    });
  }, [open, friendsLoaded]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleEmailInvite() {
    if (!email.trim()) return;
    setSending(true);
    const url = `${window.location.origin}/events/${eventId}`;
    // Use mailto as a simple invite mechanism
    window.open(
      `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`You're invited: ${eventTitle}`)}&body=${encodeURIComponent(`You've been invited to an event on Citizens Connect!\n\n${eventTitle}\n\nView details: ${url}`)}`,
      "_self"
    );
    setSending(false);
    setSent(true);
    setEmail("");
    setTimeout(() => setSent(false), 2000);
  }

  async function handleFriendInvite(friendId: string) {
    // Create a DM conversation with invite link
    const supabase = createClient();
    const url = `${window.location.origin}/events/${eventId}`;
    try {
      const { data } = await supabase.rpc("find_or_create_conversation", {
        user_a: (await supabase.auth.getUser()).data.user!.id,
        user_b: friendId,
      });
      if (data) {
        await supabase.from("messages").insert({
          conversation_id: data,
          sender_id: (await supabase.auth.getUser()).data.user!.id,
          body: `You're invited to: ${eventTitle} — ${url}`,
        });
      }
    } catch {
      /* fail silently */
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-(--gold)/40 bg-(--gold)/10 px-3 py-1.5 text-xs font-medium text-(--gold) hover:bg-(--gold)/20 transition"
      >
        Invite
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-black/10 bg-white/90 p-4 shadow-xl backdrop-blur-md">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-3">
            Invite to Event
          </h4>

          {/* Email invite */}
          <div className="flex gap-2 mb-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") handleEmailInvite(); }}
            />
            <button
              type="button"
              onClick={handleEmailInvite}
              disabled={sending || !email.trim()}
              className="rounded-lg bg-(--gold) px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
            >
              {sent ? "Sent" : "Send"}
            </button>
          </div>

          {/* Friends list */}
          {friends.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40 mb-2">
                Or invite a friend
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFriendInvite(f.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-black/80 transition hover:bg-black/5"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--gold-soft) text-[10px] font-bold uppercase">
                      {f.full_name[0]}
                    </span>
                    <span className="truncate">{f.full_name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {friendsLoaded && friends.length === 0 && (
            <p className="text-[10px] text-black/40">No friends to invite yet</p>
          )}
        </div>
      )}
    </div>
  );
}
/* ── EventUpdateComposer: organiser posts an update to all RSVPed users ── */

function EventUpdateComposer({ eventId }: { eventId: string }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const MAX = 1000;
  const remaining = MAX - body.length;
  const disabled = status === "sending" || body.trim().length === 0 || body.length > MAX;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Failed to post" }));
        setError(payload.error ?? "Failed to post update");
        setStatus("error");
        return;
      }
      setBody("");
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 border-t border-black/5 pt-4">
      <label
        htmlFor={`event-update-${eventId}`}
        className="mb-2 block text-xs font-semibold uppercase tracking-wider text-black/50"
      >
        Post an update
      </label>
      <p className="text-[11px] text-black/50 mb-2">
        Every attendee and considerer gets an in-app + push notification.
      </p>
      <textarea
        id={`event-update-${eventId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={MAX}
        placeholder="e.g. Venue change — we're now meeting at…"
        className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm focus:border-(--gold) focus:outline-none"
        disabled={status === "sending"}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className={`text-[11px] ${remaining < 50 ? "text-red-600" : "text-black/40"}`}>
          {remaining} left
        </span>
        <div className="flex items-center gap-2">
          {status === "sent" && (
            <span className="text-[11px] font-medium text-green-700">Update sent</span>
          )}
          {status === "error" && error && (
            <span className="text-[11px] font-medium text-red-700">{error}</span>
          )}
          <button
            type="submit"
            disabled={disabled}
            className="rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "sending" ? "Sending…" : "Send update"}
          </button>
        </div>
      </div>
    </form>
  );
}
