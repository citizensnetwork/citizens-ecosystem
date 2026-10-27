// supabase/functions/_shared/email.ts
// Thin Resend wrapper. All Edge Functions that send email go through
// this so the transport is swappable in one place.
//
// Env: RESEND_API_KEY (must be set in Supabase project Edge Function
// secrets). RESEND_FROM is the verified sender (default
// "Citizens Connect <noreply@citizensnetwork.org>" — override per
// project).

export type EmailResult = { ok: true } | { ok: false; error: string };

// A listing placeholder's alias address (C10, mirrors apps/connect/src/lib/placeholderEmail.ts) is never mailed.
const PLACEHOLDER_EMAIL_DOMAIN = "listing-placeholder.invalid";
function isPlaceholderEmail(v: string): boolean {
  return v.trim().toLowerCase().endsWith("@" + PLACEHOLDER_EMAIL_DOMAIN);
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<EmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter((t) => !isPlaceholderEmail(t));
  if (recipients.length === 0) {
    return { ok: false, error: "no deliverable recipient (placeholder address)" };
  }

  const from =
    Deno.env.get("RESEND_FROM") ??
    "Citizens Connect <noreply@citizensnetwork.org>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Resend ${res.status}: ${body}` };
  }
  return { ok: true };
}

/** Escape a string for interpolation into HTML bodies. */
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
