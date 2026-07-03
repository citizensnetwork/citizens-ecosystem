// src/lib/dashboard/activity.ts
//
// Stage A item 7 — unified contributor mutation recorder.
//
// Every mutating contributor route should call `recordContributorMutation`
// after a successful write so the activity_log captures who actually did it
// (owner vs admin-on-behalf-of) and the contributor gets notified on admin
// actions.
//
// Owner path  → activity_log row with actor_role='contributor'.
// Admin path  → delegates to `logAdminOnBehalfAction` (activity_log row with
//               actor_role='admin' + admin_on_behalf_action notification with
//               a `data.url` deep-link to the settings page).
//
// Best-effort: errors are logged and swallowed so the calling mutation is not
// rolled back if the audit insert fails (mirrors `logAdminOnBehalfAction`).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardAccessResult } from "./access";
import { logAdminOnBehalfAction } from "./adminAttribution";

export interface ContributorMutationInput {
  /** Contributor slug (handle) used to deep-link admin notifications. */
  handle: string;
  /** Result from `checkDashboardAccess`. Must be `hasAccess: true`. */
  access: Extract<DashboardAccessResult, { hasAccess: true }>;
  /** Authenticated user performing the mutation (auth.uid()). */
  actorId: string;
  /** Short action verb, e.g. `broadcast_sent`, `keyword_added`. */
  action: string;
  /** Logical entity touched, e.g. `broadcast`, `keyword`, `task`. */
  entityType: string;
  /** UUID of the touched entity. */
  entityId: string;
  /** Optional structured metadata to merge into the log row. */
  metadata?: Record<string, unknown>;
}

export async function recordContributorMutation(
  supabase: SupabaseClient,
  input: ContributorMutationInput,
): Promise<void> {
  const { handle, access, actorId, action, entityType, entityId, metadata } = input;

  if (access.isAdminWithAccess) {
    await logAdminOnBehalfAction(supabase, {
      contributorId: access.contributorId,
      contributorSlug: handle,
      adminId: actorId,
      action,
      entityType,
      entityId,
      metadata,
    });
    return;
  }

  const { error } = await supabase.from("activity_log").insert({
    contributor_id: access.contributorId,
    actor_id: actorId,
    actor_role: "contributor",
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? {},
  });
  if (error) {
    console.error("[recordContributorMutation] activity_log insert failed", error);
  }
}
