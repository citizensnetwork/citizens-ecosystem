# HANDOFF — Give Citizens Wear a Content-Security-Policy

> **Status (2026-09-27):** recommended next work, **not started**. Pipeline item **S1** in
> [`RESUME_HERE.md`](../../RESUME_HERE.md). Rescued into the repo on 2026-09-27 from a local-only hand-off
> (`%TEMP%\citizens-handoff-2026-09-27-post-pr66.md`, written after PR #66). Origin: RESUME §3AT
> "Honest checkpoint" (archived in [`../archive/RESUME_HISTORY_2026H2.md`](../archive/RESUME_HISTORY_2026H2.md)).
>
> Facts below were gathered 2026-09-27. **Verify them; don't trust them blindly.**

## Why
Wear is live and holds users' auth sessions (email + password, 6-digit code and Google), but it sends **no CSP
header at all**. Connect and Vision both send one. `apps/wear/next.config.js` sets X-Frame-Options, HSTS,
nosniff, Referrer-Policy and Permissions-Policy, and its comment says "CSP is deliberately conservative for
Phase 2", but there is no CSP key. Since PR #66 the CDN scripts are pinned and SRI-checked; a CSP is the
remaining defence-in-depth layer against injected script. (VISION litmus #5: excellence as stewardship of
the trust users place in us.)

## Facts gathered
- Wear serves the static frontend from `public/index.html` (redirect `/` → `/index.html`, as Connect does).
  `src/middleware.ts` exists (Supabase session refresh, with a `matcher`).
- `apps/wear/src/frontend/index.html` has **no inline `<script>` blocks** (all 25 tags use `src=`), so Wear may
  be able to ship `script-src` **without `'unsafe-inline'`**, stricter than Connect. Re-check the **built**
  `public/index.html` too.
- External hosts in `index.html`: `unpkg.com` (React, ReactDOM, lucide), `cdn.jsdelivr.net` (supabase-js),
  `fonts.googleapis.com` (styles), `fonts.gstatic.com` (fonts).
- Runtime: Supabase `https://xyiajtrvhlxaeplsiajj.supabase.co` + `wss://` (auth, REST, realtime, storage
  images/media → check `img-src` / `media-src`). `/api/*` is same-origin.
- Models to copy from: `apps/connect/next.config.ts` (CSP built from constants) and `apps/vision/next.config.ts`
  (tighter: no `'unsafe-inline'` in `script-src`).
- Mobile (`mobile-dist/`, Capacitor) is unaffected: HTTP headers only apply to the web build.
- Wear has **no Playwright e2e**, so browser verification is manual (or add a smoke spec).

## Suggested approach
1. Draft the policy from the facts above. Don't copy Connect's `'unsafe-inline'` unless it is proven necessary.
2. Verify under `next start` (real headers) on **every** screen: sign-in (password, 6-digit code, Google
   hand-off — stop at Google's page), feed, discover, create post **with media upload**, concepts, brand
   apply, admin queue, impersonation, settings. Target: 0 CSP violations.
3. If a screen can't be exercised locally, ship `Content-Security-Policy-Report-Only` first and enforce it in
   a follow-up.
4. Vibe-security check. Never widen Connect's or Vision's CSP as a side effect.

## Local-env gotcha
Wear's `.env.local` holds only a `VERCEL_OIDC_TOKEN` and no Supabase vars, so a local build gets a blank
`config.js` ("Supabase is not configured"). All three apps share one Supabase project; the two **public**
values (`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`) are in `apps/connect/.env.local`. Inject them into the local
process env only (never commit or print them). Vision has the same gap: its `next start` returns 500 on
every request without them.

## Other gotchas from the authoring session
- **GitHub auto-merge is disabled on this repo:** merge manually once CI is green.
- **Parallel sessions:** CI tests the PR merge ref, and `main` can move mid-PR. Rebase/merge `main` before
  merging, and re-check anything numbered (RESUME entries, migration numbers).
- Suggested skills: `security-review` (the CSP change), `run` (launch Wear under `next start` and click through
  every screen), `code-review` (before opening the PR).
