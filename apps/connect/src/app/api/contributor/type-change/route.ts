/**
 * POST /api/contributor/type-change
 *
 * Allows an approved contributor to submit a request to change their
 * contributor_kind (ministry / organization / business).  The request
 * is stored in contributor_type_change_requests and an admin
 * notification is raised so admins can review it.
 *
 * The contributor_kind is NOT changed immediately — this is an
 * application process requiring admin approval.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { CONTRIBUTOR_KIND_LABELS, type ContributorKind } from "@/types/db";

const VALID_KINDS: ContributorKind[] = ["ministry", "organization", "business"];
const MAX_REASON_LENGTH = 1000;

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate-limit
  const rl = await checkRateLimit(`type-change:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 3. Fetch profile and verify contributor + approved
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, contributor_status, contributor_kind, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "contributor") {
    return NextResponse.json({ error: "Contributor only" }, { status: 403 });
  }
  if (profile.contributor_status !== "approved") {
    return NextResponse.json(
      { error: "Only approved contributors can request a type change." },
      { status: 403 }
    );
  }

  // 4. Parse body
  let requested_kind: ContributorKind;
  let reason: string;
  try {
    const body = await request.json();
    requested_kind = body.requested_kind;
    reason = typeof body.reason === "string" ? body.reason.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!VALID_KINDS.includes(requested_kind)) {
    return NextResponse.json(
      { error: "Invalid contributor type." },
      { status: 400 }
    );
  }
  if (requested_kind === profile.contributor_kind) {
    return NextResponse.json(
      { error: "You already have this contributor type." },
      { status: 400 }
    );
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  // 5. Upsert request row (one pending request per contributor at a time).
  //    Uses admin client because RLS on contributor_type_change_requests
  //    may not yet exist; the logic is gated above.
  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("contributor_type_change_requests")
    .upsert(
      {
        user_id: user.id,
        current_kind: profile.contributor_kind,
        requested_kind,
        reason: reason || null,
        status: "pending",
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (insertError) {
    console.error("[api/contributor/type-change] insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to submit request. Please try again." },
      { status: 500 }
    );
  }

  // 6. Notify all admins
  try {
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    if (admins && admins.length > 0) {
      const kindLabel = CONTRIBUTOR_KIND_LABELS[requested_kind] ?? requested_kind;
      await admin.from("notifications").insert(
        admins.map((a) => ({
          user_id: a.id,
          type: "contributor_type_change_request",
          title: "Contributor type-change request",
          body: `${profile.full_name ?? "A contributor"} has requested to change their type to ${kindLabel}.`,
          link_url: "/admin/contributors",
          metadata: { requester_id: user.id, requested_kind },
        }))
      );
    }
  } catch (err) {
    // Non-fatal — request was saved; notification failure should not fail the user.
    console.warn("[api/contributor/type-change] notify admins failed:", err);
  }

  return NextResponse.json({ success: true });
}
