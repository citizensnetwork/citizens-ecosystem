/**
 * Tiny pub-sub bus for Easter-egg trigger signals.
 *
 * EasterEggOrchestrator and EventsView are mounted as siblings on
 * `/events`, so the map/detail surfaces can't directly pass state to the
 * orchestrator.  Rather than lift all interaction state into the page
 * RSC, we publish compact trigger events to a singleton bus that the
 * orchestrator subscribes to.
 *
 * Events are intentionally scoped to the small set of triggers the
 * registry cares about — no generic event passing.  Keeping the
 * surface area small lets TypeScript enforce correct usage.
 */

export type EasterEggBusEvent =
  | { type: "category_tapped"; category: string }
  | { type: "contributor_action_attempted" };

type Listener = (event: EasterEggBusEvent) => void;

const listeners = new Set<Listener>();

export function subscribeEasterEggBus(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishEasterEggEvent(event: EasterEggBusEvent): void {
  // Copy before iterating so a listener can safely unsubscribe mid-dispatch.
  for (const fn of [...listeners]) {
    try {
      fn(event);
    } catch (err) {
      console.warn("[easterEggBus] listener error", err);
    }
  }
}
