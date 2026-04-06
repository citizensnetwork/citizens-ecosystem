"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
        <Link href="/events" className="text-lg font-semibold tracking-tight text-black transition hover:text-(--gold)">
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
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 text-sm font-medium text-black/75 transition hover:text-black"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-(--gold-soft) text-xs font-bold uppercase text-black">
                  {displayName[0]}
                </span>
                {displayName}
                <span className="text-black/35">▾</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 z-50 mt-1 w-44 rounded-xl border bg-white py-1 shadow-lg">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-black/80 transition hover:bg-black/5"
                  >
                    My Profile
                  </Link>
                  <hr className="my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Log Out
                  </button>
                </div>
              )}
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
