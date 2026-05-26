// Contributor theme tint — single source of truth for whether the
// `data-contributor-ui` attribute should be applied to contributor-owned
// surfaces (Stage B of docs/plans/contributor-dashboard.md).
//
// Accepts two env-flag forms (both are dev-only opt-outs):
//   NEXT_PUBLIC_CONTRIBUTOR_THEME=off
//   NEXT_PUBLIC_CONTRIBUTOR_THEME_ENABLED=false
//
// Query-param override (e.g. `?contributorTheme=off`) is handled
// client-side by <ContributorThemeOverride />.

export function isContributorThemeEnabled(): boolean {
  const v1 = process.env.NEXT_PUBLIC_CONTRIBUTOR_THEME;
  const v2 = process.env.NEXT_PUBLIC_CONTRIBUTOR_THEME_ENABLED;
  if (v1 && v1.toLowerCase() === "off") return false;
  if (v2 && v2.toLowerCase() === "false") return false;
  return true;
}
