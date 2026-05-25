import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

const MAX_KEYWORDS = 20;

/** GET /api/contributor/[handle]/keywords — public list. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: contributor } = await supabase
    .from("profiles")
    .select("id")
    .eq("contributor_slug", handle)
    .maybeSingle<{ id: string }>();

  if (!contributor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("contributor_keywords")
    .select("id, keyword, created_at")
    .eq("contributor_id", contributor.id)
    .order("keyword", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch keywords" }, { status: 500 });
  }

  return NextResponse.json({ keywords: data ?? [] });
}

/** POST /api/contributor/[handle]/keywords — add keyword. Requires dashboard access. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`keywords:${user.id}`, RATE_LIMITS.mutation);
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
  const keyword = typeof raw.keyword === "string"
    ? raw.keyword.replace(/[\x00-\x1F\x7F]/g, " ").trim().toLowerCase().slice(0, 50)
    : "";

  if (keyword.length < 2) {
    return NextResponse.json({ error: "Keyword must be at least 2 characters" }, { status: 400 });
  }

  // Check cap
  const { count } = await supabase
    .from("contributor_keywords")
    .select("id", { count: "exact", head: true })
    .eq("contributor_id", contributorId);

  if ((count ?? 0) >= MAX_KEYWORDS) {
    return NextResponse.json({ error: `Maximum ${MAX_KEYWORDS} keywords allowed` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("contributor_keywords")
    .insert({ contributor_id: contributorId, keyword })
    .select("id, keyword")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Keyword already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add keyword" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

/** DELETE /api/contributor/[handle]/keywords?id=uuid */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid keyword id" }, { status: 400 });
  }

  const access = await checkDashboardAccess(handle);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { contributorId } = access;
  const supabase = await createClient();

  const { error } = await supabase
    .from("contributor_keywords")
    .delete()
    .eq("id", id)
    .eq("contributor_id", contributorId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete keyword" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
