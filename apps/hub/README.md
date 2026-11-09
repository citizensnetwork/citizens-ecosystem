# Citizens hub (the front door)

The one project that will own the shared domain, `219.co.za`. Every Citizens app is meant to live at
`219.co.za/citizens/<app>`; this app is what answers at that domain and decides who serves what.

```
219.co.za/                  the 219 homepage (this app; it stays light and leads into Citizens)
219.co.za/citizens          Central, the Citizens front door (this app)
219.co.za/citizens/ecosystem, /how-it-works, /philosophy, /get-involved    content pages (this app, in the sitemap)
219.co.za/citizens/learn    "coming soon" page (this app, noindex)    } the registry's COMING_SOON list
219.co.za/citizens/play     "coming soon" page (this app, noindex)    }
219.co.za/citizens/move     "coming soon" page (this app, noindex)    }
219.co.za/citizens/impact   "coming soon" page (this app, noindex)    }
219.co.za/citizens/connect  proxied to the Connect project            } the registry's APP_SLUGS list
219.co.za/citizens/vision   proxied to the Vision project             }
219.co.za/citizens/wear     proxied to the Wear project               }
219.co.za/citizens/<other>  404 (this app)
219.co.za/favicon.ico, /icon.svg, /robots.txt, /sitemap.xml    this app
219.co.za/c/<slug>, /e/<id>, /dashboard ... (Connect's page paths)   308 to the same path under /citizens/connect
219.co.za/<anything else>   404 (this app)
```

**Status: live.** `219.co.za` has answered from this project since the cutover of 2026-11-03 (the steps and their
rollbacks are in [`apps/connect/docs/CUTOVER_219.md`](../connect/docs/CUTOVER_219.md)). A merge to `main` that touches
this app redeploys it, so a change to the pages or their wording goes live with the merge.

## Where the list of apps comes from

[`@citizens/ecosystem`](../../packages/ecosystem/README.md) is the only place that knows the slugs.
`config/hub-config.js` turns it into everything Next is given, and `test/hub-config.test.ts` loads that same file, so
what the tests prove is what the build uses:

