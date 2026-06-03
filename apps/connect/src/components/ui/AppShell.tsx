"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Map as MapIcon,
  Sparkles,
  MessageCircle,
  Bell,
  LayoutDashboard,
  Settings as SettingsIcon,
  Crown,
  PanelLeftClose,
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
 * - Desktop: a collapsible glass sidebar. Expanded it sits to the left of the
 *   content (content is padded via the `--cc-sidebar-w` CSS var so nothing
 *   hides behind it); collapsed it folds away entirely, leaving only the crown
 *   logo button top-left to reopen it. Founder choice: "collapsible, not
 *   persistent — draw into the Citizens Connect icon on the top left."
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
  // wrapper can pad itself without sharing React state. On bare routes (or
  // mobile, handled by the `md:` prefix on the consumer) the offset is 0.
  useEffect(() => {
    const w = bare || collapsed ? "0px" : SIDEBAR_WIDTH;
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
      {/* ── Reopen crown (desktop, only when collapsed) ── */}
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Open navigation"
          className="fixed left-3 top-3 z-50 hidden h-11 w-11 items-center justify-center rounded-2xl gold-gradient shadow-lg transition active:scale-95 md:flex"
        >
          <Crown size={20} className="text-white" strokeWidth={2.5} />
        </button>
      )}

      {/* ── Desktop sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden w-64 flex-col glass border-r border-white/40 transition-transform duration-300 md:flex ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        {/* Logo + collapse */}
        <div className="flex items-center justify-between border-b border-white/30 px-5 py-5">
          <Link href="/events" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl gold-gradient shadow-lg">
              <Crown size={18} className="text-white" strokeWidth={2.5} />
            </span>
            <span>
              <span className="block font-display text-sm font-bold leading-none text-foreground">
                Citizens
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--gold)">
                Connect
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse navigation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-black/5 hover:text-foreground"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        {/* User mini-profile */}
        <div className="border-b border-white/20 px-4 py-4">
          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-(--gold-soft)/60"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-(--gold)/40"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--gold-soft) text-xs font-bold uppercase text-black ring-2 ring-(--gold)/40">
                  {initial}
                </span>
              )}
              <span className="min-w-0 text-left">
                <span className="block truncate text-xs font-semibold leading-tight text-foreground">
                  {displayName}
                </span>
                <span className="block text-[10px] text-muted-foreground">Citizen</span>
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
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const badge = badgeFor(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition ${
                  active
                    ? "bg-(--gold)/15 font-semibold text-(--gold-dark)"
                    : "text-foreground/60 hover:bg-(--gold-soft)/50 hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-(--gold)" />
                )}
                <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
                <span>{item.label}</span>
                {badge > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-(--gold) px-1 text-[10px] font-bold text-black">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer CTA / logout */}
        <div className="border-t border-white/20 px-4 py-4">
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-semibold text-foreground/60 transition hover:text-foreground"
            >
              <LogOut size={14} /> Log Out
            </button>
          ) : (
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
          )}
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
