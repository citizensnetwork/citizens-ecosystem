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
