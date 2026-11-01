/**
 * Listing automation: who may receive suggestions at all. ONE definition, shared by the
 * three machine routes (GET /api/automation/sources, POST /api/automation/suggestions and
 * POST /api/automation/digest), so the Reader is never handed a source the suggestions
 * route would then refuse, and the digest never emails someone the reader may not serve.
 *
 * Pure (no I/O). Each route still names its own `.select(...)` columns as a literal, so the
 * profiles column-privacy scan keeps seeing every read of the private consent column.
 */

import { isAutoUpdateLevel, type AutoUpdateLevel } from "@/lib/automation/suggestions";
import { needsExtraReview } from "@/lib/categories";

/** The consent levels that let suggestions in (every level except 'off'). */
export const ELIGIBLE_LEVELS = ["suggest", "events_auto"] as const satisfies readonly AutoUpdateLevel[];

export type ProfileForAutomation = {
  role?: string | null;
  contributor_status?: string | null;
  contributor_hidden?: boolean | null;
  deleted_at?: string | null;
  auto_update_level?: string | null;
  /** Read by the suggestions route, the only one that can publish: Care / Recovery never auto-publishes (#202). */
  contributor_category?: string | null;
};

export type Eligibility = { level: Exclude<AutoUpdateLevel, "off"> } | { reason: "contributor_not_eligible" | "consent_off" };

/**
 * An approved, visible, undeleted Contributor whose automation level is not 'off'. A missing
 * profile is not eligible; an unrecognised level counts as off (never a guess in the reader's favour).
 * A Care / Recovery Contributor (founder decision 2026-10-21, issue #202) is served at most at
 * 'suggest': their consent may say 'events_auto', but nothing of theirs is published without them.
 */
export function contributorEligibility(p: ProfileForAutomation | null | undefined): Eligibility {
  if (!p || p.role !== "contributor" || p.contributor_status !== "approved" || p.contributor_hidden || p.deleted_at) {
    return { reason: "contributor_not_eligible" };
  }
  if (!isAutoUpdateLevel(p.auto_update_level) || p.auto_update_level === "off") return { reason: "consent_off" };
  if (p.auto_update_level === "events_auto" && needsExtraReview(p.contributor_category)) return { level: "suggest" };
  return { level: p.auto_update_level };
}
