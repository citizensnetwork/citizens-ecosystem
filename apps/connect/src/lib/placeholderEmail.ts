/**
 * The alias auth email a listing placeholder lives under when its real owner already has an account (C10).
 *
 * Auth emails are unique, so a listing made for an address that already has an account cannot also use that
 * address. It goes live under `listing-<uuid>@listing-placeholder.invalid` instead, and the real address is kept
 * only in `contributor_claim_email` and the `listing_claims` ledger (migration 196).
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so even if something tried to mail it, nothing would
 * arrive. Mailers still refuse it explicitly (`sendEmail`, the Edge Functions' shared mailer) so the intent is
 * enforced in code and not left to DNS. The 128-bit random id makes the alias unguessable: nobody can request a
 * sign-in code for it.
 */

import { randomUUID } from "node:crypto";

export const PLACEHOLDER_EMAIL_DOMAIN = "listing-placeholder.invalid";

export function placeholderAliasEmail(id: string = randomUUID()): string {
  return `listing-${id}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** True for any address on the placeholder domain, whatever its case or surrounding space. */
export function isPlaceholderEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const at = value.trim().toLowerCase().lastIndexOf("@");
  return at >= 0 && value.trim().toLowerCase().slice(at + 1) === PLACEHOLDER_EMAIL_DOMAIN;
}
