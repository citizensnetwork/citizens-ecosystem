# @citizens/ecosystem

Where each Citizens app lives on the shared domain. The ecosystem is meant to
be served from **one domain, one path per app**:

```
https://<domain>/citizens/connect
https://<domain>/citizens/vision
https://<domain>/citizens/wear        (learn, play, move, impact ... follow, see "Coming soon")
```

This package is the single place that knows those paths. Each app's
`next.config` and `scripts/build-frontend.js` asks it for the app's own base
path, so no app carries a path string of its own.

Plain CommonJS with a `.d.ts`, no dependencies, no build step (the same shape
as [`@citizens/frontend-build`](../frontend-build/README.md)).

## API

| Export                        | What it is                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_SLUGS`                   | The apps that exist in this repo: `connect`, `vision`, `wear`. A slug is a public URL segment, so never rename one casually.                                                     |
| `PATH_ROOT`                   | `/citizens`.                                                                                                                                                                     |
| `BASE_PATH_ENV`               | `NEXT_PUBLIC_BASE_PATH`, the env var an app's Vercel project sets.                                                                                                               |
| `appPath(slug)`               | `/citizens/<slug>`. Throws on an unknown slug.                                                                                                                                   |
| `resolveBasePath(slug, raw)`  | `''` (site root) or exactly `appPath(slug)`. Unset, blank and `/` mean the site root; one trailing slash is forgiven; **anything else throws**, including another app's path.    |
| `basePathFromEnv(slug, env?)` | `resolveBasePath` for `process.env` (or the env you pass).                                                                                                                       |
| `SITE_ORIGIN`                 | `https://219.co.za`, the shared domain (no trailing slash).                                                                                                                      |
| `COMING_SOON`                 | Apps planned but not built: `learn`, `play`, `move`, `impact`, each with a public `label` and one-line `summary`. A slug here is never in `APP_SLUGS` (the tests fail if it is). |
| `PRODUCTION_ORIGINS`          | Each built app's own production address, `https://citizens-ecosystem-<app>.vercel.app`.                                                                                          |
| `appOrigin(slug, env?)`       | `HUB_ORIGIN_<SLUG>` when set (a bare origin; https, or http for localhost), otherwise the production address. Throws on a path, query, login or other scheme.                    |
| `originEnvName(slug)`         | `HUB_ORIGIN_CONNECT`, `HUB_ORIGIN_VISION`, `HUB_ORIGIN_WEAR`.                                                                                                                    |
| `OLD_HOSTS`                   | Hosts an app used to answer on before the shared domain (Connect: `citizenscentral.co.za` and `www.citizenscentral.co.za`).                                                      |
| `oldAddressRules(slug, base)` | The redirects and rewrites an app adds to its `next.config` while it is under its prefix (see "Old addresses"). Both lists are empty when `base` is `''`.                        |

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
2. Something routes `/citizens/<app>/*` to the app: the front door,
   [`apps/hub`](../../apps/hub/README.md), as its own Vercel project that owns
   the shared domain. The code is in the repo; the project is created at the
   cutover.
3. The old addresses forward to the new ones (pages redirect, `/api/*` is
   rewritten so POSTs from the Google Apps Script intake and installed mobile
   builds keep working). Built: see "Old addresses" below.

The order and the rollback for every step are in
[`apps/connect/docs/CUTOVER_219.md`](../../apps/connect/docs/CUTOVER_219.md).

`turbo.json` lists the variable in `globalEnv`, so a build made with one value
is never replayed from cache for another. It also lists `HUB_ORIGIN_CONNECT`,
`HUB_ORIGIN_VISION` and `HUB_ORIGIN_WEAR`, which are baked into a build the same
way.

## Old addresses (`oldAddressRules`)

Only while `NEXT_PUBLIC_BASE_PATH` is set. With it unset both lists are empty and
the `next.config` is exactly what it was. Every rule says `basePath: false`,
because Next otherwise prefixes the rule and it could never match an address that
has no prefix.

| What arrives                                                                                  | What happens                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect only: any page path on `citizenscentral.co.za` or `www.citizenscentral.co.za`, `/` in | 308 (permanent) to `https://219.co.za/citizens/connect/<path>`, query kept. Printed QR codes (`/c/<slug>`), `/index.html?c=<slug>` and `/dashboard` work. |
| Same hosts, `/api/*`, `/_next/*`, or a path already starting `/citizens/`                     | Not redirected. `/api` is rewritten (next row); the others are not old addresses.                                                                         |
| Any host, bare `/`                                                                            | Temporary redirect to the app's prefix on the same host. Covers the `*.vercel.app` addresses, and `219.co.za` while it is still attached to Connect.      |
| Any host, `/api/*`                                                                            | **Rewritten**, never redirected: the Apps Script intake POSTs to `www.citizenscentral.co.za/api/intake/google-form`, and a redirect can become a GET.     |

**Why the `/api` destination is a full URL.** Next refuses a `basePath: false`
rewrite whose destination is a path (`rewrites urls outside of the basePath`);
only an absolute `http(s)` URL is accepted. So the destination is the app's own
production address plus its prefix (`appOrigin(slug)`): one extra hop into the
same Vercel project. The second hop is an ordinary prefixed request, so the app's
middleware runs on it and a CORS preflight is answered normally. It has not been
tried on Vercel itself; the cutover runbook checks it with a POST.

**Connect and Vision cannot import this package at run time** (see above), so
their `next.config.ts` carry an inline copy of the same rules, and the parity
tests (`basePath.test.ts` in each app) run the same inputs through the copy and
through `oldAddressRules` and fail on any difference, including the error text for
a bad `HUB_ORIGIN_*`. Wear's `next.config.js` calls the package directly.

## Coming soon

`COMING_SOON` reserves `/citizens/learn`, `/citizens/play`, `/citizens/move` and
`/citizens/impact`
for a "coming soon" page on the front door. When one of them is built, **move**
its entry to `APP_SLUGS`: the front door then proxies to it instead of showing
the page. The two lists must never share a slug; the tests fail if they do. The
names and one-liners are public copy, so the founder reviews any change to them.

**Trying it locally on Windows:** Git Bash rewrites a value that looks like a
POSIX path, so `NEXT_PUBLIC_BASE_PATH=/citizens/connect pnpm build` reaches the
build as `C:/Program Files/Git/citizens/connect` and is (rightly) refused. Run
`export MSYS2_ENV_CONV_EXCL=NEXT_PUBLIC_BASE_PATH` first (do not use the broader
`MSYS_NO_PATHCONV=1`: it breaks pnpm's own shim), or set the variable from
PowerShell, or put it in the app's `.env.local`.

## Adding an app

Add its slug to `APP_SLUGS` (and remove it from `COMING_SOON` if it was reserved
there), then give its `next.config` and `build-frontend.js` the two lines above,
add its production address to `PRODUCTION_ORIGINS`, a card to the front door's
`BUILT_APPS` (`apps/hub/src/lib/content.ts`; the type checker asks for it), and its
name to `scripts/vercel-ignore.mjs`'s `APPS` if it is a new Vercel project. The
tests fail if a slug is not a safe URL segment, is listed twice, or is in both
lists.
