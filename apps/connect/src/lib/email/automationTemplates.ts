/**
 * The email that tells a Contributor new suggested updates are waiting (listing
 * automation, Phase 1). Kept out of templates.ts on purpose: that file is edited by
 * several features at once, and this one only needs its layout helpers.
 *
 * Nothing here names a real organisation: the caller passes the Contributor's own
 * name. It never contains the suggestions themselves (only how many), so an email
 * that sits in an inbox cannot leak what was found.
 */

import { escapeHtml } from "@/lib/email/send";
import { button, layout, subjectSafe, type Email } from "@/lib/email/templates";

export function suggestionsDigestEmail(input: { name: string; count: number; url: string }): Email {
  const n = Math.max(1, Math.floor(input.count));
  const noun = n === 1 ? "suggested update" : "suggested updates";
  const lead = `${input.name} has ${n} new ${noun} on Citizens Connect.`;
  const found =
    "We found them on the public website, YouTube channel or calendar you shared with us. " +
    "Nothing is published until you say so (unless you chose to have your events published for you), " +
    "so take a minute to approve, edit or dismiss each one.";
  const control = "You can turn automatic updates off at any time in your dashboard, under Profile.";
  return {
    subject: subjectSafe(lead.replace(/\.$/, "")),
    html: layout(
      "New suggestions are waiting",
      `<p><strong>${escapeHtml(input.name)}</strong> has ${n} new ${noun} on Citizens Connect.</p>` +
        `<p>${escapeHtml(found)}</p>` +
        button(input.url, "Review suggestions") +
        `<p style="color:#555;font-size:13px">${escapeHtml(control)}</p>`,
    ),
    text: `${lead}\n\n${found}\n\nReview them here: ${input.url}\n\n${control}\n\nConnecting the Kingdom — one citizen, one contributor, one need at a time.\nThe Citizens Connect team`,
  };
}
