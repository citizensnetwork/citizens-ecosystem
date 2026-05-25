"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ANALYTICS_PERIOD_LABELS, type AnalyticsPeriod } from "@/types/db";

interface Stats {
  active_places: number;
  upcoming_events: number;
  total_followers: number;
  rsvps_in_period: number;
  active_team_members: number;
  drafts: number;
  pending_volunteers: number;
}

interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  slug: string;
  contributorId: string;
  period: number;
  stats: Stats;
  recentActivity: ActivityEntry[];
}

const PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];

const QUICK_ACTIONS = [
  { label: "New event", href: "/events/new", icon: "📅" },
  { label: "New draft", href: "drafts", icon: "📝" },
  { label: "Broadcast", href: "broadcasts", icon: "📢" },
  { label: "Add team", href: "team", icon: "👥" },
  { label: "Analytics", href: "analytics", icon: "📊" },
  { label: "Settings", href: "settings", icon: "⚙️" },
] as const;

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

export default function DashboardHomeClient({
  slug,
  period,
  stats,
  recentActivity,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPeriod(p: AnalyticsPeriod) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("period", String(p));
    router.replace(`${pathname}?${sp.toString()}`);
  }

  const base = `/c/${slug}/dashboard`;

  const statCards = [
    { label: "Followers", value: stats.total_followers, href: `${base}/profile` },
    { label: "Upcoming events", value: stats.upcoming_events, href: `${base}/events` },
    { label: `RSVPs (${period}d)`, value: stats.rsvps_in_period, href: `${base}/analytics` },
    { label: "Active places", value: stats.active_places, href: `${base}/places` },
    { label: "Team members", value: stats.active_team_members, href: `${base}/team` },
    { label: "Drafts", value: stats.drafts, href: `${base}/drafts` },
    ...(stats.pending_volunteers > 0
      ? [{ label: "Pending volunteers", value: stats.pending_volunteers, href: `${base}/team` }]
      : []),
  ];

  return (
    <div className="space-y-8">
      {/* Quick actions */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[--foreground-soft] mb-3">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ label, href, icon }) => (
            <Link
              key={href}
              href={href.startsWith("/") ? href : `${base}/${href}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[--border] bg-[--surface] text-sm hover:border-[--gold] hover:text-[--gold] transition-colors"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Analytics summary cards */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[--foreground-soft]">
            At a glance
          </h2>
          {/* Period selector */}
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={[
                  "px-2 py-1 text-xs rounded-lg transition-colors",
                  p === period
                    ? "bg-[--gold] text-white font-semibold"
                    : "text-[--foreground-soft] hover:text-[--foreground]",
                ].join(" ")}
              >
                {ANALYTICS_PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {statCards.map(({ label, value, href }) => (
            <Link
              key={label}
              href={href}
              className="surface-card rounded-xl p-4 hover:border-[--gold]/50 transition-colors"
            >
              <div className="text-2xl font-bold text-[--foreground]">{value.toLocaleString()}</div>
              <div className="text-xs text-[--foreground-soft] mt-1">{label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[--foreground-soft] mb-3">
          Recent activity
        </h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-[--foreground-soft]">No recent activity.</p>
        ) : (
          <ul className="space-y-2">
            {recentActivity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 text-sm py-2 border-b border-[--border] last:border-0"
              >
                <div className="w-7 h-7 rounded-full bg-[--surface-muted] flex items-center justify-center text-xs overflow-hidden flex-shrink-0">
                  {entry.actor?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.actor.avatar_url}
                      alt={entry.actor.full_name ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{entry.actor?.full_name?.charAt(0) ?? "?"}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[--foreground]">{actionLabel(entry.action)}</span>
                  {entry.actor?.full_name && (
                    <span className="text-[--foreground-soft]"> by {entry.actor.full_name}</span>
                  )}
                </div>
                <time className="text-xs text-[--foreground-soft] flex-shrink-0">
                  {timeAgo(entry.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
