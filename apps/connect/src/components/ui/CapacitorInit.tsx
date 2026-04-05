"use client";

import { useEffect } from "react";
import { initCapacitor } from "@/lib/capacitor/init";

/** Invisible component that initializes Capacitor plugins on mount. */
export default function CapacitorInit() {
  useEffect(() => {
    initCapacitor();
  }, []);
  return null;
}
