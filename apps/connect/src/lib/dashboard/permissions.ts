// Who may do what on a contributor dashboard, after checkDashboardAccess.
//
// Owner and admin-with-grant keep every power they already had.
// An active editor may change public listing content (profile allow-list,
// news, events, places, services, listing sources and suggestions).
// An active viewer may open the dashboard and its analytics, and nothing else.
// Pending, declined and removed memberships never reach hasAccess.

import type { DashboardAccessResult } from "./access";

type Granted = Extract<DashboardAccessResult, { hasAccess: true }>;

function granted(access: DashboardAccessResult): Granted | null {
  return access.hasAccess ? access : null;
}

/** Owner, or an admin using an approved access grant. Not an editor or a viewer. */
export function canAdministerListing(access: DashboardAccessResult): boolean {
  const row = granted(access);
  return !!row && (row.isOwner || row.isAdminWithAccess);
}

/**
 * Owner, admin-with-grant, or an active editor.
 * Viewers and everyone else are refused.
 */
export function canEditListingContent(access: DashboardAccessResult): boolean {
  const row = granted(access);
  if (!row) return false;
  return row.isOwner || row.isAdminWithAccess || row.teamRole === "editor";
}

/** A viewer grant, and not also the owner or an admin (those keep their own powers). */
export function isDashboardViewer(access: DashboardAccessResult): boolean {
  const row = granted(access);
  return !!row && row.teamRole === "viewer" && !row.isOwner && !row.isAdminWithAccess;
}
