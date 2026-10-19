import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import { canEditListingContent } from "@/lib/dashboard/permissions";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { normalisePublicUrl } from "@/lib/publicUrl";

const TITLE_MAX = 200;
const BODY_MAX = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, max);
}

/**
 * POST /api/contributor/[handle]/news
 * An owner, an admin with a grant, or an active editor creates a news post
 * owned by the contributor (contributor_id is the listing, never the editor).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || !canEditListingContent(access)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`news:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const title = cleanText(raw.title, TITLE_MAX);
  const text = cleanText(raw.body, BODY_MAX);
  if (!title || !text) {
    return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
  }
  const postDate = typeof raw.post_date === "string" && DATE_RE.test(raw.post_date) ? raw.post_date : undefined;
  let imageUrl: string | null = null;
  if (raw.image_url != null && raw.image_url !== "") {
    const norm = normalisePublicUrl(raw.image_url, 2000);
    if (!norm || !norm.startsWith("https://")) {
      return NextResponse.json({ error: "image_url must be an https URL" }, { status: 400 });
    }
    imageUrl = norm;
  }

  const row = {
    contributor_id: access.contributorId,
    title,
    body: text,
    image_url: imageUrl,
    ...(postDate ? { post_date: postDate } : {}),
  };
  const { data, error } = await supabase
    .from("news_posts")
    .insert(row)
    .select("id, contributor_id, title, body, image_url, post_date")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create news post" }, { status: 500 });
  }

  if (access.teamRole !== "editor") {
    await recordContributorMutation(supabase, {
      handle,
      access,
      actorId: user.id,
      action: "news_post_created",
      entityType: "news_post",
      entityId: data.id,
    });
  }

  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/contributor/[handle]/news?id= */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || !canEditListingContent(access)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("news_posts")
    .delete()
    .eq("id", id)
    .eq("contributor_id", access.contributorId);
  if (error) return NextResponse.json({ error: "Failed to delete news post" }, { status: 500 });
  return NextResponse.json({ success: true });
}
