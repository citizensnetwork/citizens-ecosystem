import { createBrowserClient } from "@supabase/ssr";

// NEXT_PUBLIC_ values are inlined at build time by Next.js.
// During static prerendering, they may be unavailable — use placeholders
// so the build succeeds (no API calls happen during prerender anyway).
function _create() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-key-for-prerender",
  );
}

// Module-level singleton — one auth listener subscription per browser session
// instead of one per component mount. Avoids listener leaks on unmount.
// ReturnType is inferred from _create so generic parameters (e.g. SchemaName)
// are preserved identically to a direct createBrowserClient() call.
let _client: ReturnType<typeof _create> | undefined;

export function createClient() {
  return (_client ??= _create());
}

/** Test-only helper: clears the cached browser client so vitest cases that
 *  mutate `process.env.NEXT_PUBLIC_*` get a fresh instance. Not exported
 *  from any production entry point and a no-op outside test environments. */
export function __resetClientForTests() {
  if (process.env.NODE_ENV === "test") {
    _client = undefined;
  }
}
