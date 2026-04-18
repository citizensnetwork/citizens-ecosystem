"use client";

/**
 * PreferencePickerGate — client-side mounting gate for {@link PreferencePicker}.
 *
 * The picker should only surface for users who:
 *   1. Are authenticated (parent gates this — we receive `enabled`)
 *   2. Have completed the onboarding overlay (otherwise the two first-run UIs
 *      would race for attention).  Parent passes this in the `enabled` flag.
 *   3. Haven't already completed or skipped on this device (we check
 *      `shouldShowPreferencePicker` from the picker module).
 *
 * We delay the first show by ~1.2s so the user has time to take in the map
 * before being interrupted.  Without the delay it feels like an unsolicited
 * interstitial; with it, the picker reads as an opt-in surprise.
 */

import { useEffect, useState } from "react";
import PreferencePicker, { shouldShowPreferencePicker } from "./PreferencePicker";

type Props = {
  /** Parent-resolved condition: user is signed in AND onboarding is done. */
  enabled: boolean;
};

export default function PreferencePickerGate({ enabled }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!shouldShowPreferencePicker()) return;
    // Brief delay so the map renders first.  The user should *see* the
    // map for a moment and then have the picker appear — otherwise it's
    // just another login-flow modal.
    const t = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, [enabled]);

  return <PreferencePicker open={open} onClose={() => setOpen(false)} />;
}
