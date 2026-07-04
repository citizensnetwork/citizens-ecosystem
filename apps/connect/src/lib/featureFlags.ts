/**
 * Feature flags — environment-driven on/off switches for
 * beta features. Defaults are safe (off) in production unless
 * explicitly enabled via NEXT_PUBLIC_* env vars.
 *
 * Note on semantics: `NEXT_PUBLIC_*` env vars are inlined at build
 * time for client bundles, so toggling a flag requires redeploying.
 * On the server we re-read `process.env` per import, so middleware
 * or RSC changes take effect on process restart.
 *
 * Keep this file tree-shakeable: no side effects, no imports of
 * app code. Safe to import from both server and client components.
 */

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "on", "yes", "enabled"].includes(v)) return true;
  if (["0", "false", "off", "no", "disabled"].includes(v)) return false;
  return fallback;
}

export const FEATURE_FLAGS = {
  /** AI-assisted semantic search on /events. */
  BETA_AI_SEARCH: parseBool(process.env.NEXT_PUBLIC_BETA_AI_SEARCH, false),
  /** Hidden easter-egg experiences across the app. */
  BETA_EASTER_EGGS: parseBool(process.env.NEXT_PUBLIC_BETA_EASTER_EGGS, false),
  /** Live-location sharing during active events. */
  BETA_LIVE_LOCATION: parseBool(
    process.env.NEXT_PUBLIC_BETA_LIVE_LOCATION,
    false,
  ),
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
