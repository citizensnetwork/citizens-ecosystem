#!/usr/bin/env node
/**
 * Vercel Ignored Build Step for one Citizens app.
 *
 * Exit 0 cancels the deployment before the build. Exit 1 builds.
 * Vercel runs this from the app's Root Directory, before install, so the
 * script uses node and git only.
 *
 * It skips when every changed file is documentation, or when nothing in the
 * diff touches this app or a shared package it depends on. If it cannot tell
 * (no previous deployment SHA, a shallow checkout, a git error, an unknown
 * path, or a workspace graph it could not read), it builds. A thrown error
 * also exits 1. Production code is never skipped by mistake.
 *
 *   node scripts/vercel-ignore.mjs connect|vision|wear
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPS = ['connect', 'vision', 'wear'];

const APP_DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
// A library's devDependencies are its lint and test tools. The app build does
// not run them. frontend-build is a devDependency of each app, so those still
// count: the field list above is what an app package.json walks.
const PACKAGE_DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

const SHA = /^[0-9a-f]{7,40}$/i;
const SINGLE_STATUS = new Set(['A', 'D', 'M', 'T', 'U', 'X', 'B']);

const build = (reason) => ({ action: 'build', reason });
const skip = (reason) => ({ action: 'skip', reason });

export function isSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

export function ignoreCommandFor(app) {
  return `node "$(git rev-parse --show-toplevel)/scripts/vercel-ignore.mjs" ${app} || exit 1`;
}

/** True for the documentation paths that must not deploy any app. */
export function isDocsPath(file) {
  if (file.endsWith('.md')) return true;
  if (file.startsWith('docs/')) return true;
  if (/^apps\/[^/]+\/docs\//.test(file)) return true;
  if (file.startsWith('.github/ISSUE_TEMPLATE/')) return true;
  return false;
}

function isSafeRelativePath(file) {
  if (typeof file !== 'string' || file.length === 0) return false;
  if (file.includes('\\') || file.startsWith('/')) return false;
  return file.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function shownPath(file) {
  if (!isSafeRelativePath(file) || file.length > 180) return 'unreadable path';
  if (/[\u0000-\u001f\u007f]/.test(file)) return 'unreadable path';
  return file;
}

/**
 * @param {string} file repo-root path
 * @param {{ ok?: boolean, packageApps?: Record<string, string[]> } | null | undefined} graph
 */
export function classifyPath(file, graph) {
  if (!isSafeRelativePath(file)) return { type: 'invalid' };
  if (isDocsPath(file)) return { type: 'docs' };

  const appMatch = /^apps\/([^/]+)\/.+/.exec(file);
  if (appMatch) {
    if (!APPS.includes(appMatch[1])) return { type: 'unknown' };
    return { type: 'app', app: appMatch[1] };
  }

  if (graph?.ok === true && graph.packageApps) {
    const dirs = Object.keys(graph.packageApps).sort((a, b) => b.length - a.length);
    for (const dir of dirs) {
      if (file === dir || file.startsWith(`${dir}/`)) return { type: 'package', dir };
    }
  }

  return { type: 'unknown' };
}

/**
 * @param {string} app
 * @param {string[] | null | undefined} files
 * @param {{ ok?: boolean, packageApps?: Record<string, string[]>, affectedByApp?: Record<string, string[]> } | null | undefined} graph
 * @returns {{ action: 'skip' | 'build', reason: string }}
 */
export function decisionForApp(app, files, graph) {
  if (!APPS.includes(app)) return build('unknown app');
  if (!Array.isArray(files)) return build('changed files are unknown');
  if (files.length === 0) return skip('no changes since the previous deployment');

  let sawNonDocs = false;
  for (const file of files) {
    const kind = classifyPath(file, graph);
    if (kind.type === 'invalid' || kind.type === 'unknown') {
      return build(`unknown path ${shownPath(file)}`);
    }
    if (kind.type === 'docs') continue;

    sawNonDocs = true;
    if (graph?.ok !== true) return build('workspace graph is incomplete');

    if (kind.type === 'app') {
      const affected = graph.affectedByApp?.[kind.app];
      if (!Array.isArray(affected)) return build('workspace graph is incomplete');
      if (affected.includes(app)) return build(`affects ${app}: ${shownPath(file)}`);
      continue;
    }

    if (kind.type === 'package') {
      const affected = graph.packageApps?.[kind.dir];
      if (!Array.isArray(affected)) return build(`unknown path ${shownPath(file)}`);
      if (affected.includes(app)) return build(`affects ${app}: ${shownPath(file)}`);
      continue;
    }

    return build(`unknown path ${shownPath(file)}`);
  }

  if (!sawNonDocs) return skip('docs only');
  return skip(`changes do not affect ${app}`);
}

/**
 * Fail-safe wrapper around the file-list decision. Any gap in the git facts
 * builds, including a docs diff we never actually managed to read.
 */
export function evaluateDeployment({
  app,
  previousSha,
  headSha,
  previousPresent,
  headPresent,
  diffOk,
  diffReason,
  files,
  graph,
}) {
  if (!isSha(previousSha)) return build('no previous deployment SHA');
  if (!isSha(headSha)) return build('current commit SHA is missing');
  if (previousPresent !== true || headPresent !== true) {
    return build('commit is not in this checkout');
  }
  if (diffOk !== true) return build(diffReason || 'git diff failed');
  return decisionForApp(app, files, graph);
}

export function parseNameStatus(output) {
  let text;
  try {
    const buffer = typeof output === 'string' ? Buffer.from(output) : output;
    if (!Buffer.isBuffer(buffer)) return { ok: false, reason: 'diff output was not readable' };
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return { ok: false, reason: 'diff output was not readable' };
  }

  if (text.length === 0) return { ok: true, files: [] };
  const parts = text.split('\0');
  if (parts.at(-1) === '') parts.pop();

  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    const status = parts[i];
    if (SINGLE_STATUS.has(status)) {
      const path = parts[i + 1];
      if (!path) return { ok: false, reason: 'diff output was incomplete' };
      files.push(path);
      i += 1;
      continue;
    }
    if (/^[RC]\d{0,3}$/.test(status)) {
      const oldPath = parts[i + 1];
      const newPath = parts[i + 2];
      if (!oldPath || !newPath) return { ok: false, reason: 'diff output was incomplete' };
      files.push(oldPath, newPath);
      i += 2;
      continue;
    }
    return { ok: false, reason: 'diff output had an unexpected status' };
  }

  return { ok: true, files: [...new Set(files)] };
}

function workspaceNames(pkg, fields) {
  if (pkg == null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return { ok: false };
  }
  const names = [];
  for (const field of fields) {
    const block = pkg[field];
    if (block == null) continue;
    if (typeof block !== 'object' || Array.isArray(block)) return { ok: false };
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec !== 'string') return { ok: false };
      if (spec.startsWith('workspace:')) names.push(name);
    }
  }
  return { ok: true, names };
}

