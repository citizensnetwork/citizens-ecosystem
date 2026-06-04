"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  Eye,
  MessageCircle,
  Users,
  Radio,
  TrendingUp,
  Calendar,
  MapPin,
  Settings,
  ChevronRight,
  CheckCircle,
  Pencil,
  Star,
  Bell,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ActivityEntry } from "@/types/db";
import type { InvolvementLevel } from "@/lib/contributors/involvement";
import { INVOLVEMENT_COLORS, INVOLVEMENT_DESCRIPTIONS } from "@/lib/contributors/involvement";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { EventCategory } from "@/types/db";

/* ── types ──────────────────────────────────────────────────── */

interface Stats {
  connected: number;
  considering: number;
  events: number;
  places: number;
  total_followers: number;
  pending_volunteers: number;
}

interface EventRow {
  id: string;
  title: string;
  date: string;
  category: string;
  image_url: string | null;
  rsvps: { count: number }[];
  consider_joins: { count: number }[];
}

interface PlaceRow {
  id: string;
  name: string;
  address: string | null;
  cover_photo_url: string | null;
}

interface WeeklyPoint {
  day: string;
  connects: number;
  views: number;
}

interface ConversationPreview {
  id: string;
  other_user: { full_name: string | null; avatar_url: string | null; is_contributor: boolean };
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
}

interface Props {
  slug: string;
  contributorId: string;
  contributorName: string;
  avatarUrl: string | null;
  involvementLevel: InvolvementLevel;
  period: number;
  stats: Stats;
  recentActivity: ActivityEntry[];
  events: EventRow[];
  places: PlaceRow[];
  weeklyData: WeeklyPoint[];
}

/* ── helpers ────────────────────────────────────────────────── */

const BROADCAST_MAX = 500;
type Tab = "overview" | "events" | "messages" | "tools";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    broadcast_sent: "Sent a broadcast",
    broadcast_deleted: "Deleted a broadcast",
    team_member_added: "Added a team member",
    dashboard_access_revoked: "Admin access revoked",
    event_created: "Created an event",
    event_updated: "Updated an event",
    place_created: "Created a place",
    place_updated: "Updated a place",
  };
  return map[action] ?? action.replace(/_/g, " ");
}

function actionIcon(action: string): React.ReactNode {
  const iconClass = "w-full h-full";
  if (action.includes("broadcast")) return <Radio className={iconClass} />;
  if (action.includes("team")) return <Users className={iconClass} />;
  if (action.includes("event")) return <Calendar className={iconClass} />;
  if (action.includes("place")) return <MapPin className={iconClass} />;
  return <Bell className={iconClass} />;
}

function actionColor(action: string): string {
  if (action.includes("broadcast")) return "#C9A84C";
  if (action.includes("team")) return "#2563EB";
  if (action.includes("event")) return "#16A34A";
  if (action.includes("place")) return "#7C3AED";
  return "#6B7280";
}

/* ── component ──────────────────────────────────────────────── */

