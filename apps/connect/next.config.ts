import type { NextConfig } from "next";

// Next 16 compiles next.config.ts to CommonJS. Node 22 then loads that output
// as ESM when it contains require(), which throws "exports is not defined".
// This file stays free of runtime imports. __dirname is the CommonJS global
// the compiler preserves; two levels up from apps/connect is the monorepo root.
const outputFileTracingRoot = __dirname.replace(/\\/g, "/").split("/").slice(0, -2).join("/");

// CDN domains required by the static HTML frontend (loaded via <script> / <link> tags).
// These are only needed when the frontend is served from the same Next.js project
// (i.e. after scripts/build-frontend.js copies it into public/).
const FRONTEND_SCRIPT_CDN = "https://unpkg.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net";
const FRONTEND_STYLE_CDN  = "https://unpkg.com https://fonts.googleapis.com";
const FRONTEND_IMG_CDN    = "https://images.unsplash.com";

// First path segments of the frontend's single-segment screens (see rewrites() below).
const APP_PAGES = [
  "map", "discover", "explore", "community", "me", "messages", "notifications",
  "settings", "apply", "onboarding", "dashboard", "admin",
];

// Where this app is served on the shared domain: "" (NEXT_PUBLIC_BASE_PATH unset, as today) is the site root,
// "/citizens/connect" serves everything under that prefix. Do NOT set it in a Vercel project yet: read
// packages/ecosystem/README.md ("Rollout rule"). The rule is packages/ecosystem's resolveBasePath. This file
// cannot import it (see the note at the top), so it is copied here, and
// src/__tests__/frontend/basePath.test.ts fails if the copy and the package ever disagree.
const BASE_PATH = "/citizens/connect";
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();
if (rawBasePath !== "" && rawBasePath !== "/" && rawBasePath.replace(/\/$/, "") !== BASE_PATH) {
  throw new Error(
    `[ecosystem] NEXT_PUBLIC_BASE_PATH=${JSON.stringify(rawBasePath)} is not valid for "connect": ` +
      `leave it unset to serve from the site root, or set it to exactly "${BASE_PATH}".`,
  );
}
const basePath = rawBasePath === "" || rawBasePath === "/" ? "" : BASE_PATH;

const nextConfig: NextConfig = {
  // Spread, so an unset value leaves the config exactly as it was (no `basePath` key at all). Next then prefixes
  // rewrites, headers, public/ files, _next and /api with it; the explicit rewrites below need no change.
  ...(basePath ? { basePath } : {}),
  // Do not let `next dev` write Next.js's agent-rules block into AGENTS.md. It does so whenever it detects an AI coding
  // agent, so every agent session left the file modified (and a new one in apps that have none). `false` also removes
  // the block if it is there. See apps/connect/RESUME_HERE.md, C38.
  agentRules: false,
  // Must be the MONOREPO root, not this app's own directory — pnpm hoists
  // Next's own compiled submodules (e.g. next/dist/compiled/source-map) up to
  // the workspace root's node_modules. Scoping this to apps/connect makes
  // Next's output-file-tracer miss them, so Vercel's serverless bundle for
  // every /api/* route ships without them and the Lambda crashes on cold
  // start with "Cannot find module 'next/dist/compiled/source-map'" — the
  // actual cause of prod's blank map/DB (turbo.json env-var work was real but
  // unrelated). Wear's next.config.js already uses this same pattern.
  outputFileTracingRoot,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xyiajtrvhlxaeplsiajj.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // Node.js 24 breaks webpack's WasmHash in worker threads
    webpackBuildWorker: false,
  },
  // Every screen of the static frontend has its own address (src/frontend/app/routes.jsx
  // is the table): /, /discover, /e/<id>, /p/<id>, /c/<slug>, /dashboard/<tab>, ...
  // They are REWRITES, not redirects: the same index.html is served while the
  // address bar keeps the path, and store.jsx reads window.location to open the
  // right screen, so a refresh keeps you where you were and a link can be shared.
  // (index.html loads its scripts through <base href="/">, so a nested path such as
  // /e/<id> cannot break them; that is why /c/<slug> used to have to REDIRECT.)
  //
  // The list is EXPLICIT on purpose, and must never become a catch-all: that would
  // shadow /api/*, /auth/*, /_next/* and every static file. An unknown path keeps
  // Next's own 404. __tests__/frontend/routeRewrites.test.ts keeps this list equal to
  // routes.jsx's PREFIXES. /index.html itself is still served as a file, so old
  // bookmarks and /index.html?c=<slug> links keep working (the app rewrites the
  // address bar to the new form on load).
  async rewrites() {
    const toApp = (source: string) => ({ source, destination: "/index.html" });
    return [
      toApp("/"),
      ...APP_PAGES.map((page) => toApp(`/${page}`)),
      toApp("/messages/:id"),
      toApp("/dashboard/:tab"),
      toApp("/admin/:tab"),
      toApp("/e/:id"),
      toApp("/p/:id"),
      toApp("/c/:slug"),
      // Token is required. A bare /upgrade is not a screen and stays a 404.
      toApp("/upgrade/:token"),
      toApp("/upgrade/:token/decline"),
    ];
  },

  async headers() {
    return [
      {
        // `/:path*`, NOT `/(.*)`: under a basePath Next prefixes the pattern, and `/citizens/connect/(.*)` needs a
        // slash after the prefix, so the bare `/citizens/connect` (the app's front door) got no headers at all.
        // `/:path*` matches the bare prefix too. Pinned by src/__tests__/frontend/basePath.test.ts.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-eval' is required by Next.js React Refresh in development.
              // CDN domains are needed for the static HTML frontend (React/Babel/MapLibre via unpkg).
              `script-src 'self' 'unsafe-inline' ${FRONTEND_SCRIPT_CDN}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
              `style-src 'self' 'unsafe-inline' ${FRONTEND_STYLE_CDN}`,
              `img-src 'self' data: blob: ${FRONTEND_IMG_CDN} https://xyiajtrvhlxaeplsiajj.supabase.co https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://api.maptiler.com https://basemaps.cartocdn.com`,
              "font-src 'self' https://fonts.gstatic.com",
              "media-src 'self' blob: https://xyiajtrvhlxaeplsiajj.supabase.co",
              "connect-src 'self' https://xyiajtrvhlxaeplsiajj.supabase.co wss://xyiajtrvhlxaeplsiajj.supabase.co https://nominatim.openstreetmap.org https://api.maptiler.com https://tile.openstreetmap.org https://basemaps.cartocdn.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      // CORS for `/api/*` moved to src/middleware.ts (multi-origin allow-list:
      // deployed frontend + Capacitor shells + localhost dev — addendum §B2).
      // Static headers can only echo ONE origin, which broke the mobile shells.
    ];
  },
};

export default nextConfig;
