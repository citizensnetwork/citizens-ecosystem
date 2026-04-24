"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Standalone log-out button for the Profile page.
 * Mirrors the behaviour of the burger-menu / navbar logout:
 * signs the user out then redirects to the landing page.
 */
export default function ProfileLogOutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }, [router, supabase]);

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-xl border border-black/10 bg-white/50 px-5 py-2.5 text-sm font-medium text-black/70 transition hover:bg-white hover:text-black hover:shadow-sm"
    >
      Log Out
    </button>
  );
}
