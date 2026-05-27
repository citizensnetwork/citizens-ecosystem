/**
 * Events-segment loading boundary.
 *
 * Renders nothing so the map stays fully visible while the `@panel`
 * parallel slot loads the `SidePanel` drawer on client-side navigation
 * to `/events/[id]`. A white backdrop used to show here, which briefly
 * covered the map before the panel's slide-in completed — the "ghost
 * bar from the bottom" glitch reported by users.
 *
 * Cold loads (direct deep-link to `/events/[id]`) bypass the `@panel`
 * intercept and render the full event page directly, so no loading
 * placeholder is needed for that path either.
 */
export default function EventsLoading() {
  return null;
}
