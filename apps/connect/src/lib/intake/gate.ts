/**
 * The shared front door of the Google Form routes (`/api/intake/google-form` and its `/status` poll): the same four
 * checks, in the same order, so the two can never drift apart.
 *
 *   1. no secret configured (or too short)  → 503, fail closed
 *   2. per-IP rate limit                     → 429
 *   3. oversize body                         → 413
 *   4. HMAC-SHA256(secret, `${ts}.${rawBody}`) within ±300 s → anything else is a bare 401
 *
 * The signature covers the exact bytes sent, so the raw body is read once here and handed back.
 */

import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/v1Gate";
import { verifyIntakeSignature } from "@/lib/intake/googleForm";

const MIN_SECRET_LENGTH = 32;

export type IntakeGate = { ok: true; rawBody: string } | { ok: false; response: NextResponse };

export async function gateIntakeRequest(
  request: Request,
  opts: { rateKey: string; logTag: string; maxBodyChars: number },
): Promise<IntakeGate> {
  const secret = process.env.INTAKE_WEBHOOK_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error(`[${opts.logTag}] INTAKE_WEBHOOK_SECRET missing or too short`);
    return { ok: false, response: NextResponse.json({ error: "intake_not_configured" }, { status: 503 }) };
  }

  const rl = await checkRateLimit(`${opts.rateKey}:${getClientIp(request)}`, RATE_LIMITS.mutation);
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
  if (rawBody.length > opts.maxBodyChars) {
    return { ok: false, response: NextResponse.json({ error: "payload_too_large" }, { status: 413 }) };
  }

  const authentic = verifyIntakeSignature({
    secret,
    timestamp: request.headers.get("x-intake-timestamp"),
    signature: request.headers.get("x-intake-signature"),
    body: rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!authentic) return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  return { ok: true, rawBody };
}
