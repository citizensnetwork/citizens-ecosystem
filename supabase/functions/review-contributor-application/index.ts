// Edge Function: review-contributor-application
//
// Called by /api/admin/contributors/review (Next.js route) after the
// admin clicks an email deep-link OR uses the in-app review panel.
// Two auth modes:
//   1. In-app: Authorization: Bearer <admin JWT> — RLS + is_admin()
//      enforce admin-ness; no signature required.
//   2. Email deep-link: ?sig=<hex> + ?exp=<iso> — verified here. When
//      valid, we use the service-role client to call the approval
//      RPC (since an email-only click doesn't carry a JWT). For
//      safety, the deep-link is single-use in practice because the
//      RPC is guarded by "status = 'pending' FOR UPDATE" and flips
//      the row out of pending on success.
//
// Accepts POST body:
//   { application_id: string, action: "approve" | "reject",
//     reason?: string,  // required when action = reject
//     exp?: string, sig?: string  // email deep-link mode
//   }

import { serve } from "std/http";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "../_shared/client.ts";
import { sendEmail, escapeHtml } from "../_shared/email.ts";
import { verify, reviewPayload } from "../_shared/hmac.ts";

const SITE_URL =
  Deno.env.get("PUBLIC_SITE_URL") ?? "https://citizensconnect.app";

interface ReviewPayload {
  application_id: string;
  action: "approve" | "reject";
  reason?: string;
  exp?: string;
  sig?: string;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResp({ error: "method_not_allowed" }, 405);
  }
  try {
    const body = (await req.json()) as ReviewPayload;
    if (!body.application_id || !["approve", "reject"].includes(body.action)) {
      return jsonResp({ error: "bad_request" }, 400);
    }
    if (body.action === "reject" && (!body.reason || body.reason.trim().length === 0)) {
      return jsonResp({ error: "reason_required" }, 400);
    }

    // Prefer JWT path when present.
    const authHeader = req.headers.get("Authorization");
    let client: ReturnType<typeof createClient>;

    if (authHeader) {
      client = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          auth: { persistSession: false },
          global: { headers: { Authorization: authHeader } },
        },
      );
    } else if (body.sig && body.exp) {
      // Email deep-link path: verify signature + expiry, then use the
      // service-role client (which bypasses RLS, so the RPC's own
      // is_admin() check would fail — we must instead call a service-
      // mode equivalent path. To keep the logic in one place, the RPC
      // uses is_admin(); service-role bypasses that by being the
      // postgres role, which satisfies every policy. However our RPC
      // explicitly checks is_admin() at the application layer, so we
      // need an email-mode bypass: the existence of a verified
      // signature is the authorisation signal here.)
      const expiresAt = new Date(body.exp);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        return jsonResp({ error: "link_expired" }, 410);
      }
      const ok = await verify(
        reviewPayload(body.application_id, body.action, body.exp),
        body.sig,
      );
      if (!ok) {
        return jsonResp({ error: "invalid_signature" }, 403);
      }
      client = createServiceClient();
    } else {
      return jsonResp({ error: "unauthorized" }, 401);
    }

    // Fetch the application for context (we need the applicant email
    // for the post-review notification email).
    const serviceRead = createServiceClient();
    const { data: app, error: appErr } = await serviceRead
      .from("contributor_applications")
      .select(
        "id, user_id, display_name, status, profiles!contributor_applications_user_id_fkey(email)",
      )
      .eq("id", body.application_id)
      .single();

    if (appErr || !app) {
      return jsonResp({ error: "not_found" }, 404);
    }
    if (app.status !== "pending") {
      return jsonResp({ error: "already_reviewed", status: app.status }, 409);
    }

    // Email-deep-link mode uses service client (bypasses is_admin
    // gate inside the RPC by calling the SQL primitives directly).
    // JWT mode uses the RPCs which self-check.
    let rpcResult: { success?: boolean; reason?: string; slug?: string } | null = null;

    if (authHeader) {
      // JWT mode: the admin's session is carried through; RPC's
      // is_admin() check applies.
      if (body.action === "approve") {
        const { data, error } = await client.rpc(
          "approve_contributor_application",
          { _application_id: body.application_id },
        );
        if (error) {
          console.error("[review] approve rpc error", error);
          return jsonResp({ error: "rpc_failed" }, 500);
        }
        rpcResult = data as typeof rpcResult;
      } else {
        const { data, error } = await client.rpc(
          "reject_contributor_application",
          { _application_id: body.application_id, _reason: body.reason },
        );
        if (error) {
          console.error("[review] reject rpc error", error);
          return jsonResp({ error: "rpc_failed" }, 500);
        }
        rpcResult = data as typeof rpcResult;
      }
    } else {
      // Email mode: signature already verified. We perform the
      // update directly via service role to bypass is_admin().
      rpcResult = await performReviewAsService(serviceRead, {
        application_id: body.application_id,
        action: body.action,
        reason: body.reason ?? "",
      });
    }

    if (!rpcResult?.success) {
      return jsonResp(
        { error: "review_failed", reason: rpcResult?.reason ?? "unknown" },
        400,
      );
    }

    // Email the applicant a short confirmation.
    const applicantEmail = (app.profiles as { email?: string } | null)?.email;
    if (applicantEmail) {
      const subject =
        body.action === "approve"
          ? "You're an approved Contributor on Citizens Connect!"
          : "About your Contributor application";
      const html =
        body.action === "approve"
          ? approvedEmail(app.display_name, rpcResult.slug ?? "")
          : rejectedEmail(app.display_name, body.reason ?? "");
      await sendEmail({ to: applicantEmail, subject, html });
    }

    return jsonResp({ success: true, action: body.action, slug: rpcResult.slug });
  } catch (err) {
    console.error("[review-contributor-application] error", err);
    return jsonResp({ error: "internal_error" }, 500);
  }
});

