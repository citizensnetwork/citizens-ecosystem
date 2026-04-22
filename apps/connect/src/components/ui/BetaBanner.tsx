"use client";

import { useEffect, useState } from "react";

/**
 * Dismissible banner indicating the user is on a beta build.
 * Dismissal is remembered per-browser in localStorage so we don't
 * nag returning users.
 */
const STORAGE_KEY = "citizens.beta-banner.dismissed.v1";

export default function BetaBanner({ message }: { message?: string } = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
      setVisible(!dismissed);
    } catch {
      // localStorage might be blocked (private mode, Safari ITP) —
      // in that case just show the banner; users can still close it
      // for the current session.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const onDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* best-effort */
    }
  };

  return (
    <aside
      role="region"
      aria-label="Beta notice"
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-(--gold)/40 bg-(--gold-soft) px-4 py-2 text-sm text-black"
    >
      <p className="min-w-0 truncate">
        <strong className="font-semibold">Beta:</strong>{" "}
        {message ?? "You're exploring an early build of Citizens Connect. Expect rough edges — we'd love your feedback."}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md border border-black/10 bg-white/70 px-2 py-1 text-xs font-medium text-black hover:bg-white focus:outline-none focus:ring-2 focus:ring-(--gold)"
        aria-label="Dismiss beta banner"
      >
        Dismiss
      </button>
    </aside>
  );
}
