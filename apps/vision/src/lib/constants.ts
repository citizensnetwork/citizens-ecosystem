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

export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  platform_admin: 100,
  org_admin: 80,
  org_manager: 60,
  org_member: 40,
  org_viewer: 20,
};
