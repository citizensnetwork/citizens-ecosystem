/**
 * Fire-and-forget share logger.
 *
 * Records a share event against the shares source table (migration 116)
 * which feeds the contributor "shares" analytics metric. Intentionally
 * swallows every error — sharing is a UX-first action and must never be
 * blocked or interrupted by analytics. Call AFTER the share/copy succeeds.
 */
export type ShareEntityType = "event" | "place" | "contributor";

export function logShare(entityType: ShareEntityType, entityId: string): void {
  // Guard: only fire in the browser with a plausible UUID.
  if (typeof fetch !== "function" || !entityId) return;

  void fetch("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    keepalive: true,
  }).catch(() => {
    /* best-effort: ignore network/HTTP errors */
  });
}
