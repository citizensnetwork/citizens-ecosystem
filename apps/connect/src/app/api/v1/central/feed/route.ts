/**
 * GET /api/v1/central/feed
 * ----------------------------------------------------------------
 * Today's edition of the Central feed: one finite, ordered stream of
 * cards, the same for everyone in the same coarse place on the same
 * day. Guide: docs/central/CENTRAL_FEED_GUIDE.md (sections 5 and 10).
 *
 * Query params (all optional):
 *   near    - "lat,lng", rounded to 1 decimal by the client (a cell of
 *             about 11 km). Rounded again here. Never stored, never
 *             logged. Anything malformed means "no place".
 *   cursor  - the previous page's `nextCursor`.
 *   limit   - 1..24, default 12.
 *
 * Response:
 *   { data: { edition: { day, cell, size }, lead: { encouragement },
 *             items: FeedItem[], nextCursor, caughtUp, nextEditionAt },
 *     meta: { status: "ok" | "partial", source: "connect-live" } }
 *
 * The feed is FINITE: the page holding the last card says
 * `caughtUp: true` and `nextCursor: null`. There is nothing after it
 * until `nextEditionAt`.
 *
 * SOURCE. Until the `central` tables exist (migrations 203 to 205 are
 * drafted, not applied) the cards come from Connect's own public
 * content, read live (src/lib/central/connectSource.ts). Nothing is
 * written, no service_role is used, and no sample content is ever
 * served: with nothing to show the answer is an empty, caught-up page.
 *
 * Errors: 400 invalid_cursor, 409 edition_changed (start again without
 * a cursor), 429 from the gate, 503 feed_unavailable.
 */

import { NextResponse } from "next/server";
import { buildEdition, cellFromNear, clampPageSize, decodeCursor, pageOfEdition } from "@citizens/central";
import { loadConnectCandidates } from "@/lib/central/connectSource";
import { siteBase } from "@/lib/siteUrl";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-central-feed" });
  if (gate.deny) return gate.deny;

  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor");
  // A broken cursor is refused before anything is read.
  if (cursor && !decodeCursor(cursor)) {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  }
  const cell = cellFromNear(params.get("near"));
  const limit = clampPageSize(params.get("limit"));
  const now = new Date();

  // Card links are absolute https links to this app's pages. On a non-https origin (local
  // development) fall back to the app's path on the shared domain, which the contract also accepts.
  const base = siteBase(request);
  const linkBase = base.startsWith("https://") ? base : "/citizens/connect";

  const supabase = await createClient();
  const source = await loadConnectCandidates(supabase, { now, linkBase });
  if (source.failed.length === 3) {
    return NextResponse.json({ error: "feed_unavailable" }, { status: 503 });
  }

  const edition = buildEdition({ candidates: source.items, now, cell });
  const page = pageOfEdition(edition, cursor, limit);
  if (!page.ok) {
    return NextResponse.json(
      { error: page.error },
      { status: page.error === "invalid_cursor" ? 400 : 409 },
    );
  }

  return NextResponse.json(
    {
      data: {
        edition: { day: edition.day, cell: edition.cell, size: edition.items.length },
        lead: { encouragement: edition.encouragement },
        items: page.items,
        nextCursor: page.nextCursor,
        caughtUp: page.caughtUp,
        nextEditionAt: edition.nextEditionAt,
      },
      meta: { status: source.failed.length ? "partial" : "ok", source: "connect-live" },
    },
    { headers: { "Cache-Control": CACHE } },
  );
}
