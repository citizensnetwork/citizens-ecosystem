"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Radio,
  MessageCircle,
  Users,
  Heart,
  CheckCheck,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Notification, NotificationType } from "@/types/db";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

type FilterKey = "all" | "broadcasts" | "messages" | "friends" | "convince" | "events";

const FILTER_CHIPS: { id: FilterKey; label: string }[] = [
  { id: "all",        label: "All" },
  { id: "broadcasts", label: "📣 Broadcasts" },
  { id: "messages",   label: "💬 Messages" },
  { id: "friends",    label: "🤝 Friends" },
  { id: "convince",   label: "👀 Convince" },
  { id: "events",     label: "🗓️ Events" },
];

const BROADCAST_TYPES: NotificationType[] = ["event_update", "new_event_match"];
const MESSAGE_TYPES: NotificationType[] = ["new_message", "dm_received", "dm_response"];
const FRIEND_TYPES: NotificationType[] = ["new_follower", "friend_attending", "team_invite", "team_invite_response", "team_owner_transfer"];
const CONVINCE_TYPES: NotificationType[] = ["friend_convince"];
const EVENT_TYPES: NotificationType[] = ["event_reminder", "event_cancelled", "volunteer_application", "volunteer_application_response", "contributor_approved", "contributor_rejected", "suggestion_response"];

function getFilter(type: NotificationType): FilterKey {
  if ((BROADCAST_TYPES as string[]).includes(type)) return "broadcasts";
  if ((MESSAGE_TYPES as string[]).includes(type)) return "messages";
  if ((CONVINCE_TYPES as string[]).includes(type)) return "convince";
  if ((FRIEND_TYPES as string[]).includes(type)) return "friends";
  if ((EVENT_TYPES as string[]).includes(type)) return "events";
  return "all";
}

type TypeConfig = { icon: React.ElementType; color: string; bg: string };

const TYPE_CONFIG: Partial<Record<FilterKey, TypeConfig>> = {
  broadcasts: { icon: Radio,         color: "#C9A84C", bg: "#F2E8CC" },
  messages:   { icon: MessageCircle, color: "#16A34A", bg: "#DCFCE7" },
  friends:    { icon: Users,         color: "#2563EB", bg: "#DBEAFE" },
  convince:   { icon: Heart,         color: "#EC4899", bg: "#FCE7F3" },
  events:     { icon: Calendar,      color: "#5D6D7E", bg: "#5D6D7E18" },
};

const FALLBACK_CONFIG: TypeConfig = { icon: Bell, color: "#C9A84C", bg: "#F2E8CC" };

function getTypeConfig(type: NotificationType): TypeConfig {
  const key = getFilter(type);
  return TYPE_CONFIG[key] ?? FALLBACK_CONFIG;
}

interface Props {
  userId: string;
}

export default function NotificationsPageClient({ userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const channel = supabase
      .channel("notifications-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => fetchNotifications())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchNotifications]);

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  function handleClick(notif: Notification) {
    markRead(notif.id);
    const url = notif.data?.url as string | undefined;
    if (url) {
      if (url.startsWith("/")) {
        router.push(url);
      }
    }
  }

  const filtered = filter === "all"
    ? notifications
    : notifications.filter((n) => getFilter(n.type) === filter);

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="flex flex-col overflow-hidden bg-background" style={{ height: "calc(100dvh - 4rem)", minHeight: 0 }}>
        <div className="px-5 pt-5 pb-4 border-b border-border glass space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black/10 animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-5 w-28 rounded bg-black/10 animate-pulse" />
              <div className="h-3 w-16 rounded bg-black/5 animate-pulse" />
            </div>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 w-20 rounded-full bg-black/5 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4 border-b border-border/50 animate-pulse">
              <div className="w-11 h-11 rounded-xl bg-black/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-black/8" />
                <div className="h-3 w-full rounded bg-black/5" />
                <div className="h-2.5 w-16 rounded bg-black/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "calc(100dvh - 4rem)", minHeight: 0 }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border glass">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-foreground flex items-center justify-center shrink-0">
              <Bell size={17} className="text-background" />
            </div>
            <div>
              <h2
                className="text-foreground leading-none"
                style={{ fontFamily: "Playfair Display, serif" }}
              >
                Notifications
              </h2>
              {unreadCount > 0 && (
                <p className="text-xs text-[#C9A84C] font-semibold mt-0.5">{unreadCount} unread</p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {FILTER_CHIPS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                filter === f.id
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto pb-32 md:pb-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Bell size={22} className="text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">No notifications here</p>
          </div>
        ) : (
          filtered.map((notif) => {
            const config = getTypeConfig(notif.type);
            const Icon = config.icon;
            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full flex items-start gap-3 px-5 py-4 border-b border-border/50 hover:bg-accent/30 transition-colors text-left ${
                  !notif.read ? "bg-[#F2E8CC]/20" : ""
                }`}
              >
                {/* Icon or photo */}
                <div className="relative shrink-0">
                  {notif.image_url ? (
                    <img src={notif.image_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: config.bg, color: config.color }}
                    >
                      <Icon size={18} />
                    </div>
                  )}
                  <div
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-background"
                    style={{ background: config.bg, color: config.color }}
                  >
                    <Icon size={11} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${notif.read ? "text-foreground/80" : "text-foreground font-semibold"}`}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.body}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(notif.created_at)}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!notif.read && (
                    <span className="w-2 h-2 bg-[#C9A84C] rounded-full" />
                  )}
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
