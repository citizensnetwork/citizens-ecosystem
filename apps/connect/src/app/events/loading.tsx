/**
 * Events-segment loading boundary.
 *
 * Renders nothing so the map stays visible during client-side navigation
 * within the events segment. Detail views (event/place/profile) now open
 * as full pages (Figma model) — there is no side-drawer to wait on — so no
 * loading placeholder is needed here.
 */
export default function EventsLoading() {
  return null;
}
