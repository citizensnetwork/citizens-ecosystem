# @citizens/ecosystem

Where each Citizens app lives on the shared domain. The ecosystem is meant to
be served from **one domain, one path per app**:

```
https://<domain>/citizens/connect
https://<domain>/citizens/vision
https://<domain>/citizens/wear        (learn, play, move ... follow)
```

This package is the single place that knows those paths. Each app's
`next.config` and `scripts/build-frontend.js` asks it for the app's own base
path, so no app carries a path string of its own.

Plain CommonJS with a `.d.ts`, no dependencies, no build step (the same shape
as [`@citizens/frontend-build`](../frontend-build/README.md)).

## API

| Export                        | What it is                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_SLUGS`                   | The apps that exist in this repo: `connect`, `vision`, `wear`. A slug is a public URL segment, so never rename one casually.                                                  |
| `PATH_ROOT`                   | `/citizens`.                                                                                                                                                                  |
| `BASE_PATH_ENV`               | `NEXT_PUBLIC_BASE_PATH`, the env var an app's Vercel project sets.                                                                                                            |
| `appPath(slug)`               | `/citizens/<slug>`. Throws on an unknown slug.                                                                                                                                |
| `resolveBasePath(slug, raw)`  | `''` (site root) or exactly `appPath(slug)`. Unset, blank and `/` mean the site root; one trailing slash is forgiven; **anything else throws**, including another app's path. |
| `basePathFromEnv(slug, env?)` | `resolveBasePath` for `process.env` (or the env you pass).                                                                                                                    |

## How an app uses it

```js
// apps/<app>/scripts/build-frontend.js (every app)
const { basePathFromEnv } = require('@citizens/ecosystem');
buildFrontend({ /* ... */ basePath: basePathFromEnv('connect') });
```

```js
// apps/wear/next.config.js (CommonJS, so it can require the package)
const { basePathFromEnv } = require('@citizens/ecosystem');
const basePath = basePathFromEnv('wear');
module.exports = { ...(basePath ? { basePath } : {}) /* ...the rest */ };
```

**Connect and Vision are different.** Their `next.config.ts` must not import
anything at run time: Next 16 compiles it to CommonJS and Node 22 then fails on
the `require()` (see the note at the top of Connect's file). So each carries a
short inline copy of `resolveBasePath`, and a test per app
(`apps/connect/src/__tests__/frontend/basePath.test.ts`,
`apps/vision/src/__tests__/basePath.test.ts`) runs the same inputs through the
copy and through this package and fails if the value or the error message
differs. If you change the rule here, those tests tell you to change the copies.

One more rule for any `headers()` entry in a `next.config`: use `source:
'/:path*'`, never `'/(.*)'`. Under a `basePath` Next prefixes the pattern, and
`/citizens/connect/(.*)` needs a slash after the prefix, so the bare
`/citizens/connect` got no security headers at all.

With `NEXT_PUBLIC_BASE_PATH` unset (today's production) nothing changes: not a
byte of the build output. Setting it to the app's own path makes Next serve
everything under that prefix (pages, `public/` files, `_next`, `/api`) and makes
`@citizens/frontend-build` point the page's `<base>` and the API base at it.

## Rollout rule: do not set it early

`NEXT_PUBLIC_BASE_PATH` is read at **build** time. Setting it on a Vercel
project makes that app answer only under its prefix, so its old root URLs stop
working. Leave it unset in every Vercel environment until all of these exist:

1. The app's frontend is prefix-aware. Connect's is (C39 PR B: `stripBase` and
   `withBase` in its route table, proven by Connect's `test:e2e:base-path`
   script); Vision's and Wear's have not been checked.
2. Something routes `/citizens/<app>/*` to the app (a front-door project on the
   shared domain).
3. The old addresses forward to the new ones (pages redirect, `/api/*` is
   rewritten so POSTs from the Google Apps Script intake and installed mobile
   builds keep working).

`turbo.json` lists the variable in `globalEnv`, so a build made with one value
is never replayed from cache for another.

**Trying it locally on Windows:** Git Bash rewrites a value that looks like a
POSIX path, so `NEXT_PUBLIC_BASE_PATH=/citizens/connect pnpm build` reaches the
build as `C:/Program Files/Git/citizens/connect` and is (rightly) refused. Run
`export MSYS2_ENV_CONV_EXCL=NEXT_PUBLIC_BASE_PATH` first (do not use the broader
`MSYS_NO_PATHCONV=1`: it breaks pnpm's own shim), or set the variable from
PowerShell, or put it in the app's `.env.local`.

## Adding an app

Add its slug to `APP_SLUGS`, then give its `next.config` and
`build-frontend.js` the two lines above. The tests fail if a slug is not a safe
URL segment or is listed twice.
