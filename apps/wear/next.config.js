const path = require('path');

const SUPABASE_HOST = 'xyiajtrvhlxaeplsiajj.supabase.co';

/**
 * Content-Security-Policy for the static HTML frontend (built into `public/`).
 *
 * - `script-src` has NO `'unsafe-inline'`: the built page has no inline script
 *   and no inline event handler, and the bundle uses no eval. React/ReactDOM
 *   come from unpkg and supabase-js from jsDelivr, each pinned with SRI.
 *   `'unsafe-eval'` is added in development only (Next's React Refresh).
 * - `style-src` keeps `'unsafe-inline'`: the app styles elements with inline
 *   style attributes by design, and the page has one inline <style>.
 * - `img-src` lists what the live database actually references (read 2026-10-15):
 *   our Supabase storage, Google profile pictures, and the demo content's
 *   ui-avatars.com and images.unsplash.com. A screen that renders a new image
 *   host must add it here, or the picture is blocked.
 * - `connect-src` is Supabase (REST, auth, storage over https; realtime over
 *   wss) plus same-origin `/api`.
 * - `object-src`, `frame-ancestors`, `base-uri` and `form-action` close the
 *   plugin, clickjacking, base-tag and form-hijack routes.
 */
function contentSecurityPolicy() {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' https://unpkg.com https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: https://${SUPABASE_HOST} https://*.googleusercontent.com https://ui-avatars.com https://images.unsplash.com`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@citizens/connect-client', '@citizens/db'],
  // Pin the workspace root so Next doesn't mistakenly pick up a stray
  // `package-lock.json` elsewhere on the dev machine (e.g. in `$HOME`).
  // Next.js will otherwise warn: "We detected multiple lockfiles...".
  outputFileTracingRoot: path.join(__dirname, '../../'),
  typedRoutes: true,
  // Serve the static HTML frontend (built into public/ by
  // scripts/build-frontend.js) at the bare root — Next does not serve
  // public/index.html at "/" by itself. Same pattern as Citizens Connect.
  async redirects() {
    return [{ source: '/', destination: '/index.html', permanent: false }];
  },
  // Defence-in-depth HTTP security headers. These apply to every response
  // served by the Next.js app (static + dynamic). The CSP below is the last
  // layer against injected script; `src/lib/csp.test.ts` pins it to the real
  // `index.html` so a CDN or host change cannot drift away from it unnoticed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
