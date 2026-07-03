// Edge Function helper: notification preference filtering.
//
// The `notification_prefs` column on `profiles` is a jsonb object with
// boolean values keyed by notification category (see migration 049).
// Missing keys default to `true` (opt-out model — we only drop if the
// user has explicitly flipped a toggle off).
//
// Cancellation notices (`event_cancelled`) are delivered regardless of
// preferences: they are safety-critical for RSVPed users.

export type NotificationPrefKey =
  | "friends_activity"
  | "event_reminders"
  | "contributor_updates"
  | "announcements"
  | "weekly_digest";

export const ALWAYS_DELIVER = new Set<string>([
  "event_cancelled",
]);

type ProfileRow = {
  id: string;
  notification_prefs?: Record<string, unknown> | null;
};

/**
 * Returns true when the user wants notifications of the given type.
 * Unknown users (undefined) and unknown prefs (missing keys) default to
 * `true` so existing rows pre-migration keep working.
 */
export function prefEnabled(
  profile: ProfileRow | null | undefined,
  key: NotificationPrefKey,
): boolean {
  if (!profile) return true;
  const v = profile.notification_prefs?.[key];
  if (v === false) return false;
  return true;
}

/**
 * Filter a list of user ids down to those who want notifications of
 * the given preference key. Fetches profiles in one round-trip.
 *
 * Pass through any user id whose profile row cannot be loaded — we
 * prefer to over-deliver than silently drop when the DB is unavailable.
 */
export async function filterUserIdsByPref(
  // Uses duck-typed client so unit tests can pass a stub without pulling in
  // the full Supabase client type from Deno.
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, values: string[]) => Promise<{
          data: ProfileRow[] | null;
          error: unknown;
        }>;
      };
    };
  },
  userIds: string[],
  key: NotificationPrefKey,
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const allowed = new Set(userIds);
  // Fetch in batches of 500 to stay under PostgREST URL limits.
  for (let i = 0; i < userIds.length; i += 500) {
    const batch = userIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, notification_prefs")
      .in("id", batch);
    if (error) {
      // Fail open — don't silently drop notifications on a read error.
      console.error("[prefs] batch filter error", { key, error });
      continue;
    }
    for (const row of data ?? []) {
      if (!prefEnabled(row, key)) {
        allowed.delete(row.id);
      }
    }
  }
  return [...allowed];
}
