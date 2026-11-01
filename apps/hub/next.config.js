const path = require('path');
const { hubHeaders, hubRedirects, proxyRewrites } = require('./config/hub-config');

/**
 * The front door of the shared Citizens domain. It serves its own few pages (/citizens, the coming-soon pages, a 404)
 * and proxies /citizens/<app> to each app's Vercel project. Everything it generates comes from @citizens/ecosystem
 * through config/hub-config.js, which the tests also load.
 *
 * The hub has NO basePath: it owns the domain root.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not let `next dev` write Next.js's agent-rules block into AGENTS.md (see apps/connect/RESUME_HERE.md, C38).
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root so Next does not pick up a stray lockfile elsewhere on the machine.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async redirects() {
    return hubRedirects();
  },
  async rewrites() {
    // beforeFiles: a proxied path must win over every page and public/ file the hub has.
    return { beforeFiles: proxyRewrites(process.env) };
  },
  async headers() {
    return hubHeaders(process.env.NODE_ENV === 'development');
  },
};

module.exports = nextConfig;
