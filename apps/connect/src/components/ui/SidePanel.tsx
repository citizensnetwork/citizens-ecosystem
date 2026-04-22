"use client";

// Right-side slide-in drawer used for in-context detail views
// (events, profiles, messages). Opens to ~60% width on desktop and
// full width on mobile so the underlying map/page stays visible on
// large screens. Close via the X button, backdrop click, ESC key,
// or router.back() — all of which unwind the intercepted route.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface SidePanelProps {
  /** Accessible label for the panel (usually the detail title). */
  title?: string;
  /** Where to go if there is no history to pop (deep-link fallback). */
  fallbackHref?: string;
  children: ReactNode;
}

/**
 * Drawer wrapper for intercepted detail routes.
 *
 * - Desktop (md+): 60vw wide, max 860px, full-height, slides from right.
 * - Mobile: full width, full height.
 * - Backdrop / X / ESC dismiss the drawer via router.back() so the URL
 *   unwinds to the previous map/list route.
 * - If no history exists (direct share-link load of an intercept would
 *   still fall through to the underlying page), pushes `fallbackHref`.
 */
export default function SidePanel({
  title,
  fallbackHref = "/events",
  children,
}: SidePanelProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(visible);

  // Trigger the enter animation on the next frame so the initial
  // `translate-x-full` state is applied before transitioning in.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Lock body scroll and mark siblings inert while mounted so
  // screen readers and keyboards stay inside the drawer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const main = document.querySelector("main");
    const nav = document.querySelector("nav");
    main?.setAttribute("inert", "");
    nav?.setAttribute("inert", "");
    return () => {
      document.body.style.overflow = prev;
      main?.removeAttribute("inert");
      nav?.removeAttribute("inert");
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    // Match the CSS transition duration (300ms). Small slack so the
    // final frame of the slide-out renders before unmount.
    window.setTimeout(() => {
      // Always prefer router.back() so the intercepted route unwinds;
      // fallbackHref is only used when back() would leave the app.
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push(fallbackHref);
      }
    }, 300);
  }, [router, fallbackHref]);

  // ESC closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-[1700]">
      {/* Backdrop — full opacity on mobile (covers the whole screen),
          translucent on desktop so the exposed 40vw of map stays
          readable and the drawer reads as an overlay, not a modal. */}
      <div
        role="presentation"
        onClick={handleClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 md:bg-black/10 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Details"}
        className={`absolute right-0 top-0 flex h-[100dvh] w-full max-w-[860px] flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out md:w-[60vw] md:rounded-l-2xl md:border-l md:border-(--gold)/40 ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button — floats over content so inner pages don't
            need to reserve space for it. Respects iOS safe-area. */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close panel"
          style={{
            top: "max(0.75rem, env(safe-area-inset-top))",
          }}
          className="absolute right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black/70 shadow-md ring-1 ring-black/5 backdrop-blur-sm transition hover:bg-white hover:text-(--gold) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Body wrapper — flex column with overflow-hidden so inner
            pages (chat, long lists) can manage their own scrolling
            regions via flex-1 + overflow-y-auto. */}
        <div className="flex flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
          {children}
        </div>
      </aside>
    </div>
  );
}
