/**
 * POST /api/reports  — file a report against an event / user / place / comment.
 * GET  /api/reports  — list the caller's own submissions (their receipts).
 *
 * Admin review + resolution lives in /api/admin/reports/[id].
 *
 * Rate limit: 5 reports/hour per user (prevents report-weaponisation).
 * RLS enforces that reporter_id === auth.uid() even if the client lies.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_TYPES = ["event", "user", "place", "comment", "conversation"] as const;
const REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "sexual_content",
  "violence",
  "misinformation",
  "impersonation",
  "illegal",
  "other",
] as const;

type TargetType = (typeof TARGET_TYPES)[number];
type Reason = (typeof REASONS)[number];

const MAX_BODY_LEN = 1000;

/** 5 reports per hour per user. Separate limiter to avoid colliding with
 *  standard mutations on the shared sliding-window store. */
const REPORT_RATE = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`reports:${user.id}`, REPORT_RATE);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many reports. Please try again later." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    target_type,
    target_id,
    reason,
    body,
  } = payload as {
    target_type?: unknown;
    target_id?: unknown;
    reason?: unknown;
    body?: unknown;
  };

  if (
    typeof target_type !== "string" ||
    !TARGET_TYPES.includes(target_type as TargetType)
  ) {
    return NextResponse.json(
      { error: "Invalid target_type" },
      { status: 400 },
    );
  }
  if (typeof target_id !== "string" || !isValidUUID(target_id)) {
    return NextResponse.json(
      { error: "Invalid target_id" },
      { status: 400 },
    );
  }
  if (typeof reason !== "string" || !REASONS.includes(reason as Reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }
  let cleanBody: string | null = null;
  if (body !== undefined && body !== null) {
    if (typeof body !== "string") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      cleanBody = null;
    } else if (trimmed.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `Body must be ${MAX_BODY_LEN} characters or fewer` },
        { status: 400 },
      );
    } else {
      cleanBody = trimmed;
    }
  }

  // Prevent self-reports against one's own profile (they're noise).
  if (target_type === "user" && target_id === user.id) {
    return NextResponse.json(
      { error: "You cannot report yourself" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: user.id,
      target_type,
      target_id,
      reason,
      body: cleanBody,
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation on the partial "one open per (user,target)" index.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You've already reported this. Our team is reviewing it." },
        { status: 409 },
      );
    }
    console.error("[/api/reports POST]", error);
    return NextResponse.json(
      { error: "Failed to file report" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data?.id }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, status, created_at, resolved_at")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[/api/reports GET]", error);
    return NextResponse.json(
      { error: "Failed to load reports" },
      { status: 500 },
    );
  }

  return NextResponse.json({ reports: data ?? [] });
}
