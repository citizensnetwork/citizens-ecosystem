# Connect cold entry, measured (fix plan PR F0, 2026-11-25)

QA finding CCQA-0001: a first-time visitor waited 12 to 27 s for "Browse as Guest" in the QA runner. This note is the gate the plan asks for before PRs F1 to F3: the real numbers, where the time goes, and the budget.

## Method

- **Page:** `https://219.co.za/citizens/connect` (production, `main` at #397), read-only, nobody signed in.
- **Tool:** `apps/connect/scripts/measure-cold-entry.mjs` (Playwright Chromium, headless). It times the guest button with a MutationObserver from before the first byte, so it also works on builds without the new mark.
- **Profiles:** desktop 1280x900 with no throttling; phone = Pixel 7 on Lighthouse's "Slow 4G" (150 ms RTT, 1.6 Mbps down, 750 kbps up) with the CPU 4x slower.
- **Cold** is a new browser context (empty cache). **Warm** is a second visit in the same context.
- **Caveat:** measured from a cloud container in a far region through a proxy, not from a phone in Pretoria. Read the phone row as "a mid-range phone on an average mobile connection", not as a field measure.

## Results (five runs each, median)

| Profile                | Cold: guest button        | Cold: first paint | Warm: guest button | Warm: first paint |
| ---------------------- | ------------------------- | ----------------- | ------------------ | ----------------- |
| Desktop                | 1.04 s (0.99 to 1.21)     | 1.10 s            | 0.29 s             | 0.34 s            |
| Phone, Slow 4G, CPU 4x | **4.00 s** (3.88 to 4.03) | **4.17 s**        | 1.00 s             | 1.16 s            |

An earlier three-run pass the same evening gave 3.7 s on the phone (cold) and 1.1 to 2.6 s on desktop (cold).

**The phone shows nothing at all until the guest button.** First paint comes after the button, because every stylesheet and the Tailwind script in `<head>` block rendering, and the body is empty until React mounts.

## Where the time goes (phone, cold)

What a first visit downloads before it can show the button (sizes on the wire, compressed):

| File                                            | Size                   | Where from                     | Blocks                                            |
| ----------------------------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------- |
| Tailwind Play CDN (compiles CSS in the browser) | 126 KB                 | cdn.tailwindcss.com            | rendering, then CPU                               |
| lucide, every icon                              | 112 KB                 | unpkg.com                      | the parser (in `<head>`)                          |
| `app/bundle.<hash>.js` (the app, minified)      | 219 KB                 | 219.co.za                      | the guest button                                  |
| react-dom production                            | 43 KB                  | unpkg.com                      | the guest button                                  |
| supabase-js                                     | 47 KB                  | cdn.jsdelivr.net               | the guest button                                  |
| react production                                | 4 KB                   | unpkg.com                      | the guest button                                  |
| 3 Google font families (CSS plus font files)    | ~0.5 KB CSS plus fonts | fonts.googleapis.com / gstatic | text paint                                        |
| MapLibre module                                 | 294 KB                 | 219.co.za                      | nothing directly, but it shares the 1.6 Mbps link |

About 550 KB of scripts are on the critical path, plus 294 KB of MapLibre competing for the same bandwidth. At 1.6 Mbps that is roughly 4 s of transfer, which is the cold figure. Warm loads are fast (1 s) because every file is cached: the problem is first-time visitors, and they are the ones the guest button is for.

The last files to arrive before the button, in a typical cold phone run: the app bundle (3.7 s), Tailwind (3.3 s), lucide (3.1 s), supabase-js (2.2 s).

## Budget (founder, 2026-11-25)

**Cold, on the throttled phone profile: first paint within 1.5 s, the guest button within 3 s.**

- `e2e/cold-entry.spec.ts` records both on every CI run (`performance.mark('cc-guest-visible')` set by the landing, and the browser's first-contentful-paint), cold and warm, and attaches them to the Playwright report. In CI the app's own files come from the local dev server, so its figure is a regression signal rather than the live number. The first local run gave cold 3.9 s, close to live.
- F0 only records. **F1 turns the budget on** (`ENFORCE_BUDGET` in the spec) once the render blockers are gone.

## What each later PR should buy

- **F1:** Tailwind compiled at build time (126 KB and the in-browser compile gone), the unused font links dropped, and a pre-React skeleton, so first paint comes with the HTML and its CSS, well inside 1.5 s. Load MapLibre only when the map is needed, not on the sign-in landing (found here; not in the plan).
- **F2:** React, supabase-js and lucide served from our own hashed build. lucide with only the icons the app uses instead of all of them (most of its 112 KB). Fewer origins means fewer TLS handshakes at 150 ms RTT each.
- **F3:** no speed change; the CSP can then drop the CDN hosts and `'unsafe-inline'` in `script-src`.

Re-measure after each PR with `node apps/connect/scripts/measure-cold-entry.mjs` and compare with the table above.

## After F1 (local e2e, 2026-11-25)

`e2e/cold-entry.spec.ts` on the same throttled phone profile, one worker, the app served by the local dev server (gzip; production sends Brotli), the CDN scripts from the internet:

| Build                                                                                      | Cold: first paint | Cold: guest button |
| ------------------------------------------------------------------------------------------ | ----------------- | ------------------ |
| F0 (Play CDN, Google Fonts, lucide in `<head>`)                                            | 3.9 s             | 3.9 s              |
| F1 (compiled Tailwind, self-hosted fonts, boot screen, lucide after it, MapLibre deferred) | **0.62 s**        | **3.13 to 3.19 s** |

First paint is inside its 1.5 s budget, and CI enforces it from F1. The guest button is still just over 3 s; most of what remains is the whole lucide icon set (112 KB) and three CDN origins, which F2 removes. CI enforces the guest budget from F2. Re-measure live after each deploy with `node apps/connect/scripts/measure-cold-entry.mjs`.

## After F2 (local e2e, 2026-11-25)

The same profile and spec, one worker:

| Build                                                                                                                                                                              | Cold: first paint  | Cold: guest button |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------ |
| F1                                                                                                                                                                                 | 0.62 s             | 3.13 to 3.19 s     |
| F2 (React, ReactDOM, supabase-js and lucide from our own origin; lucide trimmed from about 2,000 icons to 134, 112 KB to 7 KB on the wire; content-hashed files cached for a year) | **0.59 to 0.61 s** | **2.64 to 2.66 s** |

Both budgets are now enforced in CI. The page names no other origin for its scripts, styles or fonts.

**What is left is CPU, not network.** A warm load, with every file in the cache, is about as slow as a cold one (2.7 s). On a phone CPU four times slower than a laptop, the time goes into parsing and running the app bundle (about 700 KB raw) before React draws the landing. The next real gain would come from splitting that bundle so the landing does not wait for every screen. That's not part of this plan; noted for later.
