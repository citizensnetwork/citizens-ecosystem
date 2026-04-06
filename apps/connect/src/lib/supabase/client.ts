import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // NEXT_PUBLIC_ values are inlined at build time by Next.js.
  // During static prerendering, they may be unavailable — use placeholders
  // so the build succeeds (no API calls happen during prerender anyway).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key-for-prerender";

  return createBrowserClient(url, key);
}
