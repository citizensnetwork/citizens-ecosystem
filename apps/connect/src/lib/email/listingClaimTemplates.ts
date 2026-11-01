/**
 * The two emails that belong to the verify-first listing claim (C10) besides the welcome (which is
 * `ownerWelcomeEmail` in templates.ts). Same look and sign-off as every other email Connect sends.
 */

import { escapeHtml } from "@/lib/email/send";
import { button, layout, subjectSafe, type Email } from "@/lib/email/templates";

const SIGN_OFF_TEXT = "Connecting the Kingdom — one citizen, one contributor, one need at a time.\nThe Citizens Connect team";
const GOLD_INK = "#836100"; // the ink of the one gold: gold text and links (the crown gold itself is 1.74:1 on white)

/**
 * The single reminder. Sent once, a week after the listing went live, to an owner who has not answered. It asks;
 * it never threatens. The listing stays live, nothing is attached without their yes, and nothing expires.
 */
export function listingClaimReminderEmail(input: {
  name: string;
  ownerEmail: string;
  listingUrl: string;
  signInUrl: string;
}): Email {
  const email = escapeHtml(input.ownerEmail);
  return {
    subject: subjectSafe(`Your Citizens Connect listing is waiting — ${input.name}`),
    html: layout(
      `${input.name} is waiting for you`,
      `<p>A week ago a listing for <strong>${escapeHtml(input.name)}</strong> was added to Citizens Connect for ${email}. ` +
        "It is live, and it is still waiting for you to say whether it is yours.</p>" +
        `<p><a href="${escapeHtml(input.listingUrl)}" style="color:${GOLD_INK}">View the listing</a></p>` +
        `<p>Sign in with <strong>${email}</strong> (a 6-digit emailed code, or Google) and we will ask you to <strong>Confirm</strong> ` +
        "that it is yours, or tap <strong>Not me</strong> and we will hide it straight away. " +
        "Nothing happens to your account unless you confirm, and this is the only reminder we will send.</p>" +
        button(input.signInUrl, "Sign in and answer"),
    ),
    text:
      `${input.name} is waiting for you.\n\n` +
      `A week ago a listing for ${input.name} was added to Citizens Connect for ${input.ownerEmail}. It is live, and it is still waiting for you to say whether it is yours.\n\n` +
      `View the listing: ${input.listingUrl}\n\n` +
      `Sign in with ${input.ownerEmail} (a 6-digit emailed code, or Google) at ${input.signInUrl} and we will ask you to Confirm that it is yours, ` +
      "or tap Not me and we will hide it straight away. Nothing happens to your account unless you confirm, and this is the only reminder we will send.\n\n" +
      SIGN_OFF_TEXT,
  };
}

/** To the admin, when an owner taps "Not me". No address or id in it: the Sheet and the Admin screen hold the rest. */
export function listingDeclinedAdminEmail(input: { name: string; slug: string | null; siteUrl: string }): Email {
  const where = "Open Citizens Connect, then Admin, and decide whether to Delete it. It is already hidden from everyone.";
  return {
    subject: subjectSafe(`Owner declined a listing: ${input.name}`),
    html: layout(
      "An owner said this listing is not theirs",
      `<p>The person the listing <strong>${escapeHtml(input.name)}</strong> was made for signed in with the address it was made for ` +
        "and tapped <strong>Not me</strong>. The listing is hidden. Nothing on their account was changed.</p>" +
        `<p>${escapeHtml(where)} The Form's Sheet shows "Owner declined" for it.</p>` +
        (input.slug ? `<p style="font-size:13px;color:#555">Listing: ${escapeHtml(input.slug)}</p>` : "") +
        button(input.siteUrl, "Open Citizens Connect"),
    ),
    text:
      "An owner said this listing is not theirs\n\n" +
      `The person the listing ${input.name} was made for signed in with the address it was made for and tapped Not me. ` +
      "The listing is hidden. Nothing on their account was changed.\n" +
      `${where} The Form's Sheet shows "Owner declined" for it.\n` +
      (input.slug ? `Listing: ${input.slug}\n` : "") +
      `${input.siteUrl}\n\n${SIGN_OFF_TEXT}`,
  };
}
