/**
 * Connect's configuration for @citizens/frontend-build: the env-var mapping for the
 * generated config.js, and which CDN scripts must match the lockfile.
 *
 * Its own file (instead of an object literal inside build-frontend.js) so a test can run
 * the real configuration through the real pipeline into a temp directory, with no side
 * effects: src/__tests__/scripts/nativeConfig.test.ts.
 *
 * `appFileOrder` (the screen load order) deliberately stays in build-frontend.js: a dozen
 * wiring tests read that file's text to check where each screen is registered.
 */
'use strict';

module.exports = {
  envGlobalName: '__CC_ENV',
  configVars: [
    { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
    { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
    {
      // Web: '' = same origin (standard Vercel topology). Mobile: FORCED
      // absolute production URL — a store build must never point at a
      // localhost fallback (addendum §B6). The default is the team's own
      // production alias, which is live today and does not depend on any custom
      // domain; at the 219.co.za cutover build with
      // MOBILE_API_BASE_URL=https://219.co.za/citizens/connect
      // (docs/MOBILE_LAUNCH_RUNBOOK.md, "Native web address").
      key: 'API_BASE_URL',
      env: 'NEXT_PUBLIC_API_BASE_URL',
      mobileEnv: 'MOBILE_API_BASE_URL',
      mobileDefault: 'https://citizens-ecosystem-connect.vercel.app',
    },
    { key: 'MAPTILER_KEY', env: 'NEXT_PUBLIC_MAPTILER_KEY' },
    { key: 'MAPTILER_STYLE', env: 'NEXT_PUBLIC_MAPTILER_STYLE', defaultValue: 'streets-v2' },
    {
      // The PUBLIC WEB address the native shell puts in the links it shares and
      // in a contributor's QR code. The shell's own origin (capacitor://localhost,
      // https://localhost) is not an address anyone can open, and a store build is
      // bundled at the shell's root, so it cannot read the web address from where
      // it runs. MOBILE-ONLY: a web build's config.js does not carry these two keys.
      // The default is today's public site; at the cutover build with
      // MOBILE_PUBLIC_ORIGIN=https://219.co.za and
      // MOBILE_PUBLIC_BASE_PATH=/citizens/connect. Both are validated strictly
      // (packages/frontend-build): they land in config.js and in shared links.
      key: 'PUBLIC_ORIGIN',
      env: 'MOBILE_PUBLIC_ORIGIN',
      mobileEnv: 'MOBILE_PUBLIC_ORIGIN',
      mobileDefault: 'https://www.citizenscentral.co.za',
      mobileOnly: true,
      validate: 'https-origin',
    },
    {
      key: 'PUBLIC_BASE_PATH',
      env: 'MOBILE_PUBLIC_BASE_PATH',
      mobileEnv: 'MOBILE_PUBLIC_BASE_PATH',
      mobileDefault: '',
      mobileOnly: true,
      validate: 'base-path',
    },
  ],
  mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'MAPTILER_KEY'],
  mobileMissingLabel: 'Supabase/MapTiler',

  // No CDN scripts to pin (QA plan PR F2, 2026-11-25): React, ReactDOM, supabase-js and lucide are served from our
  // own origin, copied from the lockfile-installed packages by ./frontend-vendor.js, so OSV-Scanner sees exactly what
  // the browser runs. The SRI check (sriPackages) stays available in @citizens/frontend-build for a CDN tag that comes
  // back; the build already fails on any development build that would ship.
};
