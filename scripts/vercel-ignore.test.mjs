import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  APPS,
  buildPackageApps,
  decisionForApp,
  evaluateDeployment,
  ignoreCommandFor,
  loadGraph,
  parseNameStatus,
  run,
} from './vercel-ignore.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(repoRoot, 'scripts', 'vercel-ignore.mjs');

const graph = {
  ok: true,
  packageApps: {
    'packages/frontend-build': ['connect', 'vision', 'wear'],
    'packages/utils': ['wear'],
    'packages/db': ['wear'],
    'packages/connect-client': ['wear'],
    'packages/config': ['wear'],
    'packages/ui': [],
    'packages/braces-patched': ['connect', 'vision', 'wear'],
  },
  affectedByApp: {
    connect: ['connect'],
    vision: ['vision'],
    wear: ['wear'],
  },
};

const none = { connect: 'skip', vision: 'skip', wear: 'skip' };
const all = { connect: 'build', vision: 'build', wear: 'build' };

function expectActions(files, expected, workspace = graph) {
  for (const app of APPS) {
    const result = decisionForApp(app, files, workspace);
    assert.equal(result.action, expected[app], `${app}: ${result.reason}`);
  }
}

describe('docs and per-app decisions', () => {
  it('skips every app for a docs-only commit', () => {
    expectActions(
      [
        'README.md',
        'apps/connect/README.md',
        'apps/connect/src/notes.md',
        'docs/screenshot.png',
        'apps/vision/docs/guide.png',
        'apps/wear/docs/nested/note.txt',
        '.github/ISSUE_TEMPLATE/bug.yml',
      ],
      none,
    );
    assert.equal(decisionForApp('connect', ['README.md'], graph).reason, 'docs only');
  });

  it('builds only the app whose code changed', () => {
    expectActions(['apps/connect/src/a.ts'], { connect: 'build', vision: 'skip', wear: 'skip' });
    expectActions(['apps/vision/src/a.ts'], { connect: 'skip', vision: 'build', wear: 'skip' });
    expectActions(['apps/wear/package.json'], { connect: 'skip', vision: 'skip', wear: 'build' });
    expectActions(['apps/connect/src/a.ts', 'apps/vision/src/b.ts'], {
      connect: 'build',
      vision: 'build',
      wear: 'skip',
    });
  });

  it('ignores docs mixed into another app and still skips the untouched app', () => {
    expectActions(['README.md', 'apps/vision/src/a.ts', 'apps/vision/docs/pic.png'], {
      connect: 'skip',
      vision: 'build',
      wear: 'skip',
    });
  });

  it('builds every dependent of a shared package and skips the rest', () => {
    expectActions(['packages/utils/src/index.ts'], {
      connect: 'skip',
      vision: 'skip',
      wear: 'build',
    });
    expectActions(['packages/frontend-build/index.js'], all);
    expectActions(['packages/ui/src/index.ts'], none);
    expectActions(['packages/braces-patched/index.js'], all);
    expectActions(['packages/config/eslint-preset.cjs'], {
      connect: 'skip',
      vision: 'skip',
      wear: 'build',
    });
  });

  it('builds when a code path is renamed into docs', () => {
    expectActions(['apps/connect/src/a.ts', 'docs/a.md'], {
      connect: 'build',
      vision: 'skip',
      wear: 'skip',
    });
  });

  it('does not treat a lookalike path as an app or a package', () => {
    expectActions(['apps/connection/src/a.ts'], all);
    expectActions(['apps/connect'], all);
    expectActions(['packages/utils-extra/index.js'], all);
    expectActions(['packages/stray.txt'], all);
    expectActions(['Apps/connect/src/a.ts'], all);
  });
});

