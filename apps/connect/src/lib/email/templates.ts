/**
 * The words of every email Connect sends itself. One module, so the tone and the
 * escaping live in one place. Each builder returns `{ subject, html, text }`;
 * every interpolated value is escaped for the HTML part and flattened for the
 * subject. Look and sign-off match the Google Form's welcome email
 * (docs/handoffs/intake-v2.gs `sendWelcome_`) so a person gets one voice from us.
 *
 * Nothing here knows a real person or organisation: callers pass the values.
 */

import { escapeHtml } from "@/lib/email/send";

export type Email = { subject: string; html: string; text: string };

const GOLD = "#F2BD22"; // the crown gold: the button and the rule beside a note
const GOLD_INK = "#836100"; // gold text and links (4.5:1 on white; the crown gold itself is 1.74:1)
const SIGN_OFF_HTML =
  "Connecting the Kingdom — one citizen, one contributor, one need at a time.<br>The Citizens Connect team";
const SIGN_OFF_TEXT = "Connecting the Kingdom — one citizen, one contributor, one need at a time.\nThe Citizens Connect team";

/** A subject line is one short line; never trust a user-supplied name inside one. */
export function subjectSafe(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 120);
}

export function layout(heading: string, bodyHtml: string): string {
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1f1f1f;line-height:1.55">' +
    `<h2 style="color:${GOLD_INK};margin:0 0 12px">${escapeHtml(heading)}</h2>` +
    bodyHtml +
    `<p>${SIGN_OFF_HTML}</p>` +
    "</div>"
  );
}

export function button(href: string, label: string): string {
  return (
    `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:${GOLD};color:#0A0908;padding:12px 20px;` +
    `border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`
  );
}

// ── To the admin: a new self-serve application ───────────────────────────

export function newApplicationAdminEmail(input: {
  name: string;
  categoryLabel: string | null;
  area: string | null;
  siteUrl: string;
}): Email {
  const category = input.categoryLabel || "No category chosen";
  const area = input.area || "Online / no fixed location";
  const where = "Open Citizens Connect, then Admin → Applications.";
  return {
    subject: subjectSafe(`New Contributor application: ${input.name}`),
    html: layout(
      "A new Contributor application is waiting",
      `<p><strong>${escapeHtml(input.name)}</strong> has applied to become a Contributor.</p>` +
        '<table style="border-collapse:collapse;margin:0 0 14px">' +
        `<tr><td style="padding:2px 14px 2px 0;color:#555">Category</td><td>${escapeHtml(category)}</td></tr>` +
        `<tr><td style="padding:2px 14px 2px 0;color:#555">Area</td><td>${escapeHtml(area)}</td></tr>` +
        "</table>" +
        `<p>${escapeHtml(where)} Nothing of theirs is public until you approve it.</p>` +
        button(input.siteUrl, "Open Citizens Connect"),
    ),
    text:
      "A new Contributor application is waiting\n\n" +
      `${input.name} has applied to become a Contributor.\n` +
      `Category: ${category}\nArea: ${area}\n\n` +
      `${where} Nothing of theirs is public until you approve it.\n${input.siteUrl}\n\n${SIGN_OFF_TEXT}`,
  };
}

// ── Where a listing shows ────────────────────────────────────────────────

/**
 * Where a Contributor's listing can be found (tracker C21: say "on the map" only when it is true).
 * Everyone is in Kingdom Discovery; only a listing with a map pin (both coordinates) is also on the map.
 * An online-only Contributor ("no fixed location") must never be promised a pin.
 */
function listedWhere(onMap: boolean): string {
  return onMap ? "on the map and in Kingdom Discovery" : "in Kingdom Discovery";
}

// ── To the applicant: approved ───────────────────────────────────────────

export function applicationApprovedEmail(input: {
  name: string;
  listingUrl: string;
  dashboardUrl: string;
  /** Whether the approved listing has a map pin; false for an online-only Contributor (C21). */
  onMap: boolean;
}): Email {
  const where = listedWhere(input.onMap);
  return {
    subject: subjectSafe(`You're live on Citizens Connect: ${input.name}`),
    html: layout(
      `${input.name} is live on Citizens Connect 🎉`,
      "<p>Thank you for joining the Body on Citizens Connect. Your application was approved: " +
        `you're now ${where}, where citizens across the city can find, ` +
        "follow and connect with you.</p>" +
        `<p><a href="${escapeHtml(input.listingUrl)}" style="color:${GOLD_INK}">View your listing</a></p>` +
        "<p>You can add events and places, post news and keep your profile up to date from your " +
        "Contributor Portal:</p>" +
        button(input.dashboardUrl, "Open your Contributor Portal"),
    ),
    text:
      `${input.name} is live on Citizens Connect.\n\n` +
      `Thank you for joining the Body. Your application was approved: you're now ${where}.\n\n` +
      `View your listing: ${input.listingUrl}\n` +
      `Open your Contributor Portal: ${input.dashboardUrl}\n\n${SIGN_OFF_TEXT}`,
  };
}

