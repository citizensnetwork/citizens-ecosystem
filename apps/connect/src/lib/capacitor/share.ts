import { Capacitor } from "@capacitor/core";
import { Share as CapShare } from "@capacitor/share";

/**
 * Share a URL using native share sheet (Capacitor) or navigator.share / clipboard fallback (web).
 * Returns true if the share dialog was opened, false if the URL was copied instead.
 */
export async function share(opts: { title: string; url: string }): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    await CapShare.share({ title: opts.title, url: opts.url });
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ title: opts.title, url: opts.url });
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(opts.url);
    return false;
  }

  return false;
}