describe('fail-safe decisions', () => {
  it('skips when a successful diff has no files', () => {
    expectActions([], none);
    assert.equal(
      decisionForApp('connect', [], graph).reason,
      'no changes since the previous deployment',
    );
  });

  it('builds when the file list or the app is missing', () => {
    assert.equal(decisionForApp('connect', null, graph).action, 'build');
    assert.equal(decisionForApp('connect', undefined, graph).action, 'build');
    assert.equal(decisionForApp('blog', ['README.md'], graph).action, 'build');
    assert.equal(decisionForApp('connect', ['README.md'], graph).action, 'skip');
  });

  it('builds for an unknown path, including root config, workflows and migrations', () => {
    for (const file of [
      'pnpm-lock.yaml',
      'package.json',
      'turbo.json',
      '.github/workflows/ci.yml',
      'supabase/migrations/190.sql',
      'scripts/vercel-ignore.mjs',
      '../apps/connect/src/a.ts',
      '/etc/passwd',
      'apps/connect/../../package.json',
      '',
    ]) {
      expectActions([file], all);
    }
  });

  it('builds every app when the graph is unreadable and a non-docs file changed', () => {
    const broken = { ok: false, reason: 'workspace graph is incomplete' };
    expectActions(['README.md', 'docs/a.png'], none, broken);
    expectActions(['apps/vision/src/a.ts'], all, broken);
    expectActions(['packages/utils/src/index.ts'], all, broken);
  });

  it('builds when a package is missing from a readable graph', () => {
    const partial = {
      ok: true,
      packageApps: { 'packages/utils': ['wear'] },
      affectedByApp: graph.affectedByApp,
    };
    expectActions(['packages/frontend-build/index.js'], all, partial);
  });

  it('refuses to skip when the previous deployment cannot be compared', () => {
    const ready = {
      app: 'connect',
      previousSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      previousPresent: true,
      headPresent: true,
      diffOk: true,
      files: ['README.md'],
      graph,
    };
    assert.equal(evaluateDeployment(ready).action, 'skip');

    assert.equal(evaluateDeployment({ ...ready, previousSha: '' }).reason, 'no previous deployment SHA');
    assert.equal(
      evaluateDeployment({ ...ready, previousSha: undefined }).reason,
      'no previous deployment SHA',
    );
    assert.equal(
      evaluateDeployment({ ...ready, previousSha: 'HEAD' }).reason,
      'no previous deployment SHA',
    );
    assert.equal(
      evaluateDeployment({ ...ready, previousSha: '--upload-pack=evil' }).reason,
      'no previous deployment SHA',
    );
    assert.equal(
      evaluateDeployment({ ...ready, headSha: '' }).reason,
      'current commit SHA is missing',
    );
    assert.equal(
      evaluateDeployment({ ...ready, previousPresent: false }).reason,
      'commit is not in this checkout',
    );
    assert.equal(
      evaluateDeployment({ ...ready, headPresent: false }).reason,
      'commit is not in this checkout',
    );
    assert.equal(
      evaluateDeployment({ ...ready, diffOk: false, diffReason: 'git diff failed' }).reason,
      'git diff failed',
    );
    assert.equal(
      evaluateDeployment({ ...ready, diffOk: false, files: ['README.md'] }).action,
      'build',
    );
  });
});

describe('git diff parsing', () => {
  it('reads added, modified and renamed paths, including both sides of a rename', () => {
    const diff = Buffer.from(
      ['A', 'docs/a.md', 'M', 'apps/vision/src/a.ts', 'R100', 'apps/connect/src/old.ts', 'docs/new.md', ''].join(
        '\0',
      ),
    );
    const parsed = parseNameStatus(diff);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.files, [
      'docs/a.md',
      'apps/vision/src/a.ts',
      'apps/connect/src/old.ts',
      'docs/new.md',
    ]);
    expectActions(parsed.files, { connect: 'build', vision: 'build', wear: 'skip' });
  });

  it('treats an empty diff as no files and a broken diff as unreadable', () => {
    assert.deepEqual(parseNameStatus(Buffer.from('')), { ok: true, files: [] });
    assert.equal(parseNameStatus(Buffer.from('M\0')).ok, false);
    assert.equal(parseNameStatus(Buffer.from('R100\0only-one')).ok, false);
    assert.equal(parseNameStatus(Buffer.from('Z\0file')).ok, false);
    assert.equal(parseNameStatus(Buffer.from([0xff, 0xfe, 0x00])).ok, false);
    assert.equal(parseNameStatus(null).ok, false);
  });
});

