// supabase/functions/_shared/push.ts
// Shared push delivery utility. Used by all notification trigger functions.
// Sends push via FCM HTTP v1 API (OAuth2) and inserts in-app notification rows.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  type:
    | "event_reminder"
    | "new_event_match"
    | "event_cancelled"
    | "new_follower"
    | "event_update"
    | "review_prompt"
    | "contributor_approved"
    | "contributor_rejected"
    | "broadcast_sent"
    | "spam_flag"
    | "broadcast_flood"
    | "dm_received"
    | "dm_response";
  image_url?: string;
  data?: Record<string, string>;
  /**
   * When true, skips inserting in-app notification rows.
   * Use when the caller (e.g. an API route) has already inserted them
   * and this function should only deliver FCM push.
   */
  skipInApp?: boolean;
}

// ── FCM v1 OAuth2 token management ──────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtain a Google OAuth2 access token from a service account JSON.
 * Uses RSA-SHA256 JWT assertion grant (no external libraries).
 */
async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;

  let sa: { client_email: string; private_key: string; token_uri: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    console.error("[fcm] Invalid FCM_SERVICE_ACCOUNT_JSON");
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const claimSet = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const signInput = new TextEncoder().encode(`${header}.${claimSet}`);

  // Import PEM private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBuffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );

  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signInput);
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${claimSet}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    console.error("[fcm] Token exchange failed:", await res.text());
    return null;
  }

  const { access_token, expires_in } = await res.json();
  cachedAccessToken = access_token;
  tokenExpiresAt = Date.now() + (expires_in ?? 3600) * 1000;
  return access_token;
}

function getProjectId(): string | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    return JSON.parse(raw).project_id ?? null;
  } catch {
    return null;
  }
}

// ── Main send function ──────────────────────────────────────

/**
 * Insert in-app notification rows for the given users.
 * Push delivery via FCM v1 is attempted when credentials are configured.
 * Accepts a Supabase service-role client to avoid duplicate instantiation.
 */
export async function sendNotifications(
  supabase: SupabaseClient,
  payload: PushPayload
): Promise<void> {
  if (payload.user_ids.length === 0) return;

  // 1. Insert in-app notifications (skipped when caller has already done so)
  if (!payload.skipInApp) {
  const rows = payload.user_ids.map((user_id) => ({
    user_id,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    image_url: payload.image_url ?? null,
    data: payload.data ?? {},
  }));

  const { error: insertErr } = await supabase.from("notifications").insert(rows);
  if (insertErr) {
    console.error("[send-push] Failed to insert notifications:", insertErr.message);
  }
  } // end skipInApp guard

  // 2. Get push tokens for these users (only users with digest = 'instant')
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .in("id", payload.user_ids)
    .eq("notification_digest", "instant");

  if (!profiles || profiles.length === 0) return;

  const instantUserIds = profiles.map((p) => p.id);

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token, platform")
    .in("user_id", instantUserIds);

  if (!tokens || tokens.length === 0) return;

  // 3. Send via FCM HTTP v1 API
  const accessToken = await getAccessToken();
  const projectId = getProjectId();
  if (!accessToken || !projectId) {
    console.log(`[send-push] FCM not configured — ${tokens.length} push(es) skipped (in-app stored)`);
    return;
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const results = await Promise.allSettled(
    tokens.map((t) =>
      fetch(fcmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: {
              title: payload.title,
              body: payload.body,
              ...(payload.image_url ? { image: payload.image_url } : {}),
            },
            data: payload.data ?? {},
          },
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const errBody = await res.text();
          // If token is invalid/unregistered, clean it up
          if (res.status === 404 || errBody.includes("UNREGISTERED")) {
            await supabase.from("push_tokens").delete().eq("token", t.token);
            console.log(`[send-push] Removed stale token: ${t.token.slice(0, 12)}...`);
          }
          throw new Error(`FCM ${res.status}: ${errBody}`);
        }
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[send-push] ${failed}/${tokens.length} push deliveries failed`);
  }
}
