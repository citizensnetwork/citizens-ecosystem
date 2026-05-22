import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREF_KEYS = [
  "friends_activity",
  "event_reminders",
  "contributor_updates",
  "announcements",
  "weekly_digest",
] as const;
type PrefKey = (typeof ALLOWED_PREF_KEYS)[number];

const DIGEST_VALUES = ["instant", "daily", "off"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`notif-prefs:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: {
    notification_digest?: string;
  } = {};

  const hasDigest = "notification_digest" in body;
  const hasPrefs = "notification_prefs" in body;

  if (!hasDigest && !hasPrefs) {
    return NextResponse.json(
      { error: "No preference fields provided" },
      { status: 400 },
    );
  }

  // --- notification_digest (optional) ---
  if (hasDigest) {
    const digest = body.notification_digest;
    if (
      typeof digest !== "string" ||
      !DIGEST_VALUES.includes(digest as (typeof DIGEST_VALUES)[number])
    ) {
      return NextResponse.json(
        { error: "Invalid digest preference" },
        { status: 400 },
      );
    }
    update.notification_digest = digest;
  }

  // --- notification_prefs (optional partial merge) ---
  let mergedPrefs: Record<string, unknown> | null = null;
  if (hasPrefs) {
    const raw = body.notification_prefs;
    if (!isRecord(raw)) {
      return NextResponse.json(
        { error: "notification_prefs must be an object" },
        { status: 400 },
      );
    }

    // Client-side validation first so we return predictable 400s instead
    // of relying on the RPC's RAISE EXCEPTION messages leaking through.
    const sanitized: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!ALLOWED_PREF_KEYS.includes(k as PrefKey)) {
        return NextResponse.json(
          { error: `Unknown preference key: ${k}` },
          { status: 400 },
        );
      }
      if (typeof v !== "boolean") {
        return NextResponse.json(
          { error: `Preference '${k}' must be a boolean` },
          { status: 400 },
        );
      }
      sanitized[k] = v;
    }

    // Atomic merge via SQL RPC (see migration 051). This replaces the
    // previous read-then-write which had a TOCTOU race under concurrent
    // toggle flips.
    const { data: merged, error: rpcErr } = await supabase.rpc(
      "update_notification_prefs",
      { delta: sanitized },
    );
    if (rpcErr) {
      console.error("[API notification preferences PATCH] rpc", rpcErr);
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 },
      );
    }
    mergedPrefs = (merged as Record<string, unknown> | null) ?? null;
  }

  // --- notification_digest update (if supplied) ---
  if (update.notification_digest !== undefined) {
    const { error } = await supabase
      .from("profiles")
      .update({ notification_digest: update.notification_digest })
      .eq("id", user.id);

    if (error) {
      console.error("[API notification preferences PATCH]", error);
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    updated: {
      ...(update.notification_digest !== undefined
        ? { notification_digest: update.notification_digest }
        : {}),
      ...(mergedPrefs !== null ? { notification_prefs: mergedPrefs } : {}),
    },
  });
}