describe('workspace graph', () => {
  const packages = [
    {
      dir: 'packages/frontend-build',
      pkg: {
        name: '@citizens/frontend-build',
        devDependencies: { '@citizens/config': 'workspace:*' },
        peerDependencies: { esbuild: '>=0.20.0' },
      },
    },
    { dir: 'packages/config', pkg: { name: '@citizens/config' } },
    {
      dir: 'packages/utils',
      pkg: {
        name: '@citizens/utils',
        devDependencies: { '@citizens/config': 'workspace:*' },
      },
    },
    {
      dir: 'packages/ui',
      pkg: { name: '@citizens/ui', devDependencies: { '@citizens/config': 'workspace:*' } },
    },
    {
      dir: 'packages/db',
      pkg: {
        name: '@citizens/db',
        dependencies: { '@citizens/connect-client': 'workspace:*' },
        devDependencies: { '@citizens/config': 'workspace:*' },
      },
    },
    {
      dir: 'packages/connect-client',
      pkg: {
        name: '@citizens/connect-client',
        devDependencies: { '@citizens/config': 'workspace:*' },
      },
    },
    {
      dir: 'packages/braces-patched',
      pkg: { name: 'braces-patched', dependencies: { 'fill-range': '^7.1.1' } },
    },
  ];
  const appPackages = [
    {
      app: 'connect',
      pkg: {
        name: 'citizens-connect',
        devDependencies: { '@citizens/frontend-build': 'workspace:*' },
      },
    },
    {
      app: 'vision',
      pkg: {
        name: 'citizens-vision',
        dependencies: { '@citizens/frontend-build': 'workspace:*' },
      },
    },
    {
      app: 'wear',
      pkg: {
        name: '@citizens/wear',
        dependencies: {
          '@citizens/connect-client': 'workspace:*',
          '@citizens/db': 'workspace:*',
          '@citizens/utils': 'workspace:*',
        },
        devDependencies: {
          '@citizens/config': 'workspace:*',
          '@citizens/frontend-build': 'workspace:*',
        },
      },
    },
  ];
  const rootPackage = { pnpm: { overrides: { braces: 'link:./packages/braces-patched' } } };

  it('follows app devDependencies and package runtime dependencies, not a library devDependency', () => {
    const built = buildPackageApps({ rootPackage, packages, appPackages });
    assert.equal(built.ok, true);
    assert.deepEqual(built.packageApps['packages/frontend-build'], ['connect', 'vision', 'wear']);
    assert.deepEqual(built.packageApps['packages/utils'], ['wear']);
    assert.deepEqual(built.packageApps['packages/db'], ['wear']);
    assert.deepEqual(built.packageApps['packages/connect-client'], ['wear']);
    assert.deepEqual(built.packageApps['packages/config'], ['wear']);
    assert.deepEqual(built.packageApps['packages/ui'], []);
    assert.deepEqual(built.packageApps['packages/braces-patched'], ['connect', 'vision', 'wear']);
    assert.deepEqual(built.affectedByApp, {
      connect: ['connect'],
      vision: ['vision'],
      wear: ['wear'],
    });
  });

  it('builds a dependent app when one app depends on another', () => {
    const built = buildPackageApps({
      rootPackage: {},
      packages: [{ dir: 'packages/ui', pkg: { name: '@citizens/ui' } }],
      appPackages: [
        { app: 'connect', pkg: { name: 'citizens-connect' } },
        {
          app: 'vision',
          pkg: { name: 'citizens-vision', dependencies: { 'citizens-connect': 'workspace:*' } },
        },
        { app: 'wear', pkg: { name: '@citizens/wear' } },
      ],
    });
    assert.equal(built.ok, true);
    assert.deepEqual(built.affectedByApp.connect, ['connect', 'vision']);
    expectActions(['apps/connect/src/a.ts'], { connect: 'build', vision: 'build', wear: 'skip' }, built);
  });

  it('fails closed when the graph is ambiguous', () => {
    assert.equal(
      buildPackageApps({
        rootPackage: { pnpm: { overrides: { braces: 'link:../packages/braces-patched' } } },
        packages,
        appPackages,
      }).ok,
      false,
    );
    assert.equal(
      buildPackageApps({
        rootPackage: { pnpm: { overrides: { foo: 1 } } },
        packages,
        appPackages,
      }).ok,
      false,
    );
    assert.equal(
      buildPackageApps({
        rootPackage,
        packages,
        appPackages: appPackages.map((entry) =>
          entry.app === 'connect'
            ? {
                ...entry,
                pkg: {
                  ...entry.pkg,
                  dependencies: { '@citizens/missing': 'workspace:*' },
                },
              }
            : entry,
        ),
      }).ok,
      false,
    );
    const duplicate = packages.map((entry) =>
      entry.dir === 'packages/ui' ? { ...entry, pkg: { name: '@citizens/utils' } } : entry,
    );
    assert.equal(buildPackageApps({ rootPackage, packages: duplicate, appPackages }).ok, false);
  });

  it('matches the packages this repo actually depends on', () => {
    const live = loadGraph(repoRoot);
    assert.equal(live.ok, true);
    assert.deepEqual(live.packageApps['packages/frontend-build'], ['connect', 'vision', 'wear']);
    assert.deepEqual(live.packageApps['packages/utils'], ['connect', 'vision', 'wear']);
    assert.deepEqual(live.packageApps['packages/db'], ['wear']);
    assert.deepEqual(live.packageApps['packages/connect-client'], ['wear']);
    assert.deepEqual(live.packageApps['packages/config'], ['wear']);
    assert.deepEqual(live.packageApps['packages/ui'], []);
    assert.deepEqual(live.packageApps['packages/braces-patched'], ['connect', 'vision', 'wear']);
    assert.deepEqual(live.affectedByApp, graph.affectedByApp);

    expectActions(['packages/utils/src/index.ts'], all, live);
    expectActions(['packages/frontend-build/index.js'], all, live);
    expectActions(['packages/braces-patched/lib/parse.js'], all, live);
  });
});

