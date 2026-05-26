"use client";

// Dev-only query-param override for the contributor theme tint.
// Reads `?contributorTheme=off` (or `=on`) from the URL and toggles the
// nearest `[data-contributor-ui]` ancestor accordingly. Persists for the
// current tab via sessionStorage so refresh/back-nav keeps the choice.
//
// Stage B item 3 of docs/plans/contributor-dashboard.md.

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "cc:contributorTheme";

export default function ContributorThemeOverride() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const paramRaw = searchParams.get("contributorTheme");
    const param = paramRaw ? paramRaw.toLowerCase() : null;

    let desired: "on" | "off" | null = null;
    if (param === "off" || param === "on") {
      desired = param;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, param);
      } catch {
        // sessionStorage may be disabled — ignore.
      }
    } else {
      try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        if (stored === "off" || stored === "on") desired = stored;
      } catch {
        // ignore
      }
    }

    if (!desired) return;

    // Find the nearest data-contributor-ui ancestor (or any element with
    // that attribute on the page). We toggle by removing/restoring it.
    const targets = document.querySelectorAll<HTMLElement>("[data-contributor-ui], [data-contributor-ui-target]");
    targets.forEach((el) => {
      if (desired === "off") {
        // Stash the original attribute so we can restore it.
        if (el.hasAttribute("data-contributor-ui")) {
          el.setAttribute("data-contributor-ui-target", "");
          el.removeAttribute("data-contributor-ui");
        }
      } else {
        if (el.hasAttribute("data-contributor-ui-target")) {
          el.setAttribute("data-contributor-ui", "");
          el.removeAttribute("data-contributor-ui-target");
        }
      }
    });
  }, [searchParams]);

  return null;
}
