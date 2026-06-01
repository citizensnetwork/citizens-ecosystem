/**
 * Tiny pub-sub bus for "the detail SidePanel was fully dismissed".
 *
 * The intercepted-route SidePanel (`src/components/ui/SidePanel.tsx`) and the
 * map view (`EventsView.tsx`) live in different React trees (the `@panel`
 * parallel-route slot vs the page), so they can't share state directly. When
 * the user fully closes the panel (the X), we publish here so `EventsView` can
 * defensively clear any lingering inline glass-card state (`selectedEvent` /
 * `selectedPlace`). This is belt-and-suspenders against the two overlay
 * surfaces desyncing on deep-linked or nested panels — see
 * `docs/NAVIGATION_SURFACES.md`.
 *
 * Mirrors the easter-egg bus: small, singleton, no generic event passing.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribePanelClosed(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishPanelClosed(): void {
  // Copy before iterating so a listener can safely unsubscribe mid-dispatch.
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      console.warn("[panelBus] listener error", err);
    }
  }
}
