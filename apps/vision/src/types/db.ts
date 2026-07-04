// Citizens Vision — Database Types

export type OrgRole =
  | "platform_admin"
  | "org_admin"
  | "org_manager"
  | "org_member"
  | "org_viewer";

export type ActivityType =
  | "event"
  | "meeting"
  | "outreach"
  | "workshop"
  | "service"
  | "training"
  | "other";

export type ActivitySourceType =
  | "manual"
  | "citizens_connect"
  | "bulk_import"
  | "api";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Parent organisation (Phase 13). Null for top-level/flat orgs. */
  parent_org_id?: string | null;
}

export interface Department {
  id: string;
  org_id: string;
  parent_department_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
}

export interface UserOrgRole {
  id: string;
  user_id: string;
  org_id: string;
  role: OrgRole;
  department_id: string | null;
  created_at: string;
  /** Optional human-readable job title, e.g. "Head of Operations" (Phase 13). */
  title?: string | null;
  /** Display/semantic marker; overrides `role` label to "Founder" (Phase 13). */
  is_founder?: boolean;
}

export interface UserOrgRoleWithOrg extends UserOrgRole {
  organisations: Organisation;
}

export interface Activity {
  id: string;
  org_id: string;
  department_id: string | null;
  title: string;
  description: string | null;
  type: ActivityType;
  date: string;
  start_time: string | null;
  end_time: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  participant_count: number;
  source_type: ActivitySourceType;
  source_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityTag {
  activity_id: string;
  tag: string;
}

export interface ActivityWithTags extends Activity {
  activity_tags: ActivityTag[];
}

// Phase 4: Goals & Alignment

export type GoalStatus = "draft" | "active" | "completed" | "archived";
export type GoalLinkType = "explicit" | "inferred";

export interface VisionStatement {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  org_id: string;
  vision_id: string | null;
  title: string;
  description: string | null;
  target_value: number | null;
  target_unit: string | null;
  deadline: string | null;
  priority_weight: number;
  status: GoalStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GoalWithVision extends Goal {
  vision_statements: Pick<VisionStatement, "title"> | null;
}

export interface GoalActivityLink {
  id: string;
  goal_id: string;
  activity_id: string;
  link_type: GoalLinkType;
  confidence: number;
  approved: boolean | null;
  created_at: string;
}

export interface GoalActivityLinkWithActivity extends GoalActivityLink {
  activities: Pick<Activity, "id" | "title" | "type" | "date">;
}

// Phase 5: Projects & Milestones

export type ProjectStatus = "planning" | "active" | "completed" | "archived";

export interface Project {
  id: string;
  org_id: string;
  department_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithDepartment extends Project {
  departments: Pick<Department, "name"> | null;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  target_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProjectGoalLink {
  project_id: string;
  goal_id: string;
  created_at: string;
}

export interface ProjectActivity {
  project_id: string;
  activity_id: string;
  created_at: string;
}

export interface ProjectGoalLinkWithGoal extends ProjectGoalLink {
  goals: Pick<Goal, "id" | "title" | "status">;
}

export interface ProjectActivityWithActivity extends ProjectActivity {
  activities: Pick<Activity, "id" | "title" | "type" | "date">;
}

// Phase 7: Citizens Connect Integration

/**
 * A Citizens Connect event as surfaced in Vision: live fields from Connect's
 * /api/v1 merged with this org's claim status (vision.cc_event_claims).
 */
export interface CCEvent {
  cc_event_id: string;
  title: string;
  description: string | null;
  date: string | null;
  end_time: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  created_by: string | null;
  rsvp_count: number;
  avg_rating: number | null;
  cv_org_id: string | null;
  cv_project_id: string | null;
  cv_activity_id: string | null;
}

/**
 * A Citizens Connect place as surfaced in Vision: live fields from Connect's
 * /api/v1 merged with this org's claim status (vision.cc_place_claims).
 */
export interface CCPlace {
  cc_place_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  verified: boolean;
  avg_rating: number | null;
  cv_org_id: string | null;
}

// Phase 8: Advisory Engine

export type AdvisorySeverity = "info" | "warning" | "critical";

export type AdvisoryType =
  | "alignment_gap"
  | "coverage_gap"
  | "trend_alert"
  | "milestone_risk"
  | "impact_highlight"
  | "cc_sync_insight";

export interface AdvisoryTemplate {
  id: string;
  type: AdvisoryType;
  title_template: string;
  body_template: string;
  severity: AdvisorySeverity;
  active: boolean;
  created_at: string;
}

export interface AdvisoryRule {
  id: string;
  template_id: string;
  metric_slug: string;
  operator: string;
  threshold: number;
  lookback_days: number;
  cooldown_hours: number;
  active: boolean;
  created_at: string;
}

export interface AdvisoryOutput {
  id: string;
  org_id: string;
  template_id: string;
  rule_id: string;
  title: string;
  body: string;
  severity: AdvisorySeverity;
  data: Record<string, unknown>;
  dismissed: boolean;
  dismissed_at: string | null;
  dismissed_notes: string | null;
  created_at: string;
}

export interface AdvisoryRuleWithTemplate extends AdvisoryRule {
  advisory_templates: Pick<AdvisoryTemplate, "type" | "title_template" | "body_template" | "severity">;
}

// ── Phase 9: Geo-Boundaries ────────────────────────────────

export type CoverageLevel = "gap" | "low" | "moderate" | "well-covered";

export interface GeoBoundary {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  boundary_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  area_km2: number | null;
  colour: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoundaryCoverage {
  boundary_id: string;
  org_id: string;
  boundary_name: string;
  activity_count: number;
  participant_reach: number;
  department_count: number;
  coverage_level: CoverageLevel;
  min_lng: number;
  max_lng: number;
  min_lat: number;
  max_lat: number;
}

// ── Phase 11: Multi-Org Federation ─────────────────────────

export type PartnershipStatus = "pending" | "active" | "rejected" | "revoked";
export type SharingLevel = "none" | "summary" | "detailed";

export interface OrgPartnership {
  id: string;
  org_a_id: string;
  org_b_id: string;
  status: PartnershipStatus;
  sharing_level: SharingLevel;
  initiated_by: string;
  responded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgPartnershipWithOrgs extends OrgPartnership {
  org_a: Pick<Organisation, "id" | "name" | "slug">;
  org_b: Pick<Organisation, "id" | "name" | "slug">;
}

export interface SharedMetric {
  id: string;
  partnership_id: string;
  metric_slug: string;
  visible: boolean;
  created_at: string;
}