function linkedDirs(rootPackage) {
  const overrides = rootPackage?.pnpm?.overrides;
  if (overrides == null) return { ok: true, dirs: [] };
  const specs = [];
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith('link:')) specs.push(value);
      return true;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.values(value).every((child) => walk(child));
    }
    return false;
  };
  if (!walk(overrides)) return { ok: false, reason: 'could not read root package overrides' };

  const dirs = [];
  for (const spec of specs) {
    let rel = spec.slice('link:'.length);
    if (rel.startsWith('./')) rel = rel.slice(2);
    if (!isSafeRelativePath(rel)) {
      return { ok: false, reason: 'could not read root package overrides' };
    }
    dirs.push(rel);
  }
  return { ok: true, dirs };
}

function closureFrom(startDir, byDir, nameToDir, fieldsFor) {
  const seen = new Set();
  const queue = [startDir];
  while (queue.length > 0) {
    const dir = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = byDir.get(dir);
    if (!pkg) return { ok: false, reason: 'workspace graph is incomplete' };
    const deps = workspaceNames(pkg, fieldsFor(dir));
    if (!deps.ok) return { ok: false, reason: 'workspace graph is incomplete' };
    for (const name of deps.names) {
      const next = nameToDir.get(name);
      if (!next) return { ok: false, reason: `workspace dependency ${name} has no directory` };
      queue.push(next);
    }
  }
  return { ok: true, dirs: seen };
}

/**
 * @param {{
 *   rootPackage: object,
 *   packages: { dir: string, pkg: object }[],
 *   appPackages: { app: string, pkg: object }[],
 * }} input
 */
