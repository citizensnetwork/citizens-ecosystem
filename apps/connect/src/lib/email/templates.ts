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

const GOLD = "#A67C00";
const SIGN_OFF_HTML =
  "Connecting the Kingdom — one citizen, one contributor, one need at a time.<br>The Citizens Connect team";
const SIGN_OFF_TEXT = "Connecting the Kingdom — one citizen, one contributor, one need at a time.\nThe Citizens Connect team";

/** A subject line is one short line; never trust a user-supplied name inside one. */
function subjectSafe(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 120);
}

function layout(heading: string, bodyHtml: string): string {
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1f1f1f;line-height:1.55">' +
    `<h2 style="color:${GOLD};margin:0 0 12px">${escapeHtml(heading)}</h2>` +
    bodyHtml +
    `<p>${SIGN_OFF_HTML}</p>` +
    "</div>"
  );
}

function button(href: string, label: string): string {
  return (
    `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:${GOLD};color:#fff;padding:12px 20px;` +
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

// ── To the applicant: approved ───────────────────────────────────────────

export function applicationApprovedEmail(input: {
  name: string;
  listingUrl: string;
  dashboardUrl: string;
}): Email {
  return {
    subject: subjectSafe(`You're live on Citizens Connect: ${input.name}`),
    html: layout(
      `${input.name} is live on Citizens Connect 🎉`,
      "<p>Thank you for joining the Body on Citizens Connect. Your application was approved: " +
        "you're now on the map and in Kingdom Discovery, where citizens across the city can find, " +
        "follow and connect with you.</p>" +
        `<p><a href="${escapeHtml(input.listingUrl)}" style="color:${GOLD}">View your listing</a></p>` +
        "<p>You can add events and places, post news and keep your profile up to date from your " +
        "Contributor Portal:</p>" +
        button(input.dashboardUrl, "Open your Contributor Portal"),
    ),
    text:
      `${input.name} is live on Citizens Connect.\n\n` +
      "Thank you for joining the Body. Your application was approved: you're now on the map and in " +
      "Kingdom Discovery.\n\n" +
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
 * (docs/handoffs/intake-v2.gs `sendWelcome_`): Continue with email → a 6-digit
 * code → the Dashboard; Google as the alternative; and what to do if they signed
 * in with a different address. Worded "sign in to see your listing", never "it is
 * automatically yours": the claim confirm screen (RESUME C10) will sit in front of
 * every claim, admin-created ones included, and this email must stay true then.
 */
export function ownerWelcomeEmail(input: {
  name: string;
  ownerEmail: string;
  listingUrl: string;
  signInUrl: string;
}): Email {
  const email = escapeHtml(input.ownerEmail);
  return {
    subject: subjectSafe(`You're live on Citizens Connect — ${input.name}`),
    html: layout(
      `${input.name} is live on Citizens Connect 🎉`,
      "<p>Thank you for joining the Body on Citizens Connect. A listing for you has been added, " +
        "and it is now on the map and in Kingdom Discovery, where citizens across the city can find, " +
        "follow and connect with you.</p>" +
        `<p><a href="${escapeHtml(input.listingUrl)}" style="color:${GOLD}">View your listing</a></p>` +
        `<p><strong>To see your listing and manage it</strong>, sign in with <strong>${email}</strong>. ` +
        "You don't need a Google account:</p>" +
        '<ol style="padding-left:20px;margin:0 0 14px">' +
        `<li>Open <a href="${escapeHtml(input.signInUrl)}" style="color:${GOLD}">Citizens Connect</a> and tap <strong>Continue with email</strong>.</li>` +
        `<li>Enter <strong>${email}</strong>. We'll email you a 6-digit code (check your junk folder too).</li>` +
        "<li>Type the code in. You'll land on your Contributor dashboard.</li>" +
        "</ol>" +
        button(input.signInUrl, "Sign in to your Contributor Portal") +
        `<p style="font-size:13px;color:#555">Is ${email} a Google account? You can tap the Google button instead. ` +
        `Signed in with a different address by mistake? Sign out, then sign in again with ${email}.</p>`,
    ),
    text:
      `${input.name} is live on Citizens Connect.\n\n` +
      "Thank you for joining the Body. A listing for you has been added, and it is now on the map and in Kingdom Discovery.\n\n" +
      `View your listing: ${input.listingUrl}\n\n` +
      `To see your listing and manage it, sign in with ${input.ownerEmail}. You don't need a Google account:\n` +
      `1. Open ${input.signInUrl} and tap "Continue with email".\n` +
      `2. Enter ${input.ownerEmail}. We'll email you a 6-digit code (check your junk folder too).\n` +
      "3. Type the code in. You'll land on your Contributor dashboard.\n\n" +
      `Is ${input.ownerEmail} a Google account? You can tap the Google button instead.\n` +
      `Signed in with a different address by mistake? Sign out, then sign in again with ${input.ownerEmail}.\n\n${SIGN_OFF_TEXT}`,
  };
}