| Generated                                                      | From                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/citizens/<slug>` and `/citizens/<slug>/:path*` rewrites      | `APP_SLUGS` (built apps only)                                                                                         |
| the coming-soon pages (`getStaticPaths`)                       | `COMING_SOON`                                                                                                         |
| the security-header rule's source                              | `APP_SLUGS` (every path except the built apps')                                                                       |
| `X-Robots-Tag: noindex` rules                                  | `COMING_SOON`                                                                                                         |
| `robots.txt` (`Disallow` for each app's API) and `sitemap.xml` | `APP_SLUGS`, `SITE_ORIGIN`                                                                                            |
| the landing page tiles and the ecosystem page                  | `APP_SLUGS` + `BUILT_APPS` + `PLATFORM_COPY` in `src/lib/content.ts`, `COMING_SOON`                                   |
| the sitemap's content pages                                    | `HUB_PAGES` in `config/hub-config.js` (a test keeps it equal to `PAGES` in `content.ts`, and clear of every app slug) |

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
do themselves. One policy everywhere: lowercase, no trailing slash, no file extension (Vision and Wear end on
`/citizens/<app>/index.html` because their pages load assets by relative links; changing that is their own work).

**Connect's old root addresses.** From 2026-11-01 to 2026-11-03 `219.co.za` served Connect at the domain root, so a
link copied then reads `https://219.co.za/c/<slug>`, `/e/<id>`, `/dashboard` and so on. `hubRedirects()` sends every
Connect page path (`CONNECT_ROOT_PAGES`, kept equal to Connect's route table by a test) and `/index.html` to the same
path under `/citizens/connect` with a 308, query kept. `/api/*` is not forwarded (nothing called the root API, and a
redirect can turn a POST into a GET).

**Letter case.** Vercel matches the proxy rules without regard to case, so `/citizens/Connect` reaches Connect, whose
page then rewrites the address bar to `/citizens/connect`. The hub's own pages are exact: `/citizens/Ecosystem` is the
hub's 404. Every link the hub writes is lowercase (a test checks each one against the route list).

## Security headers: the hub's own pages only

The hub's pages are HTML plus stylesheets from this app. Central and Settings also load the app's script (the hour
card reads Open-Meteo in the browser, and Settings remembers Light, Dark or System). Nothing inline is allowed, and
`connect-src` adds only `https://api.open-meteo.com`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.open-meteo.com;
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

The founder's design (screenshot of 2026-11-04) is the layout: a white banner with the crown, the three menus, a search
and a gold **Join**; a black hero with a slanted edge and a gold wedge; seven interlocking slanted tiles (Impact spans
the row); the black **An Interconnected Community** band with the crown and its six parts; the Scripture; and the closing
line. White, black and gold at about 60 / 30 / 10: white is the page, black is the hero, the bands and the footer, gold is
the accent (rules, the Join pill, badges, icons and outlines on black). Gold is never text on white. Every text pair is
checked for WCAG AA contrast from the CSS itself (`test/design.test.ts`), and the gold glows on the tile art are capped so
white text on them stays above 4.5:1. Tap targets are 44 px; every page has a skip link, landmarks, one `h1` and no skipped
heading level; the drawn art is gradients and inline SVG, so there is no external font, image request for decoration, or
script.

- **The menus** are `<details>` disclosures: they work by keyboard and pointer with no script, and the shared `name` makes
  opening one close the others. Every menu link goes to another page, so an open menu never covers its own target.
- **The tiles** are a plain rectangular link (so the focus ring is never clipped) with the slanted shape drawn inside it. On
  a wide screen with a pointer, hovering or focusing a tile swaps its verbs for the platform's purpose; on a phone or tablet
  the tile just links, and the ecosystem page says the rest.
- **The Vision eye is not in the diagram on purpose**: Vision is the internal workspace of the contributing organisations and
  supports them throughout, so it is not one of the "parts to play" (the founder's architecture, 2026-11-04).
- **Motion** (the dashes moving along the diagram's lines, the tile brightening) runs only inside
  `prefers-reduced-motion: no-preference`; a test fails if an animation or transition appears outside it.
- **Photography** is not shipped: the design shows real people, and only the founder can supply photographs (with consent).
  The slots are ready: put the file in `public/` and set `HERO_PHOTO` (hero) or `photo` on a platform (tile) in
  `src/lib/content.ts` to `{ src, alt }`; until then each shows its drawn art. A tile photo is decorative (`alt=""`).
- **The crown** is the brand's own `citizens-crown.png` (the file Connect and Wear ship), copied here byte for byte; a test
  keeps the copies identical. `public/icon.svg` and `favicon.ico` are unchanged (Connect's mark).

## Where the words come from

All public wording is in `src/lib/content.ts`, and each block says where it comes from: the founder's website-revision
conversation of 2026-11-04 (the proposed site copy and the Connect / Impact / Vision relationship), the founder's design,
`apps/connect/VISION.md`, the registry's coming-soon lines (approved 2026-11-01), or a fact checked in Connect's code. The
founder reviews any change to it. Three rules the tests enforce:

1. **Vision serves the contributing organisations and does not find needs.** Needs are suggested in Connect, through
   **Kingdom Projects** (the feature Connect already has; the conversation called it "Suggest a Need"). A test fails if the
   Vision copy says Vision finds, discovers or identifies needs, or mentions needs at all.
2. **Say a thing is live only when it is.** "What you can do today" lists only what Connect, Vision and Wear do now, and the
   Impact page shows which of its four steps already work (Proposed, Agreed and Launched, in Kingdom Projects) and which comes
   with Impact (Funded). Wear is not described as a shop: its checkout is not built.
3. **Every door is a real address.** The links into Connect (`/citizens/connect/discover`, `/community`, `/lets`, `/apply`)
   are checked against Connect's own route table (`apps/connect/src/frontend/app/routes.jsx`).
