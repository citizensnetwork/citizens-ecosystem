"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Map as MapIcon,
  CalendarDays,
  Sparkles,
  MessageCircle,
  Bell,
  LayoutDashboard,
  Settings as SettingsIcon,
  Crown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LogIn,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import MessagesPanel from "@/components/messaging/MessagesPanel";
import {
  OPEN_MESSAGE_THREAD_EVENT,
  type OpenMessageThreadDetail,
} from "@/lib/messaging/messagePanelBus";

/**
 * Global app chrome — the Figma "Kingdom Connect" navigation.
 *
 * - Desktop: a sticky glass sidebar that collapses to a 72px icon-only rail
 *   (never disappears). Expanded (16rem) it shows labels, the user mini-profile
 *   text, and the contributor CTA; collapsed it shows centred icons with hover
 *   tooltips and corner badge dots, hiding the labels/CTA/profile text. A
 *   chevron toggle sits at the bottom. Content is padded via the
 *   `--cc-sidebar-w` CSS var so nothing hides behind it. Founder choice (matches
 *   the adjusted Figma `Root.tsx`): "sticky icon rail, not fold-away."
 * - Mobile: a persistent frosted bottom tab bar (Discover / Kingdom / Messages
 *   / Alerts / Dashboard).
 *
 * Auth-aware, with live unread badges for messages + notifications. Preserves
 * the existing in-app message-thread slide-over (OPEN_MESSAGE_THREAD_EVENT bus)
 * so deep links from elsewhere keep working.
 *
 * Hidden on the landing + auth screens, which provide their own full-bleed
 * experience.
 */

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_COLLAPSED_WIDTH = "4.5rem"; // 72px icon rail
const COLLAPSE_KEY = "cc-sidebar-collapsed";

