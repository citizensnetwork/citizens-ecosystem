// src/lib/dashboard/adminAttribution.ts
//
// Helpers for Stage A admin-on-behalf-of attribution:
//   - getActiveAdminGrant   → detect "admin acting for contributor" state
//   - markViewingStarted    → stamp viewing_started_at on first dashboard load
//   - logAdminOnBehalfAction→ write activity_log entry + notify contributor
//
// All callers must be server-side (use the server Supabase client).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveAdminGrant {
  id: string;
  expires_at: string | null;
  viewing_started_at: string | null;
}

/**
 * Returns the active, non-revoked, non-expired access grant for an admin →
 * contributor pair, or `null` if there is no current grant.
 */
export async function getActiveAdminGrant(
  supabase: SupabaseClient,
  adminId: string,
  contributorId: string,
): Promise<ActiveAdminGrant | null> {
  const { data } = await supabase
    .from("contributor_access_requests")
    .select("id, expires_at, viewing_started_at")
    .eq("admin_id", adminId)
    .eq("contributor_id", contributorId)
    .eq("status", "approved")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<ActiveAdminGrant>();
  return data ?? null;
}

/**
 * Idempotently stamps `viewing_started_at` on the admin's active access grant.
 * Server-side only — relies on `auth.uid()` matching the grant's admin_id.
 */
export async function markViewingStarted(
  supabase: SupabaseClient,
  requestId: string,
): Promise<void> {
  await supabase.rpc("mark_admin_viewing_started", { p_request_id: requestId });
}

export interface OnBehalfActionInput {
  contributorId: string;
  contributorSlug: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records an admin-on-behalf-of action against the contributor.
 *
 * Inserts:
 *   1. `activity_log` row with actor_role='admin' and on_behalf_of metadata.
 *   2. `notifications` row for the contributor (type='admin_on_behalf_action').
 *
 * Best-effort: errors are logged and swallowed so the calling mutation does
 * not get rolled back if the audit insert fails.
 */
export async function logAdminOnBehalfAction(
  supabase: SupabaseClient,
  input: OnBehalfActionInput,
): Promise<void> {
  const { contributorId, contributorSlug, adminId, action, entityType, entityId, metadata } = input;

  const { error: logError } = await supabase.from("activity_log").insert({
    contributor_id: contributorId,
    actor_id: adminId,
    actor_role: "admin",
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: { ...(metadata ?? {}), on_behalf_of: contributorId },
  });
  if (logError) {
    console.error("[adminAttribution] activity_log insert failed", logError);
  }

  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: contributorId,
    type: "admin_on_behalf_action",
    title: "Admin action on your behalf",
    body: `An admin performed "${action}" on your ${entityType}.`,
    image_url: null,
    data: {
      action,
      entity_type: entityType,
      entity_id: entityId,
      admin_id: adminId,
      url: `/c/${contributorSlug}/dashboard/settings`,
    },
  });
  if (notifError) {
    console.error("[adminAttribution] notifications insert failed", notifError);
  }
}
