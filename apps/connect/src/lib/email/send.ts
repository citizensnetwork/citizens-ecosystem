/**
 * Server-side transactional email (Resend's HTTP API), sent by Connect itself.
 *
 * Supabase's Auth emails already leave through Resend SMTP, but that key lives
 * in Supabase, not in Vercel — Connect needs its own `RESEND_API_KEY` (a
 * sending-only key) to mail people for things Auth knows nothing about: a new
 * application for the admin, the verdict for the applicant, the welcome for an
 * admin-created listing.
 *
 * Contract every caller can rely on:
 *   - It NEVER throws and never rejects. A mail problem must not fail the
 *     action it announces (the application is saved; the listing is created).
 *   - It returns `"sent" | "failed" | "skipped"` so a caller can report it.
 *     `skipped` = not configured (no key) or nothing usable to send to.
 *   - It logs the outcome without the recipient's address (no PII in logs).
 *   - Headers cannot be injected: `to` must be a plausible single address, the
 *     subject and reply-to are flattened to one line.
 *
 * Callers must HTML-escape every interpolated value (see `escapeHtml`); this
 * module sends exactly what it is given.
 */

import { normaliseEmail } from "@/lib/contributorFields";

export type EmailOutcome = "sent" | "failed" | "skipped";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative (always provide one: spam filters and old clients). */
  text: string;
  /** Where a reply goes. Omitted when not a valid address. */
  replyTo?: string | null;
};

/** The verified Resend sending domain (see RESUME §2). */
export const EMAIL_FROM = "Citizens Connect <no-reply@citizenscentral.co.za>";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8_000;

/** Escape text for an HTML body or attribute. Every interpolated value goes through this. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Collapse any line break so a value can never smuggle a second header. */
function oneLine(value: string, max = 200): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, max);
}

/**
 * The public origin used for links in emails. Same rule as the Form-intake
 * route: the server-configured `NEXT_PUBLIC_SITE_URL` when set, otherwise the
 * origin of the request being served (the app and its API share one origin).
 */
export function siteOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://www.citizenscentral.co.za";
}

/** The admin's inbox for notifications (never hard-coded: this repo is public). */
export function adminNotifyEmail(): string | null {
  return normaliseEmail(process.env.ADMIN_NOTIFY_EMAIL ?? "");
}

export async function sendEmail(mail: OutgoingEmail): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not set; email skipped");
    return "skipped";
  }

  const to = normaliseEmail(mail.to);
  if (!to) {
    console.warn("[email] no valid recipient; email skipped");
    return "skipped";
  }

  const replyTo = mail.replyTo ? normaliseEmail(mail.replyTo) : null;
  const payload: Record<string, unknown> = {
    from: EMAIL_FROM,
    to: [to],
    subject: oneLine(mail.subject),
    html: mail.html,
    text: mail.text,
  };
  if (replyTo) payload.reply_to = replyTo;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // Status only: the response body can echo the recipient.
      console.error(`[email] Resend rejected the message (HTTP ${res.status})`);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[email] send failed:", err instanceof Error ? err.name : "unknown error");
    return "failed";
  }
}