describe('git orchestration', () => {
  const previous = 'a'.repeat(40);
  const head = 'b'.repeat(40);

  it('does not run git when the previous SHA is missing or not a SHA', () => {
    let calls = 0;
    const execGit = () => {
      calls += 1;
      throw new Error('git should not run');
    };
    const missing = run({
      app: 'wear',
      env: {},
      graph,
      execGit,
    });
    assert.equal(missing.action, 'build');
    assert.equal(missing.reason, 'no previous deployment SHA');
    assert.equal(calls, 0);

    const injected = run({
      app: 'connect',
      env: { VERCEL_GIT_PREVIOUS_SHA: '--version', VERCEL_GIT_COMMIT_SHA: head },
      graph,
      execGit,
    });
    assert.equal(injected.action, 'build');
    assert.equal(calls, 0);
  });

  it('builds when the previous commit is not in the checkout', () => {
    const result = run({
      app: 'connect',
      env: { VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: head },
      graph,
      execGit: (args) => {
        if (args[0] === 'cat-file') throw new Error('missing');
        throw new Error('diff should not run');
      },
    });
    assert.equal(result.reason, 'commit is not in this checkout');
  });

  it('builds when git diff fails and skips when the diff is docs', () => {
    const env = { VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: head };
    const present = (args) => {
      if (args[0] === 'cat-file') return Buffer.from('');
      throw new Error('diff failed');
    };
    assert.equal(run({ app: 'connect', env, graph, execGit: present }).reason, 'git diff failed');

    const docs = (args) => {
      if (args[0] === 'cat-file') return Buffer.from('');
      assert.deepEqual(args.slice(0, 3), ['diff', '--name-status', '-z']);
      assert.equal(args[3], previous);
      assert.equal(args[4], head);
      return Buffer.from(['M', 'docs/readme.txt', ''].join('\0'));
    };
    const skipped = run({ app: 'vision', env, graph, execGit: docs });
    assert.equal(skipped.action, 'skip');
    assert.equal(skipped.reason, 'docs only');
  });
});

describe('vercel.json', () => {
  it('points each app at the script and leaves Connect in Frankfurt', () => {
    for (const app of APPS) {
      const file = JSON.parse(readFileSync(join(repoRoot, 'apps', app, 'vercel.json'), 'utf8'));
      assert.equal(file.ignoreCommand, ignoreCommandFor(app));
    }
    const connect = JSON.parse(readFileSync(join(repoRoot, 'apps/connect/vercel.json'), 'utf8'));
    assert.deepEqual(connect.regions, ['fra1']);
    const vision = JSON.parse(readFileSync(join(repoRoot, 'apps/vision/vercel.json'), 'utf8'));
    const wear = JSON.parse(readFileSync(join(repoRoot, 'apps/wear/vercel.json'), 'utf8'));
    assert.equal(vision.regions, undefined);
    assert.equal(wear.regions, undefined);
  });
});

