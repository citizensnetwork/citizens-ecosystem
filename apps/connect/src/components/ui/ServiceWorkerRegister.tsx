"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` in production browsers. No-op on dev, on
 * iOS/Android native shells, or when the browser lacks Service
 * Workers.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // Capacitor wraps the app in a WKWebView / Chromium shell that
    // already owns caching — skip SW there.
    const isCapacitor =
      // @ts-expect-error: injected by Capacitor bridge at runtime
      typeof window.Capacitor !== "undefined";
    if (isCapacitor) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[sw] register failed", err);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
