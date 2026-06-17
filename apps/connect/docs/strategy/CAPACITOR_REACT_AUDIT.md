# Capacitor / React / Next Compatibility Audit

> **Owed since** [`ECOSYSTEM_AND_MONOREPO_STRATEGY.md`](./ECOSYSTEM_AND_MONOREPO_STRATEGY.md) §4/§7 ("I have not yet done the dependency audit").
> **Done:** 2026-06-16. Underpins [`ECOSYSTEM_DECISION_BRIEF.md`](./ECOSYSTEM_DECISION_BRIEF.md) §5 (D5).
> **Question it answers:** "Is Connect pinned to React 18 by Capacitor, and how hard is a shared React UI / a React-19 upgrade?"

## TL;DR

**The premise was wrong, in our favour.** Capacitor does **not** pin Connect to React 18, and Connect's Next app has **no React UI to break**. The real divide across the ecosystem is *rendering model*, not React version — which is why **pure-TS shared packages are the correct boundary** and a shared React component library is deferred (not blocked).

---

## 1. Verified stack (from the codebases, not memory)

| App | Framework | React | Native | React UI surface |
|---|---|---|---|---|
| **Connect** (Next app) | Next ^15.5.14 | npm react ^18.3.1 — **legacy/unused** | Capacitor 8 | **None** — 0 page/component `.tsx`, **86** `route.ts`. API-only. |
| **Connect** (live UI) | standalone HTML in `src/frontend/` | **React 18.3.1 via CDN** (`unpkg.com/react@18.3.1/umd` + Babel-standalone) | runs inside Capacitor webview | client-only, in-browser compiled |
| **Wear** | Next 15.5.15 (`apps/web`) | react 18.3.1; `@citizens-wear/ui` peers `^18.3.0` | none | Next client/SSR |
| **Vision** | Next 16.2.3 | react 19.2.4 | none | **SSR/RSC** dashboards (Recharts/Zustand) |

Supporting evidence in Connect:
- `next.config.ts` + `src/middleware.ts` are the substance of the Next app (CORS, CSP, auth/bio-setup gates). No JSX rendering path.
- The only non-`src/frontend` references to UI libs: `src/lib/cn.ts` (clsx + tailwind-merge — pure util) and `src/lib/categoryIcons.ts`, which **copied lucide-react's SVG path data** specifically to avoid importing it as React components. So `@radix-ui/*`, `lucide-react`, `recharts`, `class-variance-authority` in Connect's `package.json` render **nothing**.

---

## 2. Capacitor ⇄ React: there is no coupling

**Capacitor is framework-agnostic by architecture** (well-established fact, not version-specific). It wraps a system **WebView** and exposes native bridges (`@capacitor/geolocation`, `push-notifications`, `share`, `splash-screen`, `status-bar`). It bundles whatever is in `webDir` and never imports React. Connect's `capacitor.config` → `webDir: "mobile-dist"` = the precompiled HTML frontend.

**Implication:** the plugin versions Connect uses (core/android/ios ^8.3, geolocation 8.2, push 8.0.3, share 8.0.1, splash 8.0.1, status-bar 8.0.2) impose **no React constraint whatsoever.** The belief that "Capacitor pinned Connect to React 18" is a myth. The actual React-18 pin is one CDN `<script>` URL in the HTML frontend.

---

## 3. Cost of moving Connect to React 19 / Next 16 (if ever wanted)

Because the Next app is API-only, this is **near-trivial** and gated on nothing native:

| Area | Risk for Connect | Why |
|---|---|---|
| React 18→19 breaking changes (`ReactDOM.render`, `useFormState`, `defaultProps` on fn components, string refs, `propTypes`) | **None found** — grep of `src/` (excl. `src/frontend`) returns 0 such patterns | No React rendering in the Next app |
| Next 15→16 (middleware, `force-dynamic`, image, RSC) | **Low** | `force-dynamic` is on API routes only (correct usage); `images.remotePatterns` is simple; middleware is standard `@supabase/ssr`. No RSC pages to migrate. |
| Capacitor + React 19 | **N/A** | Framework-agnostic (§2) |
| HTML frontend → React 19 | **Low** | Change the unpkg URL to `react@19` UMD; cleaner once the addendum **B0 Vite precompile** replaces CDN+Babel and pins React in a real bundle |

So "upgrade Connect to React 19" is *not* the hard, Capacitor-gated task the old doc feared. It's optional cleanup.

---

## 4. The real constraint: rendering model, not version

A shared `@citizens/ui` React **component** library has to target one rendering model:
- **Connect** frontend = client-only, CDN/Babel (or Vite) React, no SSR.
- **Wear** = Next client/SSR, React 18.
- **Vision** = Next **RSC/SSR**, React **19** (server components, different hook/type semantics).

Connect↔Wear share a model (client-ish React 18) → a shared UI lib between them is feasible later, and Wear already scaffolds `@citizens-wear/ui` peering React 18. **Vision is the outlier** — sharing server-rendered React-19 components with a CDN-React-18 client app is a category mismatch even after a version bump.

**Conclusion → confirms Decision D5:**
- Share **pure-TS** first (`db` types, `contracts`, `connect-client`, `utils`) — zero React coupling, works across all three today. This is the *correct* architectural boundary, not a compromise.
- Defer shared **React UI**; if/when built, scope it to the Connect+Wear pair, keep Vision separate.
- No React-19 upgrade is required to consolidate the DB or the monorepo.

---

## 5. Side cleanups surfaced (not blocking)
- **Connect `package.json` dead deps:** `@radix-ui/*`, `lucide-react`, `recharts`, `class-variance-authority`, `tw-animate-css`, and arguably `react`/`react-dom` render nothing in the API-only app. Pruning them shrinks install/CI and removes a misleading "Connect is a React app" signal. *(Verify no residual import before removing `react`/`react-dom` — `cn.ts` needs only clsx + tailwind-merge.)*
- **Version alignment is unnecessary now** — pnpm in the monorepo lets each app keep its own React/Next. Don't force a global React version.

---

*Author: Claude (Opus 4.8), 2026-06-16. Stack facts verified against the three repos on disk; Capacitor/React/Next breaking-change behaviour is established framework knowledge — re-verify specific minor versions at the moment of any actual upgrade.*
