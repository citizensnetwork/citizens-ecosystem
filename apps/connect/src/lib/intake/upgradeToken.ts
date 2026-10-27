/**
 * Single-use links for an intake upgrade (issue #248).
 * The raw token is only put in the email. The database stores the sha256 hex.
 */

import { createHash, randomBytes } from "node:crypto";

export const UPGRADE_TOKEN_RE = /^[a-f0-9]{64}$/;
/** Seven days, the window the confirmation link stays valid. Resends do not extend it. */
export const UPGRADE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newUpgradeToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashUpgradeToken(raw) };
}

export function hashUpgradeToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Confirm opens the screen. Decline opens the same screen with Not mine first. Neither link changes the account by itself. */
export function upgradeLinks(origin: string, raw: string): { confirm: string; decline: string } {
  const confirm = `${origin}/upgrade/${raw}`;
  return { confirm, decline: `${confirm}/decline` };
}

/** Storage objects this flow is allowed to delete. Anything else is ignored. */
const OWN_IMAGE = /^[0-9a-f-]{36}\/intake-upgrade\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export function intakeImagePaths(paths: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const path of paths) {
    if (typeof path === "string" && OWN_IMAGE.test(path) && !out.includes(path)) out.push(path);
  }
  return out;
}
