/**
 * Shared request-gating helper for the public /api/v1/* surface.
 *
 * Returns a rate-limit decision that combines:
 *   1. Optional API key (higher tier, scoped to key ID).
 *   2. Anonymous IP bucket (tight tier).
 *   3. Optional secondary identifier (e.g. resource slug) so an
 *      attacker with rotating IPs can't DoS a single contributor.
 *
 * When Upstash env vars are configured the limiter uses Redis;
 * otherwise it transparently falls back to the in-memory limiter.
 *
 * All callers should prefer this over reaching into the raw limiter
 * directly so we only have one place to reason about abuse protection.
 */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  resolveApiKey,
  type ApiKeyContext,
  DEFAULT_API_KEY_LIMIT,
  ANON_V1_LIMIT,
} from "@/lib/apiKey";

export interface V1GateOptions {
  /** Bucket name for metrics / logs (e.g. "v1-contributors"). */
  bucket: string;
  /**
   * Optional secondary identifier (e.g. contributor slug) for a
   * resource-scoped cap that applies on top of the IP cap. Protects a
   * single resource from being DoS'd by a rotating-IP attacker.
   */
  resourceId?: string;
  /** Per-resource cap (only used when resourceId is set). */
  resourceLimitPerMinute?: number;
}

export interface V1GateResult {
  /** If non-null, the caller passes through with this context. */
  key: ApiKeyContext | null;
  /** If set, return this response immediately (429). */
  deny?: NextResponse;
  /** Bucket identifier (IP or key:id) used; safe for logs. */
  identifier: string;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function denyResponse(resetMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": Math.ceil(resetMs / 1000).toString() },
    },
  );
}

export async function gateV1(
  req: Request,
  opts: V1GateOptions,
): Promise<V1GateResult> {
  const key = await resolveApiKey(req);

  // Primary quota: key-scoped if authenticated, else IP-scoped.
  const primaryLimit = key
    ? (key.rate_limit_per_minute ?? DEFAULT_API_KEY_LIMIT)
    : ANON_V1_LIMIT;
  const primaryId = key
    ? `${opts.bucket}:key:${key.id}`
    : `${opts.bucket}:ip:${getClientIp(req)}`;

  const primary = await checkRateLimit(primaryId, {
    limit: primaryLimit,
    windowMs: 60_000,
  });
  if (!primary.success) {
    return { key, identifier: primaryId, deny: denyResponse(primary.resetMs) };
  }

  // Secondary resource-scoped quota — only applies when caller didn't
  // present a key. Gives every resource breathing room even under a
  // rotating-IP DoS. 120/min by default — well above legitimate polling.
  if (!key && opts.resourceId) {
    // Normalise so `/BobBuilder` and `/bobbuilder` share one bucket
    // (Architect audit M3). Slugs are treated as canonical lowercase.
    const normalised = opts.resourceId.toLowerCase();
    const resId = `${opts.bucket}:res:${normalised}`;
    const resLimit = opts.resourceLimitPerMinute ?? 120;
    const secondary = await checkRateLimit(resId, {
      limit: resLimit,
      windowMs: 60_000,
    });
    if (!secondary.success) {
      return {
        key,
        identifier: primaryId,
        deny: denyResponse(secondary.resetMs),
      };
    }
  }

  return { key, identifier: primaryId };
}