export default function DashboardHomeClient({
  slug,
  contributorName,
  avatarUrl,
  involvementLevel,
  period,
  stats,
  recentActivity,
  events,
  places,
  weeklyData,
}: Props) {
  const router = useRouter();
  const base = `/c/${slug}/dashboard`;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [broadcastText, setBroadcastText] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);

  /* Load conversations when Messages tab is first opened */
  const fetchConversations = useCallback(async () => {
    setConvsLoading(true);
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = (await res.json()) as { conversations: ConversationPreview[] };
        setConversations(data.conversations ?? []);
      }
    } finally {
      setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "messages") fetchConversations();
  }, [activeTab, fetchConversations]);

  /* Broadcast send */
  async function sendBroadcast() {
    const trimmed = broadcastText.trim();
    if (!trimmed || !selectedEntityId) return;

    const selected = [
      ...events.map((e) => ({ id: e.id, type: "event" as const })),
      ...places.map((p) => ({ id: p.id, type: "place" as const })),
    ].find((x) => x.id === selectedEntityId);
    if (!selected) return;

    setBroadcastSending(true);
    setBroadcastError(null);
    try {
      const res = await fetch(`/api/contributor/${encodeURIComponent(slug)}/broadcasts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity_type: selected.type, entity_id: selected.id, body: trimmed }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      setBroadcastSent(true);
      setBroadcastText("");
      setSelectedEntityId("");
      router.refresh();
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setBroadcastSending(false);
    }
  }

  const involvementColor = INVOLVEMENT_COLORS[involvementLevel];

  /* ── render ─────────────────────────────────────────────── */

  return (
    <div className="flex-1 flex flex-col bg-background -mx-4 -my-6">
      {/* ── Glass Header ─────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-border glass">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-[#C9A84C]/40 bg-[--surface-muted] shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={contributorName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#C9A84C] font-bold text-lg">
                  {contributorName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2
                className="text-foreground leading-none font-semibold"
                style={{ fontFamily: "var(--font-playfair, 'Playfair Display', serif)" }}
              >
                Dashboard
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{contributorName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              title={INVOLVEMENT_DESCRIPTIONS[involvementLevel]}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{
                background: involvementColor + "22",
                color: involvementColor,
                border: `1px solid ${involvementColor}44`,
              }}
            >
              {involvementLevel}
            </span>
            <Link
              href={`${base}/settings`}
              className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-[#C9A84C]/60 transition-colors"
            >
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        {/* ── Quick stat cards ──────────────────────────────── */}
        <div className="px-5 py-4 grid grid-cols-4 gap-2">
          {[
            { label: "Connected", value: stats.connected, color: "#C9A84C" },
            { label: "Considering", value: stats.considering, color: "#7C3AED" },
            { label: "Events", value: stats.events, color: "#16A34A" },
            { label: "Places", value: stats.places, color: "#2563EB" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-card rounded-2xl p-3 border border-border text-center"
            >
              <p className="text-lg font-bold" style={{ color: stat.color }}>
                {stat.value.toLocaleString()}
              </p>
              <p className="text-[9px] text-muted-foreground leading-tight">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ── Tab row ───────────────────────────────────────── */}
        <div className="px-5 mb-4">
          <div className="flex gap-0 bg-muted rounded-xl p-1">
            {(["overview", "events", "messages", "tools"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all px-2",
                  activeTab === tab
                    ? "bg-white shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5">
          {/* ── OVERVIEW TAB ──────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Weekly bar chart */}
              <div className="bg-card rounded-2xl p-4 border border-border">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-foreground">This Week's Activity</p>
                  <span className="text-xs text-[#C9A84C] font-semibold flex items-center gap-1">
                    <TrendingUp size={12} />
                    {period}d
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={weeklyData} barGap={4}>
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "#7A7060" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(255,255,255,0.9)",
                        backdropFilter: "blur(10px)",
                        border: "1px solid rgba(201,168,76,0.2)",
                        borderRadius: "12px",
                        fontSize: "11px",
                      }}
                    />
                    <Bar dataKey="connects" name="Connects" radius={[4, 4, 0, 0]}>
                      {weeklyData.map((_, i) => (
                        <Cell key={i} fill="#C9A84C" />
                      ))}
                    </Bar>
                    <Bar dataKey="views" name="Views" radius={[4, 4, 0, 0]}>
                      {weeklyData.map((_, i) => (
                        <Cell key={i} fill="#E8D48B" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#C9A84C]" />
                    <span className="text-[10px] text-muted-foreground">Connects</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#E8D48B]" />
                    <span className="text-[10px] text-muted-foreground">Views</span>
                  </div>
                </div>
              </div>

              {/* Recent activity */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-bold text-foreground">Recent Activity</p>
                </div>
                {recentActivity.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-muted-foreground">No recent activity yet.</p>
                ) : (
                  recentActivity.slice(0, 5).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-b-0"
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 p-1.5"
                        style={{
                          background: actionColor(entry.action) + "22",
                          color: actionColor(entry.action),
                        }}
                      >
                        {actionIcon(entry.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">
                          {actionLabel(entry.action)}
                          {entry.actor?.full_name && (
                            <span className="text-muted-foreground"> · {entry.actor.full_name}</span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {timeAgo(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* View public profile CTA */}
              <Link
                href={`/c/${slug}`}
                className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-[#F2E8CC] to-[#E8D48B]/30 rounded-2xl border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 transition-all"
              >
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-[#8B6914]">View Public Profile</p>
                  <p className="text-xs text-[#8B6914]/70">
                    {stats.total_followers.toLocaleString()} followers
                  </p>
                </div>
                <ChevronRight size={16} className="text-[#C9A84C]" />
              </Link>

              {/* Link to full analytics */}
              <Link
                href={`${base}/analytics`}
                className="w-full flex items-center gap-3 p-4 bg-card rounded-2xl border border-border hover:border-[#C9A84C]/40 transition-all"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "#7C3AED18", color: "#7C3AED" }}
                >
                  <TrendingUp size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Full Analytics</p>
                  <p className="text-xs text-muted-foreground">Detailed insights and reach data</p>
                </div>
                <ChevronRight size={15} className="text-muted-foreground ml-auto" />
              </Link>
            </div>
          )}

          {/* ── EVENTS TAB ────────────────────────────────── */}
          {activeTab === "events" && (
            <div className="space-y-4">
              <Link
                href="/events/new"
                className="w-full flex items-center justify-center gap-2 py-3 bg-foreground text-background rounded-xl text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                <Plus size={16} /> Create New Event
              </Link>

              {events.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No events yet. Create your first event above.
                </p>
              )}

              {events.map((event) => {
                const rsvpCount = event.rsvps?.[0]?.count ?? 0;
                const considerCount = event.consider_joins?.[0]?.count ?? 0;
                const catLabel = CATEGORY_LABELS[event.category as EventCategory] ?? event.category;
                const isUpcoming = new Date(event.date) >= new Date();
                return (
                  <div
                    key={event.id}
                    className="bg-card rounded-2xl border border-border overflow-hidden"
                  >
                    {/* Cover */}
                    <div className="relative h-28">
                      {event.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={event.image_url}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#C9A84C]/20 to-[#E8D48B]/20" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      {isUpcoming && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-[#16A34A] px-2 py-0.5 rounded-full">
                          <span className="text-[9px] font-bold text-white uppercase">Upcoming</span>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                        <p className="text-white text-xs font-bold drop-shadow truncate">{event.title}</p>
                        <span className="text-[9px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded shrink-0">
                          {catLabel}
                        </span>
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users size={11} className="text-[#C9A84C]" />
                          <span>{rsvpCount} connected</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Star size={11} className="text-[#C9A84C]" />
                          <span>{considerCount} considering</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar size={11} className="text-[#C9A84C]" />
                          <span>
                            {new Date(event.date).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/events/${event.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/70 transition-colors"
                        >
                          <Eye size={13} /> View
                        </Link>
                        <Link
                          href={`${base}/events?edit=${event.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/70 transition-colors"
                        >
                          <Pencil size={13} /> Edit
                        </Link>
                        <button
                          onClick={() => {
                            setSelectedEntityId(event.id);
                            setActiveTab("tools");
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#F2E8CC] text-[#8B6914] text-xs font-semibold hover:bg-[#E8D48B]/60 transition-colors"
                        >
                          <Radio size={13} /> Broadcast
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Places */}
              {places.length > 0 && (
                <>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2">
                    Your Places
                  </p>
                  {places.map((place) => (
                    <div
                      key={place.id}
                      className="flex items-center gap-3 p-3 bg-card rounded-2xl border border-border"
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-[--surface-muted]">
                        {place.cover_photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={place.cover_photo_url}
                            alt={place.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#C9A84C]">
                            <MapPin size={18} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{place.name}</p>
                        {place.address && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin size={10} className="text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                          </div>
                        )}
                      </div>
                      <Link
                        href={`${base}/places`}
                        className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
                      >
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </Link>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── MESSAGES TAB ──────────────────────────────── */}
          {activeTab === "messages" && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                Recent Conversations
              </p>

              {convsLoading && (
                <p className="text-xs text-muted-foreground">Loading…</p>
              )}

              {!convsLoading && conversations.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <MessageCircle size={28} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No conversations yet.</p>
                </div>
              )}

              {conversations.slice(0, 3).map((conv) => (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="w-full flex items-center gap-3 p-3 bg-card rounded-2xl border border-border hover:border-[#C9A84C]/40 transition-all"
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-[--surface-muted]">
                      {conv.other_user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={conv.other_user.avatar_url}
                          alt={conv.other_user.full_name ?? ""}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#C9A84C] font-bold text-sm">
                          {conv.other_user.full_name?.charAt(0) ?? "?"}
                        </div>
                      )}
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C9A84C] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-foreground truncate">
                        {conv.other_user.full_name ?? "Unknown"}
                      </p>
                      {conv.other_user.is_contributor && (
                        <span className="text-[9px] font-bold text-[#C9A84C] shrink-0">✦</span>
                      )}
                    </div>
                    {conv.last_message && (
                      <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                    )}
                  </div>
                  {conv.last_message_at && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  )}
                </Link>
              ))}

              <Link
                href="/messages"
                className="w-full py-3 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:border-foreground/30 transition-colors text-center block"
              >
                View All Messages
              </Link>
            </div>
          )}

          {/* ── TOOLS TAB ────────────────────────────────── */}
          {activeTab === "tools" && (
            <div className="space-y-4">
              {/* Broadcast composer */}
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#E8D48B] flex items-center justify-center">
                    <Radio size={14} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Broadcast Update</p>
                    <p className="text-xs text-muted-foreground">
                      Notify all attendees, followers &amp; considerers
                    </p>
                  </div>
                </div>

                {broadcastSent ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <CheckCircle size={28} className="text-green-500 mb-2" />
                    <p className="text-sm font-bold text-foreground mb-0.5">Broadcast Sent!</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      All followers, attendees and considerers have been notified.
                    </p>
                    <button
                      onClick={() => setBroadcastSent(false)}
                      className="px-4 py-2 bg-muted rounded-lg text-xs font-semibold"
                    >
                      Send Another
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedEntityId}
                      onChange={(e) => setSelectedEntityId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm text-foreground border-0 outline-none mb-2"
                    >
                      <option value="">Select Event / Place…</option>
                      {events.length > 0 && (
                        <optgroup label="Events">
                          {events.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.title}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {places.length > 0 && (
                        <optgroup label="Places">
                          {places.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <textarea
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value.slice(0, BROADCAST_MAX))}
                      placeholder="Write your broadcast message… (visible as speech bubble on map for 24hrs)"
                      rows={3}
                      maxLength={BROADCAST_MAX}
                      className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none mb-3 focus:ring-1 focus:ring-[#C9A84C]/50"
                      disabled={broadcastSending}
                    />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {BROADCAST_MAX - broadcastText.length} chars left
                      </span>
                    </div>
                    {broadcastError && (
                      <p role="alert" className="text-xs text-red-600 mb-2">
                        {broadcastError}
                      </p>
                    )}
                    <button
                      disabled={!broadcastText.trim() || !selectedEntityId || broadcastSending}
                      onClick={sendBroadcast}
                      className="w-full py-3 bg-foreground text-background rounded-xl text-sm font-bold hover:bg-foreground/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {broadcastSending ? "Sending…" : "Send Broadcast"}
                    </button>
                  </>
                )}
              </div>

              {/* Tool tiles */}
              {[
                {
                  label: "Create Event",
                  icon: Calendar,
                  color: "#C9A84C",
                  desc: "Post a new event on the map",
                  href: "/events/new",
                },
                {
                  label: "Add Place",
                  icon: MapPin,
                  color: "#2563EB",
                  desc: "Register a venue or community space",
                  href: `${base}/places`,
                },
                {
                  label: "Volunteer Manager",
                  icon: Users,
                  color: "#16A34A",
                  desc: "Review volunteer applications",
                  href: `${base}/team`,
                },
                {
                  label: "Analytics",
                  icon: TrendingUp,
                  color: "#7C3AED",
                  desc: "Detailed insights and reach data",
                  href: `${base}/analytics`,
                },
                {
                  label: "Team",
                  icon: LayoutDashboard,
                  color: "#0891B2",
                  desc: "Manage your team members",
                  href: `${base}/team`,
                },
                {
                  label: "Planning",
                  icon: CheckCircle,
                  color: "#D97706",
                  desc: "Tasks, ideas, and planning cards",
                  href: `${base}/planning`,
                },
              ].map((tool) => (
                <Link
                  key={tool.label}
                  href={tool.href}
                  className="w-full flex items-center gap-3 p-4 bg-card rounded-2xl border border-border hover:border-[#C9A84C]/40 transition-all"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: tool.color + "18", color: tool.color }}
                  >
                    <tool.icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                  </div>
                  <ChevronRight size={15} className="text-muted-foreground ml-auto" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