export function buildPackageApps({ rootPackage, packages, appPackages }) {
  const byDir = new Map();
  const nameToDir = new Map();
  const remember = (dir, pkg) => {
    if (pkg == null || typeof pkg !== 'object' || typeof pkg.name !== 'string' || pkg.name === '') {
      return false;
    }
    if (nameToDir.has(pkg.name) || byDir.has(dir)) return false;
    nameToDir.set(pkg.name, dir);
    byDir.set(dir, pkg);
    return true;
  };

  for (const app of APPS) {
    const entry = appPackages.find((item) => item.app === app);
    if (!entry || !remember(`apps/${app}`, entry.pkg)) {
      return { ok: false, reason: 'workspace graph is incomplete' };
    }
  }
  for (const entry of packages) {
    if (!remember(entry.dir, entry.pkg)) {
      return { ok: false, reason: 'workspace graph is incomplete' };
    }
  }

  const fieldsFor = (dir) => (dir.startsWith('apps/') ? APP_DEP_FIELDS : PACKAGE_DEP_FIELDS);
  const closure = {};
  for (const app of APPS) {
    const walked = closureFrom(`apps/${app}`, byDir, nameToDir, fieldsFor);
    if (!walked.ok) return walked;
    closure[app] = walked.dirs;
  }

  const links = linkedDirs(rootPackage);
  if (!links.ok) return { ok: false, reason: links.reason };
  for (const dir of links.dirs) {
    if (!byDir.has(dir)) return { ok: false, reason: 'workspace graph is incomplete' };
    const walked = closureFrom(dir, byDir, nameToDir, fieldsFor);
    if (!walked.ok) return walked;
    for (const app of APPS) {
      for (const reached of walked.dirs) closure[app].add(reached);
    }
  }

  const packageApps = {};
  for (const entry of packages) {
    packageApps[entry.dir] = APPS.filter((app) => closure[app].has(entry.dir));
  }
  const affectedByApp = {};
  for (const app of APPS) {
    affectedByApp[app] = APPS.filter((dependent) => closure[dependent].has(`apps/${app}`));
  }

  return { ok: true, packageApps, affectedByApp };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadGraph(repoRoot) {
  try {
    const rootPackage = readJson(join(repoRoot, 'package.json'));
    const packages = readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        dir: `packages/${entry.name}`,
        pkg: readJson(join(repoRoot, 'packages', entry.name, 'package.json')),
      }));
    const appPackages = APPS.map((app) => ({
      app,
      pkg: readJson(join(repoRoot, 'apps', app, 'package.json')),
    }));
    return buildPackageApps({ rootPackage, packages, appPackages });
  } catch {
    return { ok: false, reason: 'workspace graph is incomplete' };
  }
}

function gitOk(execGit, args) {
  try {
    execGit(args);
    return true;
  } catch {
    return false;
  }
}

export function run({ app, env = {}, graph, execGit }) {
  const previousSha = typeof env.VERCEL_GIT_PREVIOUS_SHA === 'string' ? env.VERCEL_GIT_PREVIOUS_SHA : '';
  const headSha = typeof env.VERCEL_GIT_COMMIT_SHA === 'string' ? env.VERCEL_GIT_COMMIT_SHA : '';

  let previousPresent = false;
  let headPresent = false;
  let diffOk = false;
  let diffReason = 'git diff failed';
  let files = null;

  if (isSha(previousSha) && isSha(headSha) && typeof execGit === 'function') {
    previousPresent = gitOk(execGit, ['cat-file', '-e', `${previousSha}^{commit}`]);
    headPresent = gitOk(execGit, ['cat-file', '-e', `${headSha}^{commit}`]);
    if (previousPresent && headPresent) {
      try {
        const parsed = parseNameStatus(
          execGit(['diff', '--name-status', '-z', previousSha, headSha]),
        );
        diffOk = parsed.ok === true;
        if (!diffOk && parsed.reason) diffReason = parsed.reason;
        files = parsed.ok ? parsed.files : null;
      } catch {
        diffOk = false;
        diffReason = 'git diff failed';
      }
    }
  }

  return evaluateDeployment({
    app,
    previousSha,
    headSha,
    previousPresent,
    headPresent,
    diffOk,
    diffReason,
    files,
    graph,
  });
}

function resolveRepoRoot(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    timeout: 15_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function main(argv = process.argv, env = process.env, cwd = process.cwd()) {
  let repoRoot;
  try {
    repoRoot = resolveRepoRoot(cwd);
  } catch {
    console.log('build: git repository is unavailable');
    return 1;
  }

  const graph = loadGraph(repoRoot);
  const execGit = (args) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const result = run({ app: argv[2], env, graph, execGit });
  console.log(`${result.action}: ${result.reason}`);
  return result.action === 'skip' ? 0 : 1;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    // A direct run that we cannot identify must not exit 0: that would skip
    // the deployment. The unit-test filename does not end with this name.
    return entry.endsWith('vercel-ignore.mjs');
  }
}

if (invokedDirectly()) {
  let code = 1;
  try {
    code = main();
  } catch {
    console.log('build: ignore check failed');
    code = 1;
  }
  process.exit(code === 0 ? 0 : 1);
}
