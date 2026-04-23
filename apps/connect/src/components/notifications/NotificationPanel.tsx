"use client";

import { useEffect, useState, useCallback } from "react";
import type { Notification } from "@/types/db";
import Link from "next/link";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { createClient } from "@/lib/supabase/client";

type PendingReview = {
  id: string;
  title: string;
  date: string;
};

interface NotificationPanelProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  event_reminder: "●",
  new_event_match: "◆",
  event_cancelled: "✕",
  new_follower: "○",
  event_update: "▸",
  review_prompt: "★",
};

/** Safely read dismissed review IDs from localStorage. */
function getDismissedReviewIds(): string[] {
  try {
    const str = localStorage.getItem("cc_dismissed_reviews");
    return str ? JSON.parse(str) as string[] : [];
  } catch {
    return [];
  }
}

/** Safely persist a dismissed review ID to localStorage. */
function addDismissedReviewId(eventId: string): void {
  try {
    const dismissed = getDismissedReviewIds();
    if (!dismissed.includes(eventId)) {
      dismissed.push(eventId);
      localStorage.setItem("cc_dismissed_reviews", JSON.stringify(dismissed));
    }
  } catch {
    // localStorage unavailable — dismiss is session-only
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function NotificationPanel({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onClose,
}: NotificationPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;
  const panelRef = useFocusTrap<HTMLDivElement>(true);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [completedReviews, setCompletedReviews] = useState<Set<string>>(new Set());
  const [dismissedReviews, setDismissedReviews] = useState<Set<string>>(new Set());
  const [submittingReview, setSubmittingReview] = useState<string | null>(null);
  const [hoveredStar, setHoveredStar] = useState<{ eventId: string; star: number } | null>(null);

  // Fetch pending reviews on mount
  useEffect(() => {
    let active = true;
    async function fetchReviews() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("event_id")
        .eq("user_id", user.id);

      const eventIds = (rsvps ?? []).map((r) => r.event_id);
      if (eventIds.length === 0) return;

      const { data: events } = await supabase
        .from("events")
        .select("id,title,date")
        .in("id", eventIds)
        .lt("date", new Date().toISOString())
        .order("date", { ascending: false })
        .limit(10);

      if (!events || events.length === 0) return;

      const { data: reviews } = await supabase
        .from("reviews")
        .select("event_id")
        .eq("user_id", user.id)
        .in("event_id", events.map((e) => e.id));

      const reviewedIds = new Set((reviews ?? []).map((r) => r.event_id));

      // Also check localStorage for permanently dismissed reviews
      const dismissed = new Set(getDismissedReviewIds());

      if (active) {
        setDismissedReviews(dismissed);
        setPendingReviews(
          events.filter((e) => !reviewedIds.has(e.id) && !dismissed.has(e.id))
        );
      }
    }

    fetchReviews();
    return () => { active = false; };
  }, []);

  const submitReviewRating = useCallback(async (eventId: string, rating: number) => {
    setSubmittingReview(eventId);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmittingReview(null); return; }

    const { error } = await supabase.from("reviews").upsert(
      {
        event_id: eventId,
        place_id: null,
        user_id: user.id,
        rating,
        body: "",
        still_exists: true,
      },
      { onConflict: "event_id,user_id" }
    );

    setSubmittingReview(null);
    if (!error) {
      setCompletedReviews((prev) => new Set([...prev, eventId]));
      addDismissedReviewId(eventId);
      // Remove from pending after a brief highlight
      setTimeout(() => {
        setPendingReviews((prev) => prev.filter((r) => r.id !== eventId));
      }, 1200);
    }
  }, []);

  const dismissReview = useCallback((eventId: string) => {
    addDismissedReviewId(eventId);
    setDismissedReviews((prev) => new Set([...prev, eventId]));
    setPendingReviews((prev) => prev.filter((r) => r.id !== eventId));
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Determine the link for a notification based on its data
  function getNotificationLink(n: Notification): string | null {
    const data = n.data;
    if (data?.event_id && typeof data.event_id === "string") {
      // Post-event review prompts deep-link into the event detail page
      // with ?review=1 so the rating widget auto-focuses itself.
      if (n.type === "review_prompt") {
        return `/events/${data.event_id}?review=1`;
      }
      return `/events/${data.event_id}`;
    }
    if (data?.user_id && typeof data.user_id === "string") {
      return `/profile/${data.user_id}`;
    }
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 z-[9999] mt-2 w-80 max-h-[28rem] flex flex-col rounded-xl border border-black/10 bg-white shadow-xl sm:w-96"
      role="dialog"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-black">Notifications</h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-xs text-(--gold) hover:underline"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="text-black/40 hover:text-black"
            aria-label="Close notifications"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {/* Pending review notifications at the top */}
        {pendingReviews.filter((r) => !dismissedReviews.has(r.id)).length > 0 && (
          <ul>
            {pendingReviews
              .filter((r) => !dismissedReviews.has(r.id))
              .map((review) => {
                const isCompleted = completedReviews.has(review.id);
                const isSubmitting = submittingReview === review.id;
                return (
                  <li
                    key={`review-${review.id}`}
                    className={`border-b border-black/5 transition-colors duration-300 ${
                      isCompleted ? "bg-white" : "bg-(--gold-soft)/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <Link
                        href={`/events/${review.id}`}
                        onClick={onClose}
                        className="min-w-0 flex-1"
                      >
                        <p className="text-xs font-medium text-black truncate">
                          Review: {review.title}
                        </p>
                        <div className="mt-1 flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const isHovered = hoveredStar?.eventId === review.id && hoveredStar.star >= star;
                            return (
                              <button
                                key={star}
                                type="button"
                                disabled={isSubmitting || isCompleted}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  submitReviewRating(review.id, star);
                                }}
                                onMouseEnter={() => setHoveredStar({ eventId: review.id, star })}
                                onMouseLeave={() => setHoveredStar(null)}
                                className={`text-base transition ${
                                  isCompleted
                                    ? "text-(--gold)"
                                    : isHovered
                                      ? "text-(--gold)"
                                      : "text-(--gold)/30"
                                } disabled:cursor-default`}
                                aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                              >
                                ★
                              </button>
                            );
                          })}
                        </div>
                      </Link>
                      {/* Dismiss X */}
                      <button
                        type="button"
                        onClick={() => dismissReview(review.id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center text-sm text-black/80 transition hover:text-black"
                        aria-label="Dismiss review"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}

        {notifications.length === 0 && pendingReviews.filter((r) => !dismissedReviews.has(r.id)).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-2xl text-black/30">●</span>
            <p className="mt-2 text-sm font-medium text-black/60">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-black/40">
              New activity from events and friends will show up here.
            </p>
          </div>
        ) : (
          <ul>
            {notifications.map((n) => {
              const link = getNotificationLink(n);
              const content = (
                <div className="flex gap-3">
                  <span className="mt-0.5 text-lg shrink-0">
                    {TYPE_ICONS[n.type] ?? "●"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm leading-snug ${
                        n.read ? "text-black/60" : "font-medium text-black"
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-black/50 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-black/35">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onMarkRead(n.id);
                        }}
                        className="h-2 w-2 rounded-full bg-(--gold)"
                        aria-label="Mark as read"
                        title="Mark as read"
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(n.id);
                      }}
                      className="text-[11px] text-black/25 hover:text-red-500"
                      aria-label="Delete notification"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );

              return (
                <li
                  key={n.id}
                  className={`border-b border-black/5 last:border-b-0 ${
                    n.read ? "bg-white" : "bg-(--gold-soft)/30"
                  }`}
                >
                  {link ? (
                    <Link
                      href={link}
                      onClick={() => {
                        if (!n.read) onMarkRead(n.id);
                        onClose();
                      }}
                      className="block px-4 py-3 transition hover:bg-black/3"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t px-4 py-2 text-center">
          <Link
            href="/profile"
            onClick={onClose}
            className="text-xs text-(--gold) hover:underline"
          >
            Notification preferences →
          </Link>
        </div>
      )}
    </div>
  );
}
