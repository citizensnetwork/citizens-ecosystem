#!/usr/bin/env node
/**
 * Refresh the vendored copy of @citizens/frontend-build from its canonical
 * source in the sibling citizens-wear checkout (see vendor/README.md).
 * Run after changing the canonical package; commit the result.
 */
'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

const CANONICAL = path.join(__dirname, '..', '..', 'citizens-wear', 'packages', 'frontend-build');
const VENDOR = path.join(__dirname, '..', 'vendor', 'citizens-frontend-build');
const VERBATIM_FILES = ['index.js', 'index.d.ts', 'README.md'];
// package.json fields kept in the vendored copy. devDependencies/scripts are
// dropped: npm resolves a file: dependency like a workspace link and would
// choke on the canonical workspace:* devDeps (EUNSUPPORTEDPROTOCOL), and the
// package's own test/lint tooling only runs in citizens-wear anyway.
const PKG_FIELDS = ['name', 'version', 'private', 'description', 'main', 'types', 'files', 'peerDependencies'];

if (!fs.existsSync(CANONICAL)) {
  console.error(`[sync-frontend-build] Canonical source not found at ${CANONICAL} — clone citizens-wear as a sibling of this repo first.`);
  process.exit(1);
}

fs.mkdirSync(VENDOR, { recursive: true });
for (const name of VERBATIM_FILES) {
  fs.copyFileSync(path.join(CANONICAL, name), path.join(VENDOR, name));
  console.log(`[sync-frontend-build] ${name} ← citizens-wear/packages/frontend-build`);
}

const canonicalPkg = JSON.parse(fs.readFileSync(path.join(CANONICAL, 'package.json'), 'utf8'));
const vendoredPkg = {};
for (const field of PKG_FIELDS) {
  if (field in canonicalPkg) vendoredPkg[field] = canonicalPkg[field];
}
fs.writeFileSync(path.join(VENDOR, 'package.json'), JSON.stringify(vendoredPkg, null, 2) + '\n');
console.log('[sync-frontend-build] package.json ← reduced to publish-relevant fields');
console.log('[sync-frontend-build] Done. Review + commit vendor/citizens-frontend-build.');
