// Edge Function: submit-contributor-application
//
// Invoked by /api/contributor/apply (Next.js API route). Inserts a
// pending application, then emails citizensnetworkpbo@gmail.com a
// summary + HMAC-signed Approve/Reject deep-links.
//
// The function is invoked with the caller's Supabase JWT forwarded
// via Authorization header so that the insert inherits their RLS
// context (user_id = auth.uid()). We use a service-role client only
// for sending notifications and reading the profile row we just
// wrote (in case the caller already had one).
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   RESEND_API_KEY, RESEND_FROM
//   CONTRIBUTOR_REVIEW_SECRET
//   ADMIN_REVIEW_EMAIL (default: citizensnetworkpbo@gmail.com)
//   PUBLIC_SITE_URL (default: https://citizensconnect.app)

import { serve } from "std/http";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "../_shared/client.ts";
import { sendEmail, escapeHtml } from "../_shared/email.ts";
import { sign, reviewPayload } from "../_shared/hmac.ts";

interface ApplicationPayload {
  display_name: string;
  contributor_kind?: "ministry" | "organization" | "business" | null;
  bio?: string | null;
  website_url?: string | null;
  instagram_handle?: string | null;
  facebook_url?: string | null;
  tiktok_handle?: string | null;
  youtube_url?: string | null;
  physical_address?: string | null;
  physical_latitude?: number | null;
  physical_longitude?: number | null;
  logo_url?: string | null;
  gallery_urls?: string[];
  motivation_text?: string | null;
}

const ADMIN_EMAIL =
  Deno.env.get("ADMIN_REVIEW_EMAIL") ?? "citizensnetworkpbo@gmail.com";
