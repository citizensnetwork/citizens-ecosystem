import type { OrgRole } from "@/types/db";

/**
 * Display vocabulary from the product brief.
 *
 * The underlying RBAC role values (`platform_admin`, `org_admin`,
 * `org_manager`, `org_member`, `org_viewer`) are unchanged — this layer
 * is purely for UI presentation so existing RLS policies, API contracts
 * and the 732-test suite keep working.
 */
export const ROLE_LABELS: Record<OrgRole, string> = {
  platform_admin: "Platform Admin",
  org_admin: "CEO",
  org_manager: "Admin",
  org_member: "Employee",
  org_viewer: "Viewer",
};

/**
 * Short one-line description of what each role can do. Intended for
 * hover tooltips and settings pages.
 */
export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  platform_admin:
    "Cross-organisation platform operator. Manages tenants and global settings.",
  org_admin:
    "Top-level organisation lead. Full control of the organisation and its sub-orgs.",
  org_manager:
    "Departmental administrator. Manages content and members within their remit.",
  org_member: "Regular team member. Contributes activities and views dashboards.",
  org_viewer: "Read-only observer. Sees dashboards and reports.",
};

/**
 * Returns the user-facing label for a role, honouring the founder flag.
 *
 * Founders are rendered as "Founder" regardless of their underlying RBAC
 * role, matching the brief's Founder / CEO / Admin / Employee hierarchy.
 */
export function getRoleDisplayLabel(
  role: OrgRole,
  isFounder?: boolean | null,
): string {
  if (isFounder) return "Founder";
  return ROLE_LABELS[role];
}

/**
 * Combines a role label with an optional job title for richer display,
 * e.g. `"CEO · Head of Operations"`. Falls back to the role label alone.
 */
export function getRoleAndTitle(
  role: OrgRole,
  title?: string | null,
  isFounder?: boolean | null,
): string {
  const label = getRoleDisplayLabel(role, isFounder);
  const trimmed = title?.trim();
  return trimmed ? `${label} · ${trimmed}` : label;
}