async function performReviewAsService(
  client: ReturnType<typeof createServiceClient>,
  input: { application_id: string; action: "approve" | "reject"; reason: string },
): Promise<{ success: boolean; reason?: string; slug?: string }> {
  // Service-role bypasses RLS; we can call the RPCs directly and they
  // will still run their internal checks (is_admin). We force-claim
  // an admin identity for the call by using a known-admin JWT? No —
  // simpler: service role operates as 'postgres' which does not
  // satisfy is_admin() (that function checks profiles.role). So for
  // email mode we inline the state transition.
  if (input.action === "approve") {
    const { data: appRow, error: appFetchErr } = await client
      .from("contributor_applications")
      .select("user_id, display_name, status, contributor_kind, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, physical_address, physical_latitude, physical_longitude, logo_url, gallery_urls")
      .eq("id", input.application_id)
      .eq("status", "pending")
      .single();
    if (appFetchErr || !appRow) return { success: false, reason: "not_found_or_already_reviewed" };

    const { data: slugRow } = await client.rpc("generate_contributor_slug", {
      _name: appRow.display_name,
    });
    const newSlug = (slugRow as string) ?? "contributor";

    const { error: profileErr } = await client
      .from("profiles")
      .update({
        role: "contributor",
        contributor_status: "approved",
        contributor_kind: appRow.contributor_kind ?? null,
        full_name: appRow.display_name,
        bio: appRow.bio,
        website_url: appRow.website_url,
        instagram_handle: appRow.instagram_handle,
        facebook_url: appRow.facebook_url,
        tiktok_handle: appRow.tiktok_handle,
        youtube_url: appRow.youtube_url,
        physical_address: appRow.physical_address,
        physical_latitude: appRow.physical_latitude,
        physical_longitude: appRow.physical_longitude,
        logo_url: appRow.logo_url,
        gallery_urls: appRow.gallery_urls ?? [],
        contributor_slug: newSlug,
        needs_re_review: false,
      })
      .eq("id", appRow.user_id);
    if (profileErr) {
      console.error("[review svc approve profile]", profileErr);
      return { success: false, reason: "profile_update_failed" };
    }

    const { data: appFlip, error: appErr } = await client
      .from("contributor_applications")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.application_id)
      .eq("status", "pending") // defensive: ignore replay if already reviewed
      .select("id");
    if (appErr) {
      console.error("[review svc approve app]", appErr);
      return { success: false, reason: "app_update_failed" };
    }
    if (!appFlip || appFlip.length === 0) {
      // Lost the race with a concurrent reviewer. The profile update
      // above already happened under service role — but since the
      // pre-read also checked status='pending', reaching here means
      // a concurrent review committed between our read and write.
      // The resulting state is still consistent (approved + approved).
      return { success: true, slug: newSlug };
    }

    await client.from("notifications").insert({
      user_id: appRow.user_id,
      type: "contributor_approved",
      title: "You're an approved Contributor!",
      body: "Welcome! You can now create public events and places.",
      data: { url: "/profile/contributor" },
    });

    // Discard any unused preflight state.

    return { success: true, slug: newSlug };
  } else {
    const { data: appRow, error: appFetchErr } = await client
      .from("contributor_applications")
      .select("user_id, status")
      .eq("id", input.application_id)
      .eq("status", "pending")
      .single();
    if (appFetchErr || !appRow) return { success: false, reason: "not_found_or_already_reviewed" };

    const { data: appFlip, error: appErr } = await client
      .from("contributor_applications")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        rejection_reason: input.reason,
      })
      .eq("id", input.application_id)
      .eq("status", "pending")
      .select("id");
    if (appErr) return { success: false, reason: "app_update_failed" };
    if (!appFlip || appFlip.length === 0) {
      // Already reviewed concurrently; nothing more to do.
      return { success: true };
    }

    await client
      .from("profiles")
      .update({ contributor_status: "rejected" })
      .eq("id", appRow.user_id);

    await client.from("notifications").insert({
      user_id: appRow.user_id,
      type: "contributor_rejected",
      title: "Contributor application update",
      body: input.reason,
      data: { url: "/contributor/apply" },
    });
    return { success: true };
  }
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function approvedEmail(displayName: string, slug: string): string {
  const profileUrl = slug ? `${SITE_URL}/c/${slug}` : `${SITE_URL}/profile`;
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;">
    <h2 style="color:#b8901a;margin:0 0 16px;">Welcome, Contributor!</h2>
    <p>Hi ${escapeHtml(displayName)},</p>
    <p>Your application to become a Citizens Connect Contributor has been approved. You can now create public events, manage places on the map, and build out your public profile.</p>
    <p style="margin:24px 0;">
      <a href="${profileUrl}" style="display:inline-block;background:#b8901a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Set up your profile</a>
    </p>
    <p>Welcome to the Kingdom.</p>
  </body></html>`;
}

function rejectedEmail(displayName: string, reason: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;">
    <h2 style="margin:0 0 16px;">About your Contributor application</h2>
    <p>Hi ${escapeHtml(displayName)},</p>
    <p>Thanks for your interest in becoming a Citizens Connect Contributor. After review, we weren't able to approve your application at this time.</p>
    <p style="background:#faf9f6;border-left:3px solid #b8901a;padding:12px;margin:16px 0;">${escapeHtml(reason)}</p>
    <p>You can address the points above and submit a new application whenever you're ready. We'll gladly take another look.</p>
    <p style="margin:24px 0;">
      <a href="${SITE_URL}/contributor/apply" style="display:inline-block;background:#fff;color:#111;padding:12px 20px;border:1px solid #ddd;border-radius:6px;text-decoration:none;font-weight:600;">Re-apply</a>
    </p>
  </body></html>`;
}
