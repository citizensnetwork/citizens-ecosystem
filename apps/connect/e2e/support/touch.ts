import type { CDPSession, Page } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
//  REAL touch for Playwright (Chromium only).
//
//  `page.mouse` and synthetic `PointerEvent` objects never go through the browser's touch
//  pipeline: `touch-action` is not consulted and Chrome never takes a swipe over for
//  scrolling (which is what ends a pointer stream in `pointercancel`). CDP's
//  Input.dispatchTouchEvent does go through it, so a spec that needs to know what a thumb
//  would do uses these helpers. Use them in a context created with `hasTouch: true` and
//  `isMobile: true`.
// ════════════════════════════════════════════════════════════════════

export type Pt = { x: number; y: number };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function touchSession(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

type TouchOpts = {
  /** Total time of the move phase in ms (default 240). */
  ms?: number;
  /** Number of touchMove events (default 12). */
  steps?: number;
  /** Horizontal travel in px (default 0). */
  dx?: number;
  /** Keep the finger down after the last move (default false: lift it). */
  hold?: boolean;
};

const send = (cdp: CDPSession, type: string, points: Pt[]) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
  } as never);

/** One finger: down at `from`, move by (dx, dy) over `ms`, up. */
export async function swipe(cdp: CDPSession, from: Pt, dy: number, o: TouchOpts = {}) {
  const steps = o.steps ?? 12;
  const ms = o.ms ?? 240;
  const dx = o.dx ?? 0;
  await send(cdp, "touchStart", [from]);
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await send(cdp, "touchMove", [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }]);
  }
  if (!o.hold) await send(cdp, "touchEnd", []);
}

/**
 * A quick flick. CDP round trips take 15 to 50 ms on a busy machine and the page stamps each event when it arrives
 * (a virtual clock is ignored), so waiting between the events would make the flick as slow as the machine. All the
 * events are therefore sent without waiting for an answer: they arrive back to back, a few ms apart, far above the
 * sheet's 0.5 px/ms line.
 */
export async function flickTouch(cdp: CDPSession, from: Pt, dy: number, steps = 6) {
  const calls = [send(cdp, "touchStart", [from])];
  for (let i = 1; i <= steps; i++) calls.push(send(cdp, "touchMove", [{ x: from.x, y: from.y + (dy * i) / steps }]));
  calls.push(send(cdp, "touchEnd", []));
  await Promise.all(calls);
}

/** Down, a little movement, then the system cancels the touch (an incoming call, a gesture the OS keeps). */
export async function swipeThenCancel(cdp: CDPSession, from: Pt, dy: number, o: TouchOpts = {}) {
  await swipe(cdp, from, dy, { ...o, hold: true });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] } as never);
}

/** A tap: down and up in place. */
export async function tapTouch(cdp: CDPSession, at: Pt) {
  await send(cdp, "touchStart", [at]);
  await sleep(40);
  await send(cdp, "touchEnd", []);
}

/** Two fingers moving together (both by `dy`), e.g. the two-finger vertical drag that tilts a map. */
export async function twoFingerSwipe(cdp: CDPSession, a: Pt, b: Pt, dy: number, o: TouchOpts = {}) {
  const steps = o.steps ?? 12;
  const ms = o.ms ?? 360;
  const dx = o.dx ?? 0;
  await send(cdp, "touchStart", [a, b]);
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    const k = i / steps;
    await send(cdp, "touchMove", [
      { x: a.x + dx * k, y: a.y + dy * k },
      { x: b.x + dx * k, y: b.y + dy * k },
    ]);
  }
  await send(cdp, "touchEnd", []);
}

/** Two fingers spreading apart (scale > 1) or pinching together (scale < 1) around `centre`: a pinch zoom. */
export async function pinch(cdp: CDPSession, centre: Pt, fromGap: number, toGap: number, o: TouchOpts = {}) {
  const steps = o.steps ?? 14;
  const ms = o.ms ?? 420;
  const at = (gap: number): Pt[] => [
    { x: centre.x - gap / 2, y: centre.y },
    { x: centre.x + gap / 2, y: centre.y },
  ];
  await send(cdp, "touchStart", at(fromGap));
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await send(cdp, "touchMove", at(fromGap + ((toGap - fromGap) * i) / steps));
  }
  await send(cdp, "touchEnd", []);
}

/** Two fingers turning around `centre` by `degrees` at radius `r`: a rotate gesture. */
export async function rotateGesture(cdp: CDPSession, centre: Pt, r: number, degrees: number, o: TouchOpts = {}) {
  const steps = o.steps ?? 14;
  const ms = o.ms ?? 420;
  const at = (deg: number): Pt[] => {
    const t = (deg * Math.PI) / 180;
    return [
      { x: centre.x + r * Math.cos(t), y: centre.y + r * Math.sin(t) },
      { x: centre.x - r * Math.cos(t), y: centre.y - r * Math.sin(t) },
    ];
  };
  await send(cdp, "touchStart", at(0));
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await send(cdp, "touchMove", at((degrees * i) / steps));
  }
  await send(cdp, "touchEnd", []);
}

/** Counts pointer events by type on `document` (capture phase) into `window.__ptr`, from the next navigation on. */
export function recordPointerEvents(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { __ptr: Record<string, number> };
    w.__ptr = {};
    for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      document.addEventListener(t, () => { w.__ptr[t] = (w.__ptr[t] || 0) + 1; }, true);
    }
  });
}
export const pointerCounts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ptr: Record<string, number> }).__ptr);
export const resetPointerCounts = (page: Page) =>
  page.evaluate(() => { (window as unknown as { __ptr: Record<string, number> }).__ptr = {}; });