const SITE_URL =
  Deno.env.get("PUBLIC_SITE_URL") ?? "https://citizensconnect.app";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResp({ error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResp({ error: "unauthorized" }, 401);
    }

    // Build a scoped client that carries the caller's JWT so RLS + the
    // inserted user_id match.
    const scoped = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      },
    );

    const {
      data: { user },
      error: userErr,
    } = await scoped.auth.getUser();
    if (userErr || !user) {
      return jsonResp({ error: "unauthorized" }, 401);
    }

    const payload = (await req.json()) as ApplicationPayload;
    if (!payload.display_name || payload.display_name.trim().length < 2) {
      return jsonResp({ error: "display_name_required" }, 400);
    }

    // Insert via the scoped client so the RLS policy (user_id =
    // auth.uid()) is satisfied and the unique-pending-per-user index
    // blocks duplicates.
    const { data: inserted, error: insertErr } = await scoped
      .from("contributor_applications")
      .insert({
        user_id: user.id,
        status: "pending",
        display_name: payload.display_name.trim().slice(0, 120),
        contributor_kind: payload.contributor_kind ?? null,
        bio: payload.bio ?? null,
        website_url: payload.website_url ?? null,
        instagram_handle: payload.instagram_handle ?? null,
        facebook_url: payload.facebook_url ?? null,
        tiktok_handle: payload.tiktok_handle ?? null,
        youtube_url: payload.youtube_url ?? null,
        physical_address: payload.physical_address ?? null,
        physical_latitude: payload.physical_latitude ?? null,
        physical_longitude: payload.physical_longitude ?? null,
        logo_url: payload.logo_url ?? null,
        gallery_urls: payload.gallery_urls ?? [],
        motivation_text: payload.motivation_text ?? null,
      })
      .select("id")
      .single();

    if (insertErr) {
      // 23505 = unique_violation (pending already exists)
      const code = (insertErr as { code?: string }).code;
      if (code === "23505") {
        return jsonResp({ error: "already_pending" }, 409);
      }
      console.error("[submit-contributor-application] insert", insertErr);
      return jsonResp({ error: "insert_failed" }, 500);
    }

    // Flip the user's profile status to 'pending' so the UI banner
    // appears. The protect_role_column trigger allows this transition
    // (not_applied → pending, rejected → pending).
    const { error: profileErr } = await scoped
      .from("profiles")
      .update({ contributor_status: "pending" })
      .eq("id", user.id);
    if (profileErr) {
      console.error("[submit-contributor-application] profile", profileErr);
      // Non-fatal — the application exists; status flip is cosmetic.
    }

    // Email the admin with signed deep-links. Signature expires in 14
    // days so stale inbox links don't become a permanent back-door.
    const expiresAt = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const approveSig = await sign(
      reviewPayload(inserted.id, "approve", expiresAt),
    );
    const rejectSig = await sign(
      reviewPayload(inserted.id, "reject", expiresAt),
    );

    const approveUrl = `${SITE_URL}/admin/contributors/${inserted.id}?action=approve&exp=${encodeURIComponent(expiresAt)}&sig=${approveSig}`;
    const rejectUrl = `${SITE_URL}/admin/contributors/${inserted.id}?action=reject&exp=${encodeURIComponent(expiresAt)}&sig=${rejectSig}`;

    // Use service client only to fetch the applicant's email for the
    // reply-to header.
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    const emailResult = await sendEmail({
      to: ADMIN_EMAIL,
      replyTo: profile?.email ?? undefined,
      subject: `[Citizens Connect] New Contributor application: ${payload.display_name}`,
      html: renderEmail({
        displayName: payload.display_name,
        applicantName: profile?.full_name ?? "",
        applicantEmail: profile?.email ?? "",
        kind: payload.contributor_kind ?? null,
        bio: payload.bio ?? null,
        website: payload.website_url ?? null,
        instagram: payload.instagram_handle ?? null,
        facebook: payload.facebook_url ?? null,
        tiktok: payload.tiktok_handle ?? null,
        youtube: payload.youtube_url ?? null,
        physicalAddress: payload.physical_address ?? null,
        motivation: payload.motivation_text ?? null,
        approveUrl,
        rejectUrl,
        reviewUrl: `${SITE_URL}/admin/contributors/${inserted.id}`,
      }),
    });

    if (!emailResult.ok) {
      console.error(
        "[submit-contributor-application] email failed",
        emailResult.error,
      );
      // Non-fatal: the application is stored and visible in the admin
      // queue, so approvers can still act on it via the in-app review
      // page.
    }

    return jsonResp({
      success: true,
      application_id: inserted.id,
      email_sent: emailResult.ok,
    });
  } catch (err) {
    console.error("[submit-contributor-application] error", err);
    return jsonResp({ error: "internal_error" }, 500);
  }
});

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderEmail(p: {
  displayName: string;
  applicantName: string;
  applicantEmail: string;
  kind: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  physicalAddress: string | null;
  motivation: string | null;
  approveUrl: string;
  rejectUrl: string;
  reviewUrl: string;
}): string {
  const row = (label: string, value: string | null) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(value)}</td></tr>`
      : "";

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;">
  <h2 style="margin:0 0 16px;color:#111;">New Contributor application</h2>
  <p style="margin:0 0 16px;color:#555;">Someone has applied to become a Citizens Connect Contributor. Review the details below and approve or reject.</p>

  <div style="background:#faf9f6;border:1px solid #eee;border-radius:8px;padding:16px;margin:16px 0;">
    <h3 style="margin:0 0 12px;color:#b8901a;">${escapeHtml(p.displayName)}</h3>
    <table style="width:100%;border-collapse:collapse;">
      ${row("Kind", p.kind)}
      ${row("Applicant", p.applicantName)}
      ${row("Contact email", p.applicantEmail)}
      ${row("Website", p.website)}
      ${row("Instagram", p.instagram)}
      ${row("Facebook", p.facebook)}
      ${row("TikTok", p.tiktok)}
      ${row("YouTube", p.youtube)}
      ${row("Physical address", p.physicalAddress)}
    </table>
    ${p.bio ? `<p style="margin:12px 0 0;font-size:14px;"><strong>Bio:</strong><br>${escapeHtml(p.bio)}</p>` : ""}
    ${p.motivation ? `<p style="margin:12px 0 0;font-size:14px;"><strong>Why they want to contribute:</strong><br>${escapeHtml(p.motivation)}</p>` : ""}
  </div>

  <div style="margin:24px 0;">
    <a href="${p.approveUrl}" style="display:inline-block;background:#b8901a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:8px;">Approve</a>
    <a href="${p.rejectUrl}" style="display:inline-block;background:#fff;color:#111;padding:12px 20px;border:1px solid #ddd;border-radius:6px;text-decoration:none;font-weight:600;">Reject</a>
  </div>

  <p style="font-size:12px;color:#999;margin:32px 0 0;">
    Prefer to review in the admin panel? <a href="${p.reviewUrl}" style="color:#b8901a;">Open in dashboard</a>.<br>
    Links expire in 14 days and are signed — only this inbox can use them.
  </p>
</body></html>`;
}
