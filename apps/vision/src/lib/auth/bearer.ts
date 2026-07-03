/**
 * `Authorization: Bearer <token>` parsing — the cross-origin auth primitive.
 *
 * The standalone HTML frontend (ecosystem Step 4c) holds its Supabase session
 * in `localStorage` and may be served from a different origin than this API,
 * so cookies never travel with its requests; the access token arrives in the
 * Authorization header instead (Connect memory
 * `static-frontend-cross-origin-auth`; same primitive as Wear's
 * `route-context.ts`).
 */
export function bearerTokenFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}
