/**
 * PostgREST / Postgres when `events.lets_starter` is not on the database yet
 * (migration 202 is proposed, not applied). The public event feed must keep
 * working until Stephen applies that file.
 */
export function missingLetsColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const message = error.message || "";
  if (!/lets_starter/i.test(message)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|schema cache/i.test(message)
  );
}