// ── To the applicant: not this time ──────────────────────────────────────

export function applicationRejectedEmail(input: {
  name: string;
  reason: string;
  siteUrl: string;
}): Email {
  return {
    subject: "About your Contributor application",
    html: layout(
      "About your Contributor application",
      `<p>Hi ${escapeHtml(input.name)},</p>` +
        "<p>Thank you for taking the time to apply to become a Contributor on Citizens Connect. " +
        "We weren't able to approve it just yet, and we'd like you to know why:</p>" +
        `<p style="background:#faf6ea;border-left:3px solid ${GOLD};padding:10px 14px;margin:0 0 14px">${escapeHtml(input.reason)}</p>` +
        "<p>This isn't a closed door. You can make those changes and apply again whenever you're " +
        "ready: open Citizens Connect, go to <strong>Settings</strong> and choose " +
        "<strong>Apply to become a Contributor</strong>. We would be glad to look again.</p>" +
        button(input.siteUrl, "Open Citizens Connect"),
    ),
    text:
      `Hi ${input.name},\n\n` +
      "Thank you for taking the time to apply to become a Contributor on Citizens Connect. " +
      "We weren't able to approve it just yet, and we'd like you to know why:\n\n" +
      `${input.reason}\n\n` +
      "This isn't a closed door. You can make those changes and apply again whenever you're ready: " +
      "open Citizens Connect, go to Settings and choose \"Apply to become a Contributor\". " +
      `We would be glad to look again.\n${input.siteUrl}\n\n${SIGN_OFF_TEXT}`,
  };
}

// ── To the owner of a listing an admin created for them: welcome ─────────

/**
 * The same plain-language steps as the Google Form's welcome email
 * (tools/google-forms/intake.gs `sendWelcome_`): Continue with email → a 6-digit
 * code → asked to confirm; Google as the alternative; and what to do if they signed
 * in with a different address.
 *
 * Verify-first (C10): the listing is live, but it is never attached to anybody until they have signed in with
 * this address and said yes. So this says "sign in to see your listing" and "we will ask you to confirm", never
 * "it is automatically yours". Two variants:
 *   - `hasAccount` false: the address has no account. The listing waits under it; signing in shows
 *     "Is this your listing? [Confirm] [Not me]".
 *   - `hasAccount` true: the address already has an account. Signing in shows "Attach it to your account?
 *     [Confirm] [Not me]"; nothing on the account changes unless they confirm.
 * Either way "Not me" hides the listing at once.
 *
 * `onMap` is whether the listing has a map pin (an admin may create one with "no
 * fixed location"): it is always in Kingdom Discovery, but only some are on the
 * map, and an online-only Contributor must not be told otherwise.
 */
// ── To an existing account: confirm an intake upgrade ───────────────────

/**
 * Sent only to the address already on the citizen account. The links open a
 * screen; they do not change the account. Confirm and Not mine both require
 * the person to be signed in as that account and to press a button.
 */
export function intakeUpgradeEmail(input: { name: string; confirmUrl: string; declineUrl: string; expiresOn: string }): Email {
  const name = escapeHtml(input.name);
  return {
    subject: subjectSafe(`Is ${input.name} your organisation?`),
    html: layout(
      "Is this your organisation?",
      `<p>A listing for <strong>${name}</strong> was submitted to Citizens Connect on your account.</p>` +
        "<p>Nothing is public, and your account is unchanged, until you confirm it. " +
        "If this is your organisation, confirm the upgrade. If it is not yours, tell us.</p>" +
        button(input.confirmUrl, "Confirm the upgrade") +
        `<p><a href="${escapeHtml(input.declineUrl)}" style="color:${GOLD_INK}">This is not my organisation</a></p>` +
        `<p style="font-size:13px;color:#555">This link expires on ${escapeHtml(input.expiresOn)}. ` +
        "After that, your account stays as it is.</p>",
    ),
    text:
      "Is this your organisation?\n\n" +
      `A listing for ${input.name} was submitted to Citizens Connect on your account.\n\n` +
      "Nothing is public, and your account is unchanged, until you confirm it.\n\n" +
      `Confirm the upgrade: ${input.confirmUrl}\n` +
      `This is not my organisation: ${input.declineUrl}\n\n` +
      `This link expires on ${input.expiresOn}. After that, your account stays as it is.\n\n${SIGN_OFF_TEXT}`,
  };
}

