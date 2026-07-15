/**
 * Blanket `/api/*` rate-limit gate — the floor that guarantees no endpoint
 * ships unlimited (Vision's `api-gate.ts` pattern, generalised for any
 * Citizens app; the lesson from Wear debt #1: its `/api/*` surface launched
 * without any limiter). Individual hot routes can ADD a tighter per-route
 * `checkRateLimit` on top (Connect's pattern).
 *
 * Identity is the caller IP (Vercel's `x-forwarded-for`), split by method
 * class so a burst of reads cannot starve a legitimate write:
 *   GET/HEAD        → 240/min per IP
 *   everything else →  60/min per IP
 */
import { checkRateLimit, type RateLimitConfig } from './rate-limit';

export const GATE_READ: RateLimitConfig = { limit: 240, windowMs: 60_000 };
export const GATE_WRITE: RateLimitConfig = { limit: 60, windowMs: 60_000 };

interface HeaderCarrier {
  headers: { get(name: string): string | null };
}

/** Best-effort client IP: first `x-forwarded-for` hop, then `x-real-ip`. */
export function clientIp(request: HeaderCarrier): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface GateResult {
  limited: boolean;
  /** Seconds the caller should wait before retrying (only when limited). */
  retryAfterSec: number;
}

/**
 * Rate-check an API request. Never throws — a limiter failure must not take
 * the API down with it (the limiter itself already degrades Upstash→memory).
 */
export async function gateApiRequest(
  request: HeaderCarrier & { method: string },
): Promise<GateResult> {
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  const config = isRead ? GATE_READ : GATE_WRITE;
  const identifier = `gate:${clientIp(request)}:${isRead ? 'r' : 'w'}`;

  const result = await checkRateLimit(identifier, config);
  return {
    limited: !result.success,
    retryAfterSec: result.success ? 0 : Math.max(1, Math.ceil(result.resetMs / 1000)),
  };
}
