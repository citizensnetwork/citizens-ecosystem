import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  ],
  headers: async () => [
    {
      source: "/(.*)",
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
          //   - Google Fonts (Manrope): stylesheet + font files
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
