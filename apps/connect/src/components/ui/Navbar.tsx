"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import NotificationBell from "@/components/notifications/NotificationBell";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on click outside or Escape key
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen, closeMenu]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const displayName =
    user?.user_metadata?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Account";

  if (pathname === "/events") {
    return null;
  }

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/events" className="text-lg font-semibold tracking-tight text-(--gold) transition-all active:scale-95 active:brightness-90">
          Citizens Connect
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/events?view=calendar"
            className="text-sm text-black/65 transition hover:text-black"
          >
            Events
          </Link>

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/messages"
                className="flex h-8 w-8 items-center justify-center rounded-full text-black/60 transition hover:bg-black/5 hover:text-black"
                title="Messages"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </Link>
              <NotificationBell userId={user.id} />
              <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                className="flex items-center gap-1.5 text-sm font-medium text-black/75 transition hover:text-black"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-(--gold-soft) text-xs font-bold uppercase text-black">
                  {displayName[0]}
                </span>
                {displayName}
                <span className="text-black/35">▾</span>
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 z-50 mt-1 w-44 rounded-xl border bg-white py-1 shadow-lg">
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-black/80 transition hover:bg-black/5"
                  >
                    My Profile
                  </Link>
                  <hr className="my-1" />
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Log Out
                  </button>
                </div>
              )}
              </div>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-black/65 transition hover:text-black"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-(--gold) px-3 py-1.5 text-sm font-medium text-black transition hover:brightness-105"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
