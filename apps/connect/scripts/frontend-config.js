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

  // index.html loads supabase-js from jsDelivr, where OSV-Scanner can't see
  // it. The build fails unless the tag pins the exact lockfile version with an
  // SRI hash matching the installed package's bytes — the same job
  // assertMaplibreVendorInSync does for the vendored map runtime.
  // React/ReactDOM can't be listed: npm React is 19 (no UMD build) while the
  // page loads the 18.3.1 UMD from unpkg — their hashes are hand-verified
  // (see index.html). Same split Vision already uses.
  sriPackages: ['@supabase/supabase-js'],
};
