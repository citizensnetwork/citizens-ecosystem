// supabase/functions/_shared/hmac.ts
// HMAC-SHA256 signing for email deep-links. Edge Functions generate
// signed URLs so the admin can click Approve/Reject straight from the
// inbox without authenticating twice — the signature proves the link
// came from our server.
//
// Env: CONTRIBUTOR_REVIEW_SECRET (generate with `openssl rand -hex 32`
// and set in Supabase Edge Function secrets). NEVER expose client-side.

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** Sign a payload string and return a hex digest. */
export async function sign(payload: string): Promise<string> {
  const secret = Deno.env.get("CONTRIBUTOR_REVIEW_SECRET");
  if (!secret) throw new Error("CONTRIBUTOR_REVIEW_SECRET not set");
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(sig);
}

/** Constant-time verify of a hex-encoded signature. */
export async function verify(
  payload: string,
  signatureHex: string,
): Promise<boolean> {
  const secret = Deno.env.get("CONTRIBUTOR_REVIEW_SECRET");
  if (!secret) return false;
  try {
    const key = await importKey(secret);
    const sig = fromHex(signatureHex);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

/** Build the canonical payload for a review action. */
export function reviewPayload(
  applicationId: string,
  action: "approve" | "reject",
  expiresAtIso: string,
): string {
  return `${applicationId}.${action}.${expiresAtIso}`;
}
