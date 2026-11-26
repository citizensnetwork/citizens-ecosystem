/**
 * POST /api/csp-report — where browsers send Content-Security-Policy violations (QA fix plan PR F3, 2026-11-25).
 *
 * The page carries a strict `Content-Security-Policy-Report-Only` header (next.config.ts) for a week before it is
 * enforced (founder, 2026-11-25): what it WOULD block arrives here, so the policy can be fixed before anything breaks.
 *
 * Public by nature (any visitor's browser posts here, with no session), so it is defensive: rate-limited per IP,
 * the body capped at 16 KB and read no further, the report reduced by @citizens/utils to directive, blocked URL and
 * page (origin and path, never a query string, which can carry a sign-in code), and nothing stored. Each violation
 * is one log line, `[csp-report] {...}`, readable in Vercel's runtime logs. Always 204 (or 413 / 429): a browser
 * does nothing with the answer.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, CSP_REPORT_LIMIT, CSP_REPORT_MAX_BYTES, parseCspReports, readBodyCapped } from "@citizens/utils";

const done = (status = 204) => new NextResponse(null, { status });

export async function POST(request: NextRequest) {
  const rl = await checkRateLimit(`csp-report:${clientIp(request)}`, CSP_REPORT_LIMIT);
  if (!rl.success) return done(429);

  const body = await readBodyCapped(request, CSP_REPORT_MAX_BYTES);
  if (body === null) return done(413);

  for (const violation of parseCspReports(body, request.headers.get("content-type"))) {
    console.warn(`[csp-report] ${JSON.stringify(violation)}`);
  }
  return done();
}