/** To the admin when an upgrade is declined or expires. No account email. */
export function intakeUpgradeFlagEmail(input: { name: string; outcome: "declined" | "expired"; requestId: string }): Email {
  const happened = input.outcome === "declined" ? "was declined" : "expired";
  const sheet = input.outcome === "declined" ? "Declined" : "Expired";
  return {
    subject: subjectSafe(`Intake upgrade ${happened}: ${input.name}`),
    html: layout(
      `An intake upgrade ${happened}`,
      `<p><strong>${escapeHtml(input.name)}</strong> ${happened}. The citizen account was not changed, and no listing was created.</p>` +
        `<p>The sheet row should read <strong>${sheet}</strong>. Request ${escapeHtml(input.requestId)}.</p>`,
    ),
    text:
      `An intake upgrade ${happened}.\n\n` +
      `${input.name} ${happened}. The citizen account was not changed, and no listing was created.\n` +
      `The sheet row should read ${sheet}. Request ${input.requestId}.\n\n${SIGN_OFF_TEXT}`,
  };
}

export function ownerWelcomeEmail(input: {
  name: string;
  ownerEmail: string;
  listingUrl: string;
  signInUrl: string;
  onMap: boolean;
  /** The address already has a Citizens Connect account (the listing is offered to it, never merged). */
  hasAccount?: boolean;
}): Email {
  const email = escapeHtml(input.ownerEmail);
  const where = listedWhere(input.onMap);
  const hasAccount = input.hasAccount === true;
  const askHtml = hasAccount
    ? `<p>You already have a Citizens Connect account with <strong>${email}</strong>. When you sign in as usual we will ask: ` +
      `<em>"Attach ${escapeHtml(input.name)} to your account?"</em> Nothing on your account changes unless you tap <strong>Confirm</strong>. ` +
      "If this listing is not yours, tap <strong>Not me</strong> and we will hide it straight away.</p>"
    : "<p>When you sign in we will ask you to confirm that this listing is yours. " +
      "If it is not, tap <strong>Not me</strong> and we will hide it straight away.</p>";
  const askText = hasAccount
    ? `You already have a Citizens Connect account with ${input.ownerEmail}. When you sign in as usual we will ask: "Attach ${input.name} to your account?" ` +
      "Nothing on your account changes unless you tap Confirm. If this listing is not yours, tap Not me and we will hide it straight away."
    : "When you sign in we will ask you to confirm that this listing is yours. If it is not, tap Not me and we will hide it straight away.";
  return {
    subject: subjectSafe(`You're live on Citizens Connect — ${input.name}`),
    html: layout(
      `${input.name} is live on Citizens Connect 🎉`,
      "<p>Thank you for joining the Body on Citizens Connect. A listing for you has been added, " +
        `and it is now ${where}, where citizens across the city can find, ` +
        "follow and connect with you.</p>" +
        `<p><a href="${escapeHtml(input.listingUrl)}" style="color:${GOLD_INK}">View your listing</a></p>` +
        `<p><strong>To see your listing and manage it</strong>, sign in with <strong>${email}</strong>. ` +
        "You don't need a Google account:</p>" +
        '<ol style="padding-left:20px;margin:0 0 14px">' +
        `<li>Open <a href="${escapeHtml(input.signInUrl)}" style="color:${GOLD_INK}">Citizens Connect</a> and tap <strong>Continue with email</strong>.</li>` +
        `<li>Enter <strong>${email}</strong>. We'll email you a 6-digit code (check your junk folder too).</li>` +
        "<li>Type the code in, then confirm the listing is yours.</li>" +
        "</ol>" +
        askHtml +
        button(input.signInUrl, "Sign in to your Contributor Portal") +
        `<p style="font-size:13px;color:#555">Is ${email} a Google account? You can tap the Google button instead. ` +
        `Signed in with a different address by mistake? Sign out, then sign in again with ${email}.</p>`,
    ),
    text:
      `${input.name} is live on Citizens Connect.\n\n` +
      `Thank you for joining the Body. A listing for you has been added, and it is now ${where}.\n\n` +
      `View your listing: ${input.listingUrl}\n\n` +
      `To see your listing and manage it, sign in with ${input.ownerEmail}. You don't need a Google account:\n` +
      `1. Open ${input.signInUrl} and tap "Continue with email".\n` +
      `2. Enter ${input.ownerEmail}. We'll email you a 6-digit code (check your junk folder too).\n` +
      "3. Type the code in, then confirm the listing is yours.\n\n" +
      `${askText}\n\n` +
      `Is ${input.ownerEmail} a Google account? You can tap the Google button instead.\n` +
      `Signed in with a different address by mistake? Sign out, then sign in again with ${input.ownerEmail}.\n\n${SIGN_OFF_TEXT}`,
  };
}
