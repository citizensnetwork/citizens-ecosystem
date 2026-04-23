/**
 * Events-segment loading boundary.
 *
 * Renders a neutral full-bleed backdrop — no shimmer, no fade-rise.
 *
 * Why: when a user clicks through to `/events/[id]`, the `@panel`
 * parallel slot intercepts with `SidePanel`, which owns its own
 * slide-in. A full-viewport skeleton with a `fade-rise` animation
 * used to play here at the same time, which read as "something
 * drawing up from the bottom" a beat before the panel finished
 * sliding — the glitch reported in the session notes.
 *
 * We still need *some* placeholder so cold loads (direct deep-link
 * into `/events/[id]` without a previously painted map) don't flash
 * white. A flat backdrop matching the page's canvas colour is
 * effectively invisible behind the side panel slide but hides the
 * empty paint on cold loads.
 */
export default function EventsLoading() {
  return (
    <div
      aria-hidden
      className="h-dvh w-full bg-white"
      data-testid="events-loading-backdrop"
    />
  );
}