describe('command against a real git checkout', () => {
  it('exits 0 for docs and an unaffected app, and 1 when it cannot compare', () => {
    const repo = mkdtempSync(join(tmpdir(), 'vercel-ignore-'));
    const gitEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    };
    const git = (args) => {
      const result = spawnSync(
        'git',
        ['-c', 'commit.gpgsign=false', '-c', 'user.name=test', '-c', 'user.email=test@localhost', ...args],
        { cwd: repo, encoding: 'utf8', env: gitEnv },
      );
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const ignore = (app, env) =>
      spawnSync(process.execPath, [scriptPath, app], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...gitEnv, ...env },
      });

    try {
      git(['init']);
      mkdirSync(join(repo, 'apps', 'connect', 'src'), { recursive: true });
      mkdirSync(join(repo, 'apps', 'vision'), { recursive: true });
      mkdirSync(join(repo, 'apps', 'wear'), { recursive: true });
      mkdirSync(join(repo, 'packages', 'utils'), { recursive: true });
      mkdirSync(join(repo, 'docs'), { recursive: true });
      writeFileSync(join(repo, 'package.json'), '{}\n');
      writeFileSync(join(repo, 'apps/connect/package.json'), '{"name":"citizens-connect"}\n');
      writeFileSync(join(repo, 'apps/vision/package.json'), '{"name":"citizens-vision"}\n');
      writeFileSync(
        join(repo, 'apps/wear/package.json'),
        '{"name":"@citizens/wear","dependencies":{"@citizens/utils":"workspace:*"}}\n',
      );
      writeFileSync(join(repo, 'packages/utils/package.json'), '{"name":"@citizens/utils"}\n');
      writeFileSync(join(repo, 'packages/utils/index.js'), 'export const n = 1;\n');
      writeFileSync(join(repo, 'apps/connect/src/a.js'), 'export const a = 1;\n');
      writeFileSync(join(repo, 'README.md'), '# one\n');
      git(['add', '.']);
      git(['commit', '-m', 'init']);
      const first = git(['rev-parse', 'HEAD']);

      writeFileSync(join(repo, 'README.md'), '# two\n');
      writeFileSync(join(repo, 'docs/picture.txt'), 'caption\n');
      git(['add', '.']);
      git(['commit', '-m', 'docs']);
      const docs = git(['rev-parse', 'HEAD']);
      const docsRun = ignore('connect', {
        VERCEL_GIT_PREVIOUS_SHA: first,
        VERCEL_GIT_COMMIT_SHA: docs,
      });
      assert.equal(docsRun.status, 0, docsRun.stdout + docsRun.stderr);
      assert.match(docsRun.stdout, /^skip: docs only/);
      assert.equal(
        ignore('wear', { VERCEL_GIT_PREVIOUS_SHA: first, VERCEL_GIT_COMMIT_SHA: docs }).status,
        0,
      );

      writeFileSync(join(repo, 'apps/connect/src/a.js'), 'export const a = 2;\n');
      git(['add', '.']);
      git(['commit', '-m', 'connect']);
      const code = git(['rev-parse', 'HEAD']);
      const connectRun = ignore('connect', {
        VERCEL_GIT_PREVIOUS_SHA: docs,
        VERCEL_GIT_COMMIT_SHA: code,
      });
      assert.equal(connectRun.status, 1, connectRun.stdout);
      assert.match(connectRun.stdout, /^build: affects connect:/);
      assert.equal(
        ignore('vision', { VERCEL_GIT_PREVIOUS_SHA: docs, VERCEL_GIT_COMMIT_SHA: code }).status,
        0,
      );
      assert.equal(
        ignore('wear', { VERCEL_GIT_PREVIOUS_SHA: docs, VERCEL_GIT_COMMIT_SHA: code }).status,
        0,
      );

      writeFileSync(join(repo, 'packages/utils/index.js'), 'export const n = 2;\n');
      git(['add', '.']);
      git(['commit', '-m', 'utils']);
      const shared = git(['rev-parse', 'HEAD']);
      assert.equal(
        ignore('wear', { VERCEL_GIT_PREVIOUS_SHA: code, VERCEL_GIT_COMMIT_SHA: shared }).status,
        1,
      );
      assert.equal(
        ignore('connect', { VERCEL_GIT_PREVIOUS_SHA: code, VERCEL_GIT_COMMIT_SHA: shared }).status,
        0,
      );

      const noPrevious = ignore('connect', { VERCEL_GIT_COMMIT_SHA: shared });
      assert.equal(noPrevious.status, 1);
      assert.match(noPrevious.stdout, /no previous deployment SHA/);

      const shallow = ignore('connect', {
        VERCEL_GIT_PREVIOUS_SHA: '1'.repeat(40),
        VERCEL_GIT_COMMIT_SHA: shared,
      });
      assert.equal(shallow.status, 1);
      assert.match(shallow.stdout, /not in this checkout/);

      assert.equal(
        ignore('nope', { VERCEL_GIT_PREVIOUS_SHA: code, VERCEL_GIT_COMMIT_SHA: shared }).status,
        1,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
