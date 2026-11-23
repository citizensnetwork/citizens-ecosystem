import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorld } from "@engine/config/world";
import { citizensConfiguration, citizensEntitlements } from "@engine/config/citizens";

/**
 * The standalone frontend (`src/frontend/app/*.jsx`) is plain
 * `React.createElement` inside IIFEs that publish onto `window`, with no build
 * step and therefore no import graph a test can hook into. Tests that pin down
 * its pure logic evaluate a file directly against a stub `window` instead.
 */
const APP_DIR = join(process.cwd(), "src/frontend/app");

/**
 * The world the app's screens read their words from (`window.WORLD`, set by
 * src/frontend/engine-world.js before any screen loads): the Citizens one.
 */
export const citizensWorld = createWorld(citizensConfiguration, citizensEntitlements);

/** Evaluate one frontend IIFE against a stub `window` and return that window. */
export function loadFrontend(file: string, win: Record<string, unknown> = {}) {
  if (!("WORLD" in win)) win.WORLD = citizensWorld;
  const src = readFileSync(join(APP_DIR, file), "utf8");
  // Enough of React for a module body that only DESTRUCTURES hooks at load
  // time; nothing here renders.
  const React = {
    createElement: () => null,
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useState: () => [undefined, () => {}],
    useCallback: (f: unknown) => f,
    Fragment: "Fragment",
  };
  new Function("window", "React", "document", src)(win, React, undefined);
  return win as Record<string, unknown>;
}
