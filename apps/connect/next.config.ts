import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// CDN domains required by the static HTML frontend (loaded via <script> / <link> tags).
// These are only needed when the frontend is served from the same Next.js project
// (i.e. after scripts/build-frontend.js copies it into public/).
const FRONTEND_SCRIPT_CDN = "https://unpkg.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net";
const FRONTEND_STYLE_CDN  = "https://unpkg.com https://fonts.googleapis.com";
const FRONTEND_IMG_CDN    = "https://images.unsplash.com";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
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
  // Redirect the bare root to the static HTML frontend (copied into public/ at build time).
  async redirects() {
    return [
      { source: "/", destination: "/index.html", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
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
      // CORS for the standalone HTML frontend (Capacitor app + hosted web build).
      // Credentialed requests (Supabase auth cookie) forbid a wildcard origin, so we
      // echo a single configured origin. Set ALLOWED_FRONTEND_ORIGIN in Vercel to the
      // production HTML-frontend domain (open question F3) before that frontend ships;
      // the localhost fallback covers local dev. Preflight (OPTIONS) handling for the
      // auth-bearing routes is verified in Phase 1 alongside the auth wiring.
      {
        source: "/api/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: process.env.ALLOWED_FRONTEND_ORIGIN || "http://localhost:3001",
          },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
