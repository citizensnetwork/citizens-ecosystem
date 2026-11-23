import "@testing-library/jest-dom/vitest";

// The frontend screens read their words from window.WORLD, which
// src/frontend/engine-world.js sets before any screen loads (engine step E7).
import { citizensWorld } from "../frontend/support/loadFrontend";

if (typeof window !== "undefined") {
  (window as unknown as { WORLD: typeof citizensWorld }).WORLD = citizensWorld;
}
