export const APP_NAME = "Citizens Vision";

export const ORG_ROLES = [
  "platform_admin",
  "org_admin",
  "org_manager",
  "org_member",
  "org_viewer",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const ROLE_LABELS: Record<OrgRole, string> = {
  platform_admin: "Platform Admin",
  org_admin: "Organisation Admin",
  org_manager: "Manager",
  org_member: "Member",
  org_viewer: "Viewer",
};

export const ACTIVITY_TYPES = [
  "event",
  "meeting",
  "outreach",
  "workshop",
  "service",
  "training",
  "other",
] as const;

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  meeting: "Meeting",
  outreach: "Outreach",
  workshop: "Workshop",
  service: "Service",
  training: "Training",
  other: "Other",
};

export const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  event: "📅",
  meeting: "🤝",
  outreach: "📢",
  workshop: "🔧",
  service: "🤲",
  training: "🎓",
  other: "📋",
};

export const ITEMS_PER_PAGE = 20;

export const GOAL_STATUSES = [
  "draft",
  "active",
  "completed",
  "archived",
] as const;

export const GOAL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const GOAL_STATUS_COLOURS: Record<string, string> = {
  draft: "#abb2bf",
  active: "#4a90d9",
  completed: "#6bcf7f",
  archived: "#6b7280",
};

export const ALIGNMENT_THRESHOLDS = {
  low: 30,
  medium: 70,
} as const;

export const ALIGNMENT_COLOURS = {
  low: "#ef4444",
  medium: "#f5a623",
  high: "#6bcf7f",
} as const;

export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  platform_admin: 100,
  org_admin: 80,
  org_manager: 60,
  org_member: 40,
  org_viewer: 20,
};

// Phase 5: Projects & Milestones

export const PROJECT_STATUSES = [
  "planning",
  "active",
  "completed",
  "archived",
] as const;

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const PROJECT_STATUS_COLOURS: Record<string, string> = {
  planning: "#abb2bf",
  active: "#4a90d9",
  completed: "#6bcf7f",
  archived: "#6b7280",
};

/** Valid forward transitions for project status (non-admins) */
export const PROJECT_STATUS_TRANSITIONS: Record<string, string[]> = {
  planning: ["active"],
  active: ["completed"],
  completed: ["archived"],
  archived: [],
};

// Phase 7: Citizens Connect Integration

export const CC_SYNC_TYPES = [
  "events",
  "places",
  "profiles",
  "full",
] as const;

export const CC_SYNC_TYPE_LABELS: Record<string, string> = {
  events: "Events",
  places: "Places",
  profiles: "Profiles",
  full: "Full Sync",
};

// Phase 8: Advisory Engine

export const ADVISORY_SEVERITIES = ["info", "warning", "critical"] as const;

export const ADVISORY_SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export const ADVISORY_SEVERITY_COLOURS: Record<string, string> = {
  info: "bg-blue-400",
  warning: "bg-yellow-400",
  critical: "bg-red-400",
};

export const ADVISORY_TYPES = [
  "alignment_gap",
  "coverage_gap",
  "trend_alert",
  "milestone_risk",
  "impact_highlight",
  "cc_sync_insight",
] as const;

export const ADVISORY_TYPE_LABELS: Record<string, string> = {
  alignment_gap: "Alignment Gap",
  coverage_gap: "Coverage Gap",
  trend_alert: "Trend Alert",
  milestone_risk: "Milestone Risk",
  impact_highlight: "Impact Highlight",
  cc_sync_insight: "CC Sync Insight",
};

// ── Geo-Boundaries ────────────────────────────────────────

export const COVERAGE_LEVELS = ["gap", "low", "moderate", "well-covered"] as const;

export const COVERAGE_LEVEL_LABELS: Record<string, string> = {
  gap: "Coverage Gap",
  low: "Low Coverage",
  moderate: "Moderate",
  "well-covered": "Well Covered",
};

export const COVERAGE_LEVEL_COLOURS: Record<string, string> = {
  gap: "#f87171",
  low: "#facc15",
  moderate: "#60a5fa",
  "well-covered": "#4ade80",
};

export const COVERAGE_LEVEL_BG_CLASSES: Record<string, string> = {
  gap: "bg-red-400",
  low: "bg-yellow-400",
  moderate: "bg-blue-400",
  "well-covered": "bg-green-400",
};

/** Default boundary colours for picker */
export const BOUNDARY_COLOURS = [
  "#4a90d9",
  "#50c878",
  "#e6a23c",
  "#9b59b6",
  "#e74c3c",
  "#1abc9c",
  "#95a5a6",
] as const;
