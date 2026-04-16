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
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ManageEventsView({ isVendor }: Props) {
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

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const cat = event.category ?? "church";
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
              </div>
            )}
          </div>
        );
      })}
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