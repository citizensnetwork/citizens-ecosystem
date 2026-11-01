# Citizens hub (the front door)

The one project that will own the shared domain, `219.co.za`. Every Citizens app is meant to live at
`219.co.za/citizens/<app>`; this app is what answers at that domain and decides who serves what.

```
219.co.za/                  302 to /citizens (a 302, so the root stays free for later)
219.co.za/citizens          the ecosystem landing page (this app)
219.co.za/citizens/learn    "coming soon" page (this app, noindex)    } the registry's COMING_SOON list
219.co.za/citizens/play     "coming soon" page (this app, noindex)    }
219.co.za/citizens/move     "coming soon" page (this app, noindex)    }
219.co.za/citizens/connect  proxied to the Connect project            } the registry's APP_SLUGS list
219.co.za/citizens/vision   proxied to the Vision project             }
219.co.za/citizens/wear     proxied to the Wear project               }
219.co.za/citizens/<other>  404 (this app)
219.co.za/favicon.ico, /icon.svg, /robots.txt, /sitemap.xml    this app
```

**Status: built, not live.** Nothing points at it yet. The Vercel project, the domain move and the environment
variables are the cutover, in [`apps/connect/docs/CUTOVER_219.md`](../connect/docs/CUTOVER_219.md). Merging this code
changes no production behaviour.

## Where the list of apps comes from

[`@citizens/ecosystem`](../../packages/ecosystem/README.md) is the only place that knows the slugs.
`config/hub-config.js` turns it into everything Next is given, and `test/hub-config.test.ts` loads that same file, so
what the tests prove is what the build uses:

| Generated                                                      | From                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/citizens/<slug>` and `/citizens/<slug>/:path*` rewrites      | `APP_SLUGS` (built apps only)                                          |
| the coming-soon pages (`getStaticPaths`)                       | `COMING_SOON`                                                          |
| the security-header rule's source                              | `APP_SLUGS` (every path except the built apps')                        |
| `X-Robots-Tag: noindex` rules                                  | `COMING_SOON`                                                          |
| `robots.txt` (`Disallow` for each app's API) and `sitemap.xml` | `APP_SLUGS`, `SITE_ORIGIN`                                             |
| the landing page cards                                         | `APP_SLUGS` + `BUILT_APPS` copy in `src/lib/content.ts`, `COMING_SOON` |

## Proxying

Each built app is an **external rewrite**, `beforeFiles` so it wins over every hub page, to the same path on the app's
own project:

```
/citizens/connect/:path*  ->  ${HUB_ORIGIN_CONNECT}/citizens/connect/:path*
```

The path is kept whole because each app is built with the matching `basePath` (`NEXT_PUBLIC_BASE_PATH`). Method, body,
query string, `Cookie`, `Authorization` and CORS preflights pass through; the response is the app's own, status and
headers untouched (two `Set-Cookie` headers stay two). `scripts/proxy-proof.mjs` shows each of those against two fake
upstreams.

| Variable             | Default                                         | Where it is read                            |
| -------------------- | ----------------------------------------------- | ------------------------------------------- |
| `HUB_ORIGIN_CONNECT` | `https://citizens-ecosystem-connect.vercel.app` | **build time** (Next bakes the rewrites in) |
| `HUB_ORIGIN_VISION`  | `https://citizens-ecosystem-vision.vercel.app`  | build time                                  |
| `HUB_ORIGIN_WEAR`    | `https://citizens-ecosystem-wear.vercel.app`    | build time                                  |

A bare origin only: `https://host` (or `http://localhost:port` in tests), no path, query or login. Anything else fails
the build with the variable's name in the message. Leave them unset on Vercel unless an app's address changes; changing
one needs a redeploy of the hub.

`/citizens/connect/` (trailing slash) is redirected by the hub to `/citizens/connect` (308, the default), like the apps
do themselves.

## Security headers: the hub's own pages only

The hub's pages are static HTML plus one external stylesheet and **no script at all**, so the policy allows nothing
inline:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

plus `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and HSTS. The header rule's
`source` is generated to **exclude `/citizens/<built app>` and everything below it**: those responses come from the
apps, which send their own CSP, and a second policy from the hub would be added to theirs or replace it. A proxied
response therefore carries exactly the upstream's headers. This is checked three ways: a unit test of the pattern; the
proof script against a real `next start` (an upstream that sends no security headers gets none from the hub); and the
proof script's read of the build's own `.next/routes-manifest.json`, whose compiled pattern must not match any proxied
path. The third matters because a mutation test showed `next start` never puts the hub's header rules on a proxied
answer even when the pattern is wrong, whereas Vercel builds its routing table from that same manifest and may.

Pages are Pages Router with `unstable_runtimeJS: false` (the App Router would put inline `self.__next_f.push(...)`
scripts in every page, which a strict CSP forbids).

## Static files

`public/robots.txt` and `public/sitemap.xml` are generated from the registry; a test fails if the committed copy differs
from `robotsTxt()` / `sitemapXml()`. To regenerate:

```bash
node -e "const c=require('./config/hub-config.js'),fs=require('fs');fs.writeFileSync('public/robots.txt',c.robotsTxt());fs.writeFileSync('public/sitemap.xml',c.sitemapXml())"
```

`public/icon.svg` is Connect's mark (a test keeps it byte-identical to `apps/connect/public/icons/icon.svg`).
`public/favicon.ico` holds 16, 32 and 48 pixel PNGs rendered from that SVG (made once with `sharp`; a test checks the
file's structure). **There is no `/.well-known/assetlinks.json` here on purpose**: the native-links work may add it, and
the proof script asserts it is a 404 until someone does.

Each app names its **own** icon with a relative `<link rel="icon" href="icons/icon.svg">`. Browsers ask the domain root
for `/favicon.ico` when a page names no icon; under one shared domain the root is this app's, not any app's, so a
relative link (which resolves under each app's prefix) keeps every app showing its own icon, and `/favicon.ico` here is
only the fallback.

## Run it

```bash
pnpm --filter citizens-hub dev          # http://localhost:3000/citizens (the proxied paths need the upstreams to run)
pnpm --filter citizens-hub test         # unit tests (config tables, pages, contrast, static files)
pnpm --filter citizens-hub proof:proxy  # builds the hub against two fake upstreams and checks real HTTP, ~1 minute
```

`proof:proxy` overwrites `apps/hub/.next`; run `pnpm --filter citizens-hub build` afterwards for a normal build. It is not
part of CI (it builds the app a second time).

## Design

White, black and gold at about 60 / 30 / 10: white is the page, black is the banner, hero, buttons and footer, gold is
the accent (rules, the "Coming soon" badge, focus on black). Gold is never text on white. Every text pair is checked for
WCAG AA contrast from the CSS itself (`test/design.test.ts`); tap targets are 44 px; the page has a skip link, landmarks,
one `h1` and no skipped heading level; no external font, image or script.

All public wording is in `src/lib/content.ts` (taken from `apps/connect/VISION.md`) and in the registry's
`COMING_SOON`. The founder reviews any change to it.
