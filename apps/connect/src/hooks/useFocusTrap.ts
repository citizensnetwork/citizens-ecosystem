"use client";

import { useEffect, useRef } from "react";

/**
 * Traps keyboard focus within a container when active.
 * Returns a ref to attach to the container element.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    // Remember where focus was before the trap
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the container.
    // preventScroll: true prevents the browser from scrolling to bring
    // an off-screen (CSS-transformed) element into view, which would cause
    // the entire page to jerk down when opening a slide-up panel.
    const focusable = getFocusableElements(containerRef.current);
    if (focusable.length > 0) {
      (focusable[0] as HTMLElement).focus({ preventScroll: true });
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab" && containerRef.current) {
        const focusable = getFocusableElements(containerRef.current);
        if (focusable.length === 0) return;

        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus when trap is deactivated
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [active]);

  return containerRef;
}

function getFocusableElements(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
}
