"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CalendarDays, MessageSquare, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/notifications/NotificationBell";
import ConsiderBadge from "@/components/ui/ConsiderBadge";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn";

/**
 * Global top navigation.
 *
 * Hidden on /events and / (those pages provide their own chrome /
 * full-screen map experience). On every other route this is the
 * Citizens Connect shell header — sticky, glassy, gold wordmark,
 * contextual actions on the right.
 *
 * The account menu is a Radix DropdownMenu (keyboard nav, focus
 * trap, ARIA roles for free) replacing the previous hand-rolled
 * outside-click + Escape wiring.
 */
export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
    router.refresh();
  }, [router, supabase]);

  if (pathname === "/events" || pathname === "/") {
    return null;
  }

  const displayName =
    user?.user_metadata?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/60 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/events"
          className="text-sm font-semibold tracking-tight text-[var(--gold)] transition-all active:scale-95 active:brightness-90"
        >
          Citizens Connect
        </Link>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            title="Events"
          >
            <Link href="/events?view=calendar">
              <CalendarDays className="h-4 w-4" />
              <span className="sr-only">Events</span>
            </Link>
          </Button>

          {user ? (
            <div className="flex items-center gap-2">
              <ConsiderBadge userId={user.id} />

              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                title="Messages"
              >
                <Link href="/messages">
                  <MessageSquare className="h-4 w-4" />
                  <span className="sr-only">Messages</span>
                </Link>
              </Button>

              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/15">
                <NotificationBell userId={user.id} />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-full text-sm font-medium text-black/75 transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    aria-label="Account menu"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gold-soft)] text-xs font-bold uppercase text-black">
                      {initial}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-black/40" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/profile">My Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/events/manage">My Events</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={handleLogout}
                  >
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log In</Link>
              </Button>
              <Button asChild variant="gold" size="sm">
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}