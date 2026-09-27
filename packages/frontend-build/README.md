# @citizens/frontend-build

The **shared static-frontend build pipeline** for Citizens ecosystem apps
(Connect · Wear · Vision). Extracted at ecosystem Step 4 from the
near-identical `citizens-connect/scripts/build-frontend.js` and
`citizens-wear/apps/wear/scripts/build-frontend.js` so the pipeline exists
**once**; each app keeps a thin, config-only wrapper.

What one `buildFrontend()` call does for an app:

0. **Verify CDN scripts before writing anything** — every unpkg/jsDelivr
   `<script>` of a package in `sriPackages` must pin the exact
   lockfile-installed version and carry an SRI hash equal to the installed
   file's sha384 (see [CDN scripts](#cdn-scripts-exact-pins-sri-production-twins)).
1. Copy `src/frontend/*` → `public/` (or `mobile-dist/` with `mobile: true`).
2. Precompile the `app/*.jsx` screens (window.\*-wired IIFEs, no modules) into
   **one minified, content-hashed bundle** — no runtime Babel-standalone JIT.
3. Minify + hash `auth-client.js`; bundle + hash `capacitor-bridge.js` (the
   one real-ESM file — it imports `@capacitor/*` packages from the host app).
4. Rewrite `index.html` onto the hashed outputs (Babel CDN tag dropped;
   Capacitor bridge loaded **before** auth-client so `window.Cap*` exists;
   development CDN builds swapped for their `data-prod-src` production twins —
   the build fails if any `*.development.js` script would ship).
5. Generate `config.js` from env vars — credentials never enter git.

## Usage (a host app's `scripts/build-frontend.js`)

```js
'use strict';
const path = require('path');
const esbuild = require('esbuild'); // the HOST's esbuild — see below
const { buildFrontend } = require('@citizens/frontend-build');

buildFrontend({
  esbuild,
  rootDir: path.join(__dirname, '..'),
  mobile: process.argv.includes('--mobile'),
  appFileOrder: ['icons.jsx', 'store.jsx' /* …exact load order… */, 'app.jsx'],
  envGlobalName: '__CW_ENV',
  configVars: [
    { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
    { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    {
      key: 'API_BASE_URL',
      env: 'NEXT_PUBLIC_API_BASE_URL',
      mobileEnv: 'MOBILE_API_BASE_URL',
      mobileDefault: 'https://citizens-wear.vercel.app',
    },
  ],
  mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  mobileMissingLabel: 'Supabase',
  sriPackages: ['react', 'react-dom', '@supabase/supabase-js'],
});
```

## CDN scripts: exact pins, SRI, production twins

React, ReactDOM and supabase-js load from CDN UMD `<script>` tags (a
deliberate scope cut — see Connect's RESUME_HERE §B0). OSV-Scanner only reads
`pnpm-lock.yaml`, so the pipeline ties those tags to the lockfile:

```html
<!-- Local no-build dev runs the development build (full React warnings);
     the build swaps in the data-prod-* twin. -->
<script
  src="https://unpkg.com/react@18.3.1/umd/react.development.js"
  integrity="sha384-…"
  crossorigin="anonymous"
  data-prod-src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"
  data-prod-integrity="sha384-…"
></script>
<script
  src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js"
  integrity="sha384-…"
  crossorigin="anonymous"
></script>
```

For every package in `sriPackages`, each `src` / `data-prod-src` URL must:
pin an **exact** version equal to the installed one (resolved from the app
root upward, like Node), name an explicit file that exists in the package,
carry an `integrity` / `data-prod-integrity` equal to `sha384` of that
installed file (pnpm already verified those bytes against the lockfile's
sha512), and — for `src` — `crossorigin="anonymous"`. Every listed package
must appear at least once. Any violation fails the build before anything is
written, and the error prints the expected hash.

**Bumping one of these packages** (a lockfile change) therefore fails the
build until `index.html` follows: move the URL to the new version and paste
the hash from the error. Sanity-check that the CDN serves the same bytes:
`curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.

## Design constraints (read before changing anything)

- **The host injects its own esbuild** (`options.esbuild`). Connect pins
  esbuild 0.28.x, Wear 0.25.x; injection keeps each app's output
  **byte-identical** to what its own toolchain produced before the extraction,
  and keeps this package dependency-free. Never `require('esbuild')` here.
- **Plain CommonJS, no build step.** Host apps run
  `node scripts/build-frontend.js` directly (locally and on Vercel).
- **Output byte-stability is a contract.** The transform options, hash scheme
  (SHA-256 → 10 hex), file ordering, `index.html` regexes, and `config.js`
  rendering are load-bearing; a change here changes every app's shipped
  bytes. Bump `version` when you touch them — every consumer is
  `workspace:*`, so a change here reaches all three apps on their next build.
- `config.js` values resolve as `env || local config || default` — except a
  mobile build's `mobileEnv` vars, which resolve `env || mobileDefault` and
  deliberately **ignore** the local fallback: a store build must never point
  at a localhost API base.

## Consumers

All three apps live in this monorepo and depend on the package as
`workspace:*` — there are no vendored copies any more (they were deleted at
the monorepo lift).

| App         | Wrapper                                  | `sriPackages`                                                                             |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Connect** | `apps/connect/scripts/build-frontend.js` | `react`, `react-dom`, `@supabase/supabase-js`                                             |
| **Wear**    | `apps/wear/scripts/build-frontend.js`    | `react`, `react-dom`, `@supabase/supabase-js`                                             |
| **Vision**  | `apps/vision/scripts/build-frontend.js`  | `@supabase/supabase-js` (npm React is 19 — no UMD build to vouch for the 18.3.1 CDN tags) |
