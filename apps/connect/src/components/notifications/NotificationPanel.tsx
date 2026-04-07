"use client";

import { useEffect } from "react";
import type { Notification } from "@/types/db";
import Link from "next/link";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
};

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
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-2xl text-black/30">●</span>
            <p className="mt-2 text-sm text-black/50">No notifications yet</p>
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