type NavItem = {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  short: string;
  icon: typeof MapIcon;
  /** Unread badge source. */
  badge?: "messages" | "notifs";
  /** Desktop sidebar only — omitted from the 5-slot mobile bar. */
  desktopOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/events", label: "Discover", short: "Discover", icon: MapIcon },
  { href: "/events?view=calendar", label: "Calendar", short: "Calendar", icon: CalendarDays, desktopOnly: true },
  { href: "/community", label: "Kingdom Projects", short: "Kingdom", icon: Sparkles },
  { href: "/messages", label: "Messages", short: "Messages", icon: MessageCircle, badge: "messages" },
  { href: "/notifications", label: "Notifications", short: "Alerts", icon: Bell, badge: "notifs" },
  { href: "/dashboard", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", short: "Settings", icon: SettingsIcon, desktopOnly: true },
];

/** Routes that render their own full-bleed chrome — no shell. */
function isBareRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/auth")
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/events") return pathname === "/events";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("Account");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // In-app message thread slide-over (preserves the existing bus).
  const [messagesPanelOpen, setMessagesPanelOpen] = useState(false);
  const [conversationIdToOpen, setConversationIdToOpen] = useState<string | null>(null);

  const bare = isBareRoute(pathname);

  /* ── Sidebar collapse state (persisted) ── */
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Drive the content offset via a CSS var so the server-rendered content
  // wrapper can pad itself without sharing React state. On bare routes the
  // offset is 0; collapsed leaves room for the 72px rail; mobile is handled by
  // the `md:` prefix on the consumer.
  useEffect(() => {
    const w = bare ? "0px" : collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
    document.documentElement.style.setProperty("--cc-sidebar-w", w);
  }, [bare, collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /* ── Auth + profile ── */
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setUser(user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setDisplayName("Account");
      setAvatarUrl(null);
      return;
    }
    const metaName =
      (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
      user.email?.split("@")[0] ??
      "Account";
    setDisplayName(metaName);
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null; avatar_url: string | null }>()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.full_name) setDisplayName(data.full_name.split(" ")[0]);
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  /* ── Unread counts (notifications + messages) ── */
  const refreshCounts = useCallback(async () => {
    if (!user) {
      setUnreadMessages(0);
      setUnreadNotifs(0);
      return;
    }
    const [notifRes, convRes] = await Promise.all([
      fetch("/api/notifications").catch(() => null),
      fetch("/api/conversations").catch(() => null),
    ]);
    if (notifRes?.ok) {
      const { notifications } = await notifRes.json();
      setUnreadNotifs(
        (notifications ?? []).filter((n: { read: boolean }) => !n.read).length
      );
    }
    if (convRes?.ok) {
      const { conversations } = await convRes.json();
      setUnreadMessages(
        (conversations ?? []).reduce(
          (acc: number, c: { unread_count?: number }) => acc + (c.unread_count ?? 0),
          0
        )
      );
    }
  }, [user]);

  // Refresh on login + whenever the route changes (cheap, keeps badges fresh
  // after visiting Messages / Notifications). Realtime notification pushes are
  // owned by NotificationBell; this is the chrome's lightweight mirror.
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts, pathname]);

  /* ── Message-thread slide-over bus ── */
  useEffect(() => {
    function handleOpenThread(event: Event) {
      const { conversationId } =
        (event as CustomEvent<OpenMessageThreadDetail>).detail ?? {};
      if (!conversationId) return;
      setConversationIdToOpen(conversationId);
      setMessagesPanelOpen(true);
    }
    window.addEventListener(OPEN_MESSAGE_THREAD_EVENT, handleOpenThread);
    return () => window.removeEventListener(OPEN_MESSAGE_THREAD_EVENT, handleOpenThread);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
    router.refresh();
  }, [router, supabase]);

  const badgeFor = useCallback(
    (item: NavItem) =>
      item.badge === "messages" ? unreadMessages : item.badge === "notifs" ? unreadNotifs : 0,
    [unreadMessages, unreadNotifs]
  );

  if (bare) {
    // Still honour the message slide-over bus on bare routes if it fires.
    return user && messagesPanelOpen ? (
      <MessagesPanel
        userId={user.id}
        conversationIdToOpen={conversationIdToOpen}
        onUnreadChange={setUnreadMessages}
        onClose={() => {
          setConversationIdToOpen(null);
          setMessagesPanelOpen(false);
        }}
      />
    ) : null;
  }

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      {/* ── Desktop sidebar (sticky; collapses to a 72px icon rail) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden flex-col glass border-r border-white/40 transition-all duration-300 md:flex ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        {/* Logo */}
        <div
          className={`flex items-center border-b border-white/30 py-5 ${
            collapsed ? "justify-center px-2" : "px-5"
          }`}
        >
          <Link
            href="/events"
            title={collapsed ? "Citizens Connect" : undefined}
            className={`flex items-center ${collapsed ? "" : "gap-3"}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gold-gradient shadow-lg">
              <Crown size={18} className="text-white" strokeWidth={2.5} />
            </span>
            {!collapsed && (
              <span>
                <span className="block font-display text-sm font-bold leading-none text-foreground">
                  Citizens
                </span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--gold)">
                  Connect
                </span>
              </span>
            )}
          </Link>
        </div>

        {/* User mini-profile */}
        <div className={`border-b border-white/20 ${collapsed ? "px-2 py-3" : "px-4 py-4"}`}>
          {user ? (
            <Link
              href="/profile"
              title={collapsed ? displayName : undefined}
              className={`flex items-center rounded-xl p-2 transition hover:bg-(--gold-soft)/60 ${
                collapsed ? "justify-center" : "gap-3"
              }`}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-(--gold)/40"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--gold-soft) text-xs font-bold uppercase text-black ring-2 ring-(--gold)/40">
                  {initial}
                </span>
              )}
              {!collapsed && (
                <span className="min-w-0 text-left">
                  <span className="block truncate text-xs font-semibold leading-tight text-foreground">
                    {displayName}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">Citizen</span>
                </span>
              )}
            </Link>
          ) : collapsed ? (
            <Link
              href="/login"
              title="Log in"
              className="flex justify-center rounded-xl p-2 transition hover:bg-(--gold-soft)/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--gold-soft) text-black ring-2 ring-(--gold)/40">
                <LogIn size={16} />
              </span>
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link
                href="/login"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-semibold text-foreground/70 transition hover:text-foreground"
              >
                <LogIn size={13} /> Log In
              </Link>
              <Link
                href="/signup"
                className="flex flex-1 items-center justify-center rounded-xl gold-gradient py-2 text-xs font-bold text-white shadow transition active:scale-95"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 space-y-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const badge = badgeFor(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`relative flex items-center rounded-xl text-sm transition ${
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-2.5"
                } ${
                  active
                    ? "bg-(--gold)/15 font-semibold text-(--gold-dark)"
                    : "text-foreground/60 hover:bg-(--gold-soft)/50 hover:text-foreground"
                }`}
              >
                {active && !collapsed && (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-(--gold)" />
                )}
                <span className="relative shrink-0">
                  <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
                  {badge > 0 && collapsed && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-(--gold) px-0.5 text-[8px] font-bold text-black">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span>{item.label}</span>
                    {badge > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-(--gold) px-1 text-[10px] font-bold text-black">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer: contributor CTA (expanded only) / logout */}
        <div className={`border-t border-white/20 ${collapsed ? "px-2 py-3" : "px-4 py-4"}`}>
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              title={collapsed ? "Log out" : undefined}
              className={`flex w-full items-center justify-center rounded-xl border border-border py-2.5 text-xs font-semibold text-foreground/60 transition hover:text-foreground ${
                collapsed ? "" : "gap-2"
              }`}
            >
              <LogOut size={14} />
              {!collapsed && "Log Out"}
            </button>
          ) : (
            !collapsed && (
              <div className="rounded-xl bg-gradient-to-br from-(--gold-soft) to-(--gold-light)/50 p-4">
                <p className="mb-1 font-display text-xs font-bold text-(--gold-dark)">
                  Become a Contributor
                </p>
                <p className="mb-3 text-[10px] text-(--gold-dark)/80">
                  Create events, places and lead your community.
                </p>
                <Link
                  href="/contributor/apply"
                  className="block rounded-lg bg-(--gold) py-1.5 text-center text-[10px] font-bold text-white transition hover:bg-(--gold-dark)"
                >
                  Apply Now
                </Link>
              </div>
            )
          )}
        </div>

        {/* Collapse toggle (bottom, per Figma) */}
        <div className={`border-t border-white/20 ${collapsed ? "p-2" : "px-4 py-3"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`flex w-full items-center justify-center rounded-xl text-muted-foreground transition hover:bg-(--gold-soft)/60 hover:text-foreground ${
              collapsed ? "py-2" : "gap-2 py-2 text-xs font-medium"
            }`}
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={14} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav (persistent) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        <div className="glass border-t border-white/40 px-2 shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <div className="flex h-16 items-center justify-around">
            {NAV.filter((i) => !i.desktopOnly).map((item) => {
              const active = isActive(pathname, item.href);
              const badge = badgeFor(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition ${
                    active ? "text-(--gold)" : "text-foreground/40 hover:text-foreground/70"
                  }`}
                >
                  {active && (
                    <span className="absolute -top-0.5 h-0.5 w-5 rounded-full bg-(--gold)" />
                  )}
                  <span className="relative">
                    <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                    {badge > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--gold) px-1 text-[9px] font-bold text-black">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-medium">{item.short}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* In-app message thread slide-over (bus-driven) */}
      {user && messagesPanelOpen && (
        <MessagesPanel
          userId={user.id}
          conversationIdToOpen={conversationIdToOpen}
          onUnreadChange={setUnreadMessages}
          onClose={() => {
            setConversationIdToOpen(null);
            setMessagesPanelOpen(false);
          }}
        />
      )}
    </>
  );
}
