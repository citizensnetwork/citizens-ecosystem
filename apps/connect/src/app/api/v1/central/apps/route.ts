/**
 * GET /api/v1/central/apps
 * ----------------------------------------------------------------
 * The Central app registry: one entry per ecosystem app (name, accent
 * colour, explanation, visit link, content kinds). The card kickers
 * and the Crown's roll-out panels are drawn from it, so no app is
 * named in the feed's own code.
 *
 * Response: { data: CentralApp[], meta: { status: "ok", source: "transitional" } }
 *
 * SOURCE. Transitional: src/lib/central/registry.ts, the same rows as
 * the seed of migration 203 (drafted, not applied). Once that
 * migration is applied this route reads `public.central_apps()`.
 */

import { NextResponse } from "next/server";
import { TRANSITIONAL_APPS } from "@/lib/central/registry";
import { gateV1 } from "@/lib/v1Gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-central-apps" });
  if (gate.deny) return gate.deny;

  return NextResponse.json(
    {
      data: TRANSITIONAL_APPS.filter((app) => app.status !== "paused"),
      meta: { status: "ok", source: "transitional" },
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
