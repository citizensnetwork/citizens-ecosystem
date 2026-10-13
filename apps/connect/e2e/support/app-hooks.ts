import type { Page } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
//  Typed access to the app's own test hooks (store.jsx `window.__cc`, map.jsx
//  `window.__ccMap`) WITHOUT redeclaring them on the global `Window`.
//
//  Every spec in this folder shares one TypeScript program, so two files that
//  `declare global { interface Window { __cc: … } }` with different shapes
//  fail the typecheck against each other. These helpers cast inside the
//  browser callback instead, so each spec only types what it actually uses.
// ════════════════════════════════════════════════════════════════════

type Role = "citizen" | "contributor" | "admin";
type Hooks = {
  go: (page: string, params?: Record<string, unknown>) => void;
  setRole: (role: Role) => void;
};

/** `window.__cc.go(page)`: navigate the SPA without clicking through the chrome. */
export function goTo(page: Page, to: string) {
  return page.evaluate((p) => (window as unknown as { __cc: Hooks }).__cc.go(p), to);
}

/** Demo mode only: switch the role the app is showing, then navigate, in one step (so React sees both before the next render). */
export function setRoleAndGo(page: Page, role: Role, to: string) {
  return page.evaluate(
    ([r, p]) => {
      const cc = (window as unknown as { __cc: Hooks }).__cc;
      cc.setRole(r as Role);
      cc.go(p);
    },
    [role, to] as const,
  );
}

/**
 * The old map, as a device that used Map v2's escape hatch (`?map=v1`) has it: the opt-out is
 * stored before any page script runs. Map v2 is the default since D15 (2026-10-13), so a spec
 * about the old pins or the old preview card calls this first. Call it before the first `goto`.
 */
export function useOldMap(page: Page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem("cc_map_v2", "v1");
    } catch {
      /* storage blocked: the spec would then run on the default map and fail loudly */
    }
  });
}

/** Resolves once the MapLibre map exists, so "no pin" is a real result and not a page that never loaded. */
export function mapReady(page: Page) {
  return page.waitForFunction(() => !!(window as unknown as { __ccMap?: unknown }).__ccMap, undefined, {
    timeout: 15_000,
  });
}
