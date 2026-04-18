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
          // Content-Security-Policy tuned for:
          //   - MapLibre GL JS (workers + wasm-unsafe-eval + blob worker-src)
          //   - CartoDB raster tiles (https://*.basemaps.cartocdn.com)
          //   - Nominatim geocoding (https://nominatim.openstreetmap.org)
          //   - Supabase (REST, auth, realtime wss)
          //   - Next.js inline styles (Tailwind JIT) + fonts
          // 'unsafe-inline' is kept for styles (Tailwind), NOT for scripts.
          // 'wasm-unsafe-eval' is required by MapLibre GL.
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.supabase.co",
            "font-src 'self' data:",
            "worker-src 'self' blob:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.basemaps.cartocdn.com https://nominatim.openstreetmap.org",
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
