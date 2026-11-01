import type { NextConfig } from "next";

// Where this app is served on the shared domain: "" (NEXT_PUBLIC_BASE_PATH unset, as today) is the site root,
// "/citizens/vision" serves everything under that prefix. Do NOT set it in a Vercel project yet: read
// packages/ecosystem/README.md ("Rollout rule"). The rule is packages/ecosystem's resolveBasePath. Next 16
// compiles next.config.ts to CommonJS and Node 22 then fails on a runtime import (Connect's next.config.ts hit
// it), so the rule is copied here and src/__tests__/basePath.test.ts fails if the copy and the package disagree.
const BASE_PATH = "/citizens/vision";
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();
if (rawBasePath !== "" && rawBasePath !== "/" && rawBasePath.replace(/\/$/, "") !== BASE_PATH) {
  throw new Error(
    `[ecosystem] NEXT_PUBLIC_BASE_PATH=${JSON.stringify(rawBasePath)} is not valid for "vision": ` +
      `leave it unset to serve from the site root, or set it to exactly "${BASE_PATH}".`,
  );
}
const basePath = rawBasePath === "" || rawBasePath === "/" ? "" : BASE_PATH;

// The addresses that existed before the shared domain keep working while the prefix is on: the bare "/" goes to the
// prefix, and "/api/*" is REWRITTEN (never redirected). The rule is packages/ecosystem's oldAddressRules("vision",
// basePath); like the base path above it is copied here, and src/__tests__/basePath.test.ts fails if the copy and the
// package ever disagree. Both lists are empty when the prefix is unset, so today's behaviour is untouched. Next
// refuses a `basePath: false` rewrite to an internal path, so the "/api" destination is this app's own production
// address (HUB_ORIGIN_VISION overrides it): one extra hop into the same project.
type OldRedirect = { source: string; destination: string; basePath: false; permanent: boolean };
type OldRewrite = { source: string; destination: string; basePath: false };

/** HUB_ORIGIN_VISION when set (a bare origin), otherwise this app's production address. */
function ownOrigin(): string {
  const raw = (process.env.HUB_ORIGIN_VISION ?? "").trim();
  if (raw === "") return "https://citizens-ecosystem-vision.vercel.app";
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    url = undefined;
  }
  const loopback = url !== undefined && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const schemeOk = url !== undefined && (url.protocol === "https:" || (url.protocol === "http:" && loopback));
  const bare = url !== undefined && url.pathname === "/" && url.search === "" && url.hash === "" && url.username === "" && url.password === "";
  if (url === undefined || !schemeOk || !bare) {
    throw new Error(
      `[ecosystem] HUB_ORIGIN_VISION=${JSON.stringify(raw)} is not valid: use a bare origin such as ` +
        `"https://example.vercel.app" (https only; http only for localhost), with no path, query or login.`,
    );
  }
  return url.origin;
}

function oldAddressRules(): { redirects: OldRedirect[]; rewrites: OldRewrite[] } {
  if (!basePath) return { redirects: [], rewrites: [] };
  return {
    redirects: [{ source: "/", basePath: false, destination: basePath, permanent: false }],
    rewrites: [{ source: "/api/:path*", basePath: false, destination: `${ownOrigin()}${basePath}/api/:path*` }],
  };
}
const oldAddress = oldAddressRules();

const nextConfig: NextConfig = {
  // Spread, so an unset value leaves the config exactly as it was (no `basePath` key at all). Next then prefixes
  // the "/" redirect, the headers, public/ files, _next and /api with it.
  ...(basePath ? { basePath } : {}),
  // Do not let `next dev` write Next.js's agent-rules block into AGENTS.md. It does so whenever it detects an AI coding
  // agent, so every agent session left the file modified (and a new one in apps that have none). `false` also removes
  // the block if it is there. See apps/connect/RESUME_HERE.md, C38.
  agentRules: false,
  experimental: {
    webpackBuildWorker: false,
  },
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // The RSC page tree is gone (ecosystem Step 4c unit 4): Next now serves the
  // /api/* surface plus the static HTML frontend that scripts/build-frontend.js
  // compiles into public/. `/` is the app.
  redirects: async () => [
    { source: "/", destination: "/index.html", permanent: false },
    // Old address: the bare "/" goes to the prefix (empty until NEXT_PUBLIC_BASE_PATH is set).
    ...oldAddress.redirects,
  ],
  // Old address: "/api/*" (absent until NEXT_PUBLIC_BASE_PATH is set).
  ...(basePath ? { rewrites: async () => oldAddress.rewrites } : {}),
  headers: async () => [
    {
      // `/:path*`, NOT `/(.*)`: under a basePath Next prefixes the pattern, and `/citizens/vision/(.*)` needs a slash
      // after the prefix, so the bare `/citizens/vision` got no headers. `/:path*` matches it too (same as Wear).
      // Pinned by src/__tests__/basePath.test.ts.
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(self), payment=()",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          // Content-Security-Policy tuned for the STATIC HTML frontend
          // (ecosystem Step 4c — Vision is the only Citizens app shipping a
          // CSP so far; Connect/Wear deferred theirs):
          //   - React/MapLibre UMD from unpkg.com; supabase-js UMD from
          //     cdn.jsdelivr.net (pinned tags + SRI where the CDN supports it)
          //   - Google Fonts (Playfair Display, Plus Jakarta Sans): stylesheet + font files
          //   - Supabase (REST, auth, realtime wss)
          //   - MapTiler tiles for the Timeline Map (api.maptiler.com)
          //   - MapLibre GL needs 'wasm-unsafe-eval' + blob workers
          // 'unsafe-inline' is kept for STYLES only (the app uses inline
          // style attributes by design law), never for scripts.
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'wasm-unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
            "img-src 'self' data: blob: https://*.supabase.co https://api.maptiler.com https://lh3.googleusercontent.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "worker-src 'self' blob:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.maptiler.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;
