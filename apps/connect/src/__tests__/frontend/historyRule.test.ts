/**
 * C15, Android Back: Chrome skips history entries a page adds WITHOUT a user gesture when
 * Back is pressed, which once made Back leave Connect altogether. The rule in store.jsx is
 * therefore "push only inside a tap": go() (writeHistory), an overlay's guard
 * (registerBackGuard, run right after the tap that opened it), and the map entry put under
 * a shared listing at the visitor's first tap or keypress (`arm`). Never on page load,
 * never from the popstate handler.
 *
 * The browser proof lives in e2e/routing.spec.ts (every pushState is recorded with
 * navigator.userActivation.isActive). This is the cheap static twin: it fails the moment
 * a new pushState call appears anywhere else, before anyone has to find out on a phone.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/frontend/app/store.jsx"), "utf8");

/** [from, to) of `const <name> = useCallback(` up to its closing `}, [...]);`. */
function callbackBody(name: string): [number, number] {
  const from = src.indexOf(`const ${name} = useCallback(`);
  expect(from, `${name} not found in store.jsx`).toBeGreaterThan(-1);
  const end = src.indexOf("\n    }, [", from);
  expect(end, `end of ${name} not found`).toBeGreaterThan(from);
  return [from, end];
}

/** [from, to) between two literal markers. */
function between(startMarker: string, endMarker: string): [number, number] {
  const from = src.indexOf(startMarker);
  expect(from, `"${startMarker}" not found in store.jsx`).toBeGreaterThan(-1);
  const to = src.indexOf(endMarker, from);
  expect(to, `"${endMarker}" not found after "${startMarker}"`).toBeGreaterThan(from);
  return [from, to];
}

describe("history entries are only ever pushed inside a tap", () => {
  const pushes = [...src.matchAll(/history\.pushState\(/g)].map((m) => m.index as number);

  it("has exactly three pushState calls: go(), an overlay's guard, and the first-tap map entry under a shared listing", () => {
    expect(pushes).toHaveLength(3);
    const allowed = [
      callbackBody("writeHistory"),
      callbackBody("registerBackGuard"),
      between("const arm = () => {", "disarm = () => {"),
    ];
    for (const at of pushes) {
      expect(allowed.some(([from, to]) => at > from && at < to), `pushState at offset ${at} is outside go() / a guard / the first-tap arm`).toBe(true);
    }
  });

  it("the page-load stamp and the popstate handler only ever replace", () => {
    const [bootFrom, bootTo] = between("Page load: stamp the arrival entry", "const arm = () => {");
    const [popFrom, popTo] = between("Browser Back / Forward (popstate)", "The platform's own Back button");
    for (const [from, to] of [[bootFrom, bootTo], [popFrom, popTo]]) {
      expect(src.slice(from, to)).not.toMatch(/history\.pushState\(|writeHistory\(\s*[^)]*,\s*false\s*\)/);
    }
  });

  it("the first-tap arm is wired to a user gesture (click / keydown) and nothing else", () => {
    const [from, to] = between("const arm = () => {", "if (!b.ok) toast(");
    const block = src.slice(from, to);
    expect(block).toMatch(/addEventListener\('click', arm, true\)/);
    expect(block).toMatch(/addEventListener\('keydown', arm, true\)/);
    expect(block).not.toMatch(/setTimeout|requestAnimationFrame|Promise|await|setInterval/);
  });
});
