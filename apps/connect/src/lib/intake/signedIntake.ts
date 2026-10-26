/**
 * Shared HMAC gate for the Google Form intake routes.
 * The sheet signs `timestamp + "." + raw body` with INTAKE_WEBHOOK_SECRET.
 */

import { NextResponse } from "next/server";
import { verifyIntakeSignature } from "@/lib/intake/googleForm";
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/v1Gate";

const MIN_SECRET_LENGTH = 32;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function readSignedIntake(
  request: Request,
  opts: { bucket: string; maxBodyChars: number; limit?: RateLimitConfig },
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const secret = process.env.INTAKE_WEBHOOK_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error("[intake] INTAKE_WEBHOOK_SECRET missing or too short");
    return { ok: false, response: fail(503, "intake_not_configured") };
  }

  const rl = await checkRateLimit(`intake-${opts.bucket}:${getClientIp(request)}`, opts.limit ?? RATE_LIMITS.mutation);
  if (!rl.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
      ),
    };
  }

  const rawBody = await request.text();
  if (rawBody.length > opts.maxBodyChars) return { ok: false, response: fail(413, "payload_too_large") };

  const authentic = verifyIntakeSignature({
    secret,
    timestamp: request.headers.get("x-intake-timestamp"),
    signature: request.headers.get("x-intake-signature"),
    body: rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!authentic) return { ok: false, response: fail(401, "unauthorized") };

  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: fail(400, "invalid_json") };
  }
}
