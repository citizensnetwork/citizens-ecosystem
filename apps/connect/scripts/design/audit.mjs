// The Designer's measuring entry point (docs/routines/designer.md step 4; docs/design/DESIGN.md).
//
//   node scripts/design/audit.mjs [--surface <id>] [--no-capture] [--out <dir>] [--viewports 375,768,1280] [--looks light,dark]
//
// 1. prints the frozen drift index per app (drift.mjs; baseline in docs/design/DRIFT_INDEX.md);
// 2. with --surface, prints the distinct raw colours, sizes, radii, shadows and z-indexes of that surface's files
//    that sit outside the token blocks (the numbers a design card quotes as "measured");
// 3. captures the surface (or, with no --surface, every Connect screen) at 375, 768 and 1280 px in both looks into
//    <out> (default <repo>/.claude/design/captures/<date>, gitignored), unless --no-capture.
//
// Surface ids are designer.md appendix A. `wear` and `vision` are separate frontends: they are measured statically
// here and not captured. Read-only except for the capture folder; no dependency.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, SETS, analyseFiles, analyseRepo, formatReport, formatValues, listTracked } from './drift.mjs';
import { SURFACES, captureAll, parseArgs } from './capture.mjs';

const FRONT = 'apps/connect/src/frontend/';
/** Connect surface id -> the tracked files that draw it (paths under src/frontend). `map` is matched by prefix. */
export const SURFACE_FILES = {
  discovery: ['app/kingdom-discovery.jsx', 'app/entity-card.jsx', 'app/pages.jsx'],
  profile: ['app/profiles.jsx', 'app/entity-card.jsx'],
  'landing-auth': ['app/auth.jsx'],
  apply: ['app/apply.jsx', 'app/pending-application.jsx'],
  dashboard: ['app/dashboard.jsx', 'app/automation.jsx', 'app/insights.jsx'],
  admin: ['app/admin.jsx'],
  'messages-notifications': ['app/messages.jsx', 'app/pages.jsx'],
};
const MAP_FILES = (f) => f === 'app/home.jsx' || f === 'app/map.jsx' || f.startsWith('app/map-v2') || f === 'assets/map-v2.css';
export const AUDIT_SURFACES = [...SURFACES, 'wear', 'vision'];

/** The tracked files of a surface, as {path, text}. */
export function surfaceFiles(surface, root = REPO_ROOT) {
  const read = (path) => ({ path, text: readFileSync(join(root, path), 'utf8') });
  if (surface === 'wear' || surface === 'vision') return listTracked(root, SETS[surface], /\.(jsx?|css|html)$/).map(read);
  const all = listTracked(root, [FRONT.slice(0, -1)], /\.(jsx?|css|html)$/);
  const wanted = surface === 'map' ? all.filter((p) => MAP_FILES(p.slice(FRONT.length))) : (SURFACE_FILES[surface] ?? []).map((f) => FRONT + f).filter((p) => all.includes(p));
  return wanted.map(read);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--surface');
  const surface = at >= 0 ? argv[at + 1] : undefined;
  if (surface && !AUDIT_SURFACES.includes(surface)) {
    console.error(`unknown surface "${surface}"; use one of: ${AUDIT_SURFACES.join(', ')}`);
    process.exit(2);
  }
  const commit = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(`Designer audit  commit ${commit}  ${new Date().toISOString()}\n`);
  console.log('Drift index (docs/design/DRIFT_INDEX.md, version 1)\n');
  console.log(formatReport(analyseRepo()));

  if (surface) {
    const files = surfaceFiles(surface);
    const a = analyseFiles(files);
    console.log(`\nSurface "${surface}": ${a.files} files, ${a.loc} lines, ${a.distinct} distinct raw values outside token blocks`);
    console.log(files.map((f) => '  ' + f.path).join('\n'));
    console.log(formatValues(surface, a));
  }

  if (argv.includes('--no-capture')) {
    console.log('\nCapture skipped (--no-capture).');
  } else if (surface === 'wear' || surface === 'vision') {
    console.log(`\nCapture skipped: ${surface} is a separate frontend (measured statically only).`);
  } else {
    const opts = parseArgs(argv);
    console.log(`\nCapturing ${opts.routes.length} screen(s) x ${opts.viewports.length} viewport(s) x ${opts.looks.length} look(s) into ${opts.outDir}`);
    const m = await captureAll(opts);
    console.log(`captured ${m.count} screenshots (${m.notReady} not ready); manifest.json holds the survey of what rendered`);
    if (m.hosts.length) console.log(`hosts the pages asked for: ${m.hosts.join(', ')}`);
    for (const s of m.shots.filter((x) => !x.ready)) console.log(`  not ready: ${s.file}: ${s.note}`);
  }
}
