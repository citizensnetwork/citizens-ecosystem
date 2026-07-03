import { Capacitor } from "@capacitor/core";
import { Share as CapShare } from "@capacitor/share";

/**
 * Share a URL using native share sheet (Capacitor) or navigator.share / clipboard fallback (web).
 * Returns true if the share dialog was opened, false if the URL was copied instead.
 *
 * `text` is an optional message body that accompanies the URL on platforms
 * that support it (WhatsApp, SMS, native share sheets).  On clipboard
 * fallback we copy the URL only — the body would be lost on paste anyway.
 */
export async function share(opts: { title: string; url: string; text?: string }): Promise<boolean> {
  // Only forward `text` when defined so call signatures match callers that
  // expect just title+url (keeps tests asserting strict argument shapes).
  const payload = opts.text === undefined
    ? { title: opts.title, url: opts.url }
    : { title: opts.title, url: opts.url, text: opts.text };

  if (Capacitor.isNativePlatform()) {
    await CapShare.share(payload);
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share(payload);
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(opts.url);
    return false;
  }

  return false;
}
