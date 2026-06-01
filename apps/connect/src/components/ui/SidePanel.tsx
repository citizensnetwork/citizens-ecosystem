"use client";

// Right-side slide-in drawer used for in-context detail views
// (events, profiles, messages). Opens to ~60% width on desktop and
// full width on mobile so the underlying map/page stays visible on
// large screens. Close via the X button, backdrop click, ESC key,
// or router.back() — all of which unwind the intercepted route.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { publishPanelClosed } from "@/lib/map/panelBus";

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
  // screen readers and keyboards stay inside the drawer. We inert
  // every immediate child of <body> except this drawer itself.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawerRoot = panelRef.current?.closest("[data-sidepanel-root]") ?? null;

    // Belt-and-suspenders: before marking anything inert, sweep up any `inert`
    // a PREVIOUS panel instance may have left behind if its cleanup was skipped
    // on a fast/interrupted navigation. A leaked `inert` on the map container is
    // exactly what makes "icons not appear / events won't open / feels stuck",
    // so we tag every element we freeze and always clear tagged stragglers.
    document.querySelectorAll("[data-cc-inert-by-panel]").forEach((el) => {
      el.removeAttribute("inert");
      el.removeAttribute("data-cc-inert-by-panel");
    });

    // Only freeze siblings if we positively identified our own root — never
    // risk marking the drawer (or everything) inert when the ref isn't ready.
    const siblings = drawerRoot
      ? Array.from(document.body.children).filter(
          (el) => el !== drawerRoot && !el.hasAttribute("inert"),
        )
      : [];
    siblings.forEach((el) => {
      el.setAttribute("inert", "");
      el.setAttribute("data-cc-inert-by-panel", "");
    });

    return () => {
      document.body.style.overflow = prev;
      siblings.forEach((el) => {
        el.removeAttribute("inert");
        el.removeAttribute("data-cc-inert-by-panel");
      });
    };
  }, [panelRef]);

  // Slide the drawer out, THEN navigate — but drive the hand-off off the real
  // `transitionend` rather than a fixed 300ms timer, so a slow device can't
  // navigate mid-animation (which left the surface feeling "stuck"). A guarded
  // fallback timeout still fires if the transition never does (reduced motion,
  // the node being unmounted, `display:none`, etc.) so we never wedge.
  const animateThen = useCallback(
    (navigate: () => void) => {
      setVisible(false);
      const node = panelRef.current;
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        navigate();
      };
      if (node) {
        const onEnd = (e: TransitionEvent) => {
          if (e.target === node && e.propertyName === "transform") {
            node.removeEventListener("transitionend", onEnd);
            run();
          }
        };
        node.addEventListener("transitionend", onEnd);
      }
      // Fallback — slightly longer than the 300ms CSS transition.
      setTimeout(run, 400);
    },
    [panelRef],
  );

  // Go back one step — unwinds a single intercepted route.
  const handleBack = useCallback(() => {
    animateThen(() => {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push(fallbackHref);
      }
    });
  }, [animateThen, router, fallbackHref]);

  // Close completely — navigates directly to the fallback, discarding
  // all panel steps regardless of how deep the navigation stack is. Also
  // signals the map so any lingering inline glass-card state is cleared
  // (the two overlay surfaces must never both be open — see panelBus).
  const handleDismiss = useCallback(() => {
    publishPanelClosed();
    animateThen(() => router.push(fallbackHref));
  }, [animateThen, router, fallbackHref]);

  // Keep a single alias so ESC and backdrop still work correctly.
  const handleClose = handleBack;

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
    <div data-sidepanel-root className="fixed inset-0 z-1700">
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
        aria-labelledby="sidepanel-title"
        className={`absolute right-0 top-0 flex h-dvh w-full max-w-215 flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out md:w-[60vw] md:rounded-l-2xl md:border-l md:border-(--gold)/40 ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header strip — shows the detail title (event name, profile
            name, counterparty) with the close button on the right.
            Sticky so it stays visible while the body scrolls. Uses a
            gold bottom border to match the brand's 60/30/10 palette. */}
        <header
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-(--gold)/30 bg-white/95 px-4 pb-3 backdrop-blur-sm"
        >
          {/* Back — goes one step back in the panel stack */}
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black/70 shadow-sm ring-1 ring-black/10 transition hover:bg-(--gold-soft) hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <h2
            id="sidepanel-title"
            className="flex-1 truncate text-base font-semibold text-black"
          >
            {title ?? "Details"}
          </h2>

          {/* Dismiss — closes the panel completely, regardless of depth */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close panel"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black/70 shadow-sm ring-1 ring-black/10 transition hover:bg-(--gold-soft) hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)"
          >
            <svg
              aria-hidden="true"
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
        </header>

        {/* Body wrapper — flex column with overflow-hidden so inner
            pages (chat, long lists) can manage their own scrolling
            regions via flex-1 + overflow-y-auto. */}
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </aside>
    </div>
  );
}
