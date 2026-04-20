// supabase/functions/_shared/email.ts
// Thin Resend wrapper. All Edge Functions that send email go through
// this so the transport is swappable in one place.
//
// Env: RESEND_API_KEY (must be set in Supabase project Edge Function
// secrets). RESEND_FROM is the verified sender (default
// "Citizens Connect <noreply@citizensnetwork.org>" — override per
// project).

export type EmailResult = { ok: true } | { ok: false; error: string };

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
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
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
