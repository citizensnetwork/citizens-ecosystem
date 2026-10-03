# braces-patched: Citizens' patched copy of braces@3.0.3

**A private, unpublished stand-in for npm's `braces`, wired in through the root `package.json`
`pnpm.overrides`.** It exists for one reason: `braces <= 3.0.3` has a known advisory and **npm has no
fixed version**, so there was nothing to bump to. Delete this package as soon as npm ships one (see
[Removing the fork](#removing-the-fork)).

## Why

- Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / CVE-2026-93687
  (published 2026-09-18, High, CWE-674): the recursive AST walkers have no depth guard, so a deeply
  nested brace pattern that is still under the 10 000-character limit exhausts the call stack and
  throws an uncaught `RangeError`. Affected: `braces <= 3.0.3`. Upstream report:
  [micromatch/braces#70](https://github.com/micromatch/braces/issues/70).
- Our only path to it is dev tooling: `eslint-config-next` / `@typescript-eslint/typescript-estree` ->
  `fast-glob` -> `micromatch@4.0.8` -> `braces`. Nothing ships to users. The CI's OSV-Scanner gate still
  blocks on it, and the founder chose to ship a fixed copy rather than renew a dated exception.
- Reproduced here (Node 24.14): unpatched braces throws `RangeError: Maximum call stack size
  exceeded` for a pattern under the length limit. At the default stack the failing depth is erratic (it
  depends on V8's JIT state: one cold run survived depth 4500, a warmed-up process failed near 3750; the
  reporter saw about 3500 for `compile()` on Node 26). With a fixed stack it is deterministic:
  `node --stack-size=200` fails `braces('{'.repeat(2000) + 'a,b' + '}'.repeat(2000), { expand: true })`
  every time (9003 characters), and the patched copy throws the `SyntaxError` below instead.

## What is this code

| | |
| --- | --- |
| Base | the npm tarball of **braces@3.0.3**, integrity `sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==` (the value in `pnpm-lock.yaml`) |
| Licence | MIT, Copyright (c) 2014-present Jon Schlinkert. [`LICENSE`](./LICENSE) is the upstream file, unchanged |
| Unchanged files | `LICENSE`, `README.md` (upstream's), `index.js`. Only `package.json` was adapted (private, renamed, versioned); the six `lib/*.js` files carry the patch |
| Version | `3.0.3-citizens.1` |

Git history keeps the vendored import (`chore(deps): vendor braces@3.0.3 verbatim`) separate from the
patch, so `git diff <vendor commit>..HEAD -- packages/braces-patched/lib` is exactly the patch. Or
compare against a fresh tarball, see [Verifying](#verifying).

## The patch

A nesting-depth guard, nothing else.

- `lib/constants.js`: `MAX_DEPTH: 100`.
- `lib/utils.js`: `maxDepth(options)` (the limit in effect) and `depthError(...)`.
- `lib/parse.js`: before a `{` or `(` is pushed onto the parser's `stack` (which holds **both** braces
  and parens, so both count), throw `SyntaxError: Input nesting depth (101), exceeds max depth (100)`
  if that would nest deeper than the limit. No AST deeper than the limit can be built, so the
  recursive walkers can never be handed one.
- `lib/compile.js`, `lib/expand.js`, `lib/stringify.js`: a depth counter in each recursive walker
  (`SyntaxError: AST nesting depth ...`). The parser already protects string input, but
  `braces.compile()`, `braces.expand()` and `braces.stringify()` also accept a caller-built AST that
  never passes through it.

### Behaviour

- **Every normal pattern is byte-for-byte identical** to braces@3.0.3: results, thrown errors and
  console output. `test/golden.test.js` checks about 490 000 results (every string of up to 4 tokens
  from a brace-relevant alphabet, 67 real-world globs, and nesting depth 1-20 in 8 shapes, through 7
  API variants) against digests taken from the pristine tarball.
- **Nesting deeper than 100 now throws a `SyntaxError`** immediately (it used to recurse until the
  stack blew up). A `SyntaxError` matches the existing `maxLength` error, so callers that already
  handle an oversize pattern handle this too. 100 levels of `{}` or `()` is far beyond any real glob.
- Unbalanced openers count too: `'{'.repeat(101)` now throws, where upstream returned a flat tree.
  That input is not exploitable but is equally absurd, and rejecting it keeps the guard to one rule.
- **`options.maxDepth`** may _lower_ the limit (`braces(p, { maxDepth: 3 })`) but never raise it above
  100, mirroring how `options.maxLength` works, so no options object can re-open the hole. A value
  that is not a number >= 0 (`NaN`, negative, a string) falls back to 100 instead of disabling the guard.
- The margin is wide: on a 128 KB V8 stack (an eighth of the default) pristine braces already
  overflowed at a depth of roughly 450-1100 depending on the call (measured; it varies a little between
  runs), while depth 100 completes (tested).

### Deliberately left alone

Other upstream quirks are kept exactly so behaviour stays identical: `compile()`'s stray
`console.log('node.isClose', ...)`, `stringify()` not passing `parent` to its recursive calls, and
`options.maxLength` accepting `NaN`. They belong in an upstream issue, not in this fork.

## Wiring

Root `package.json`:

```json
"pnpm": { "overrides": { "braces": "link:./packages/braces-patched" } }
```

`link:` resolves to the workspace package, so no `braces` entry exists in `pnpm-lock.yaml` any more
and OSV-Scanner has no vulnerable package to match. `test/integration.test.js` asserts that
micromatch (and the micromatch inside fast-glob) load this copy and that **no** `braces@*` directory
remains in pnpm's virtual store.

## Verifying

```bash
pnpm --filter braces-patched test        # golden (identical behaviour), depth guard, integration
pnpm why braces -r                       # every path ends in braces-patched / link
```

CI's unit-test step runs `pnpm test:coverage`, so this package defines `test:coverage` as the same
command as `test` (there is no coverage report); without it turbo would skip the suite in CI.

To re-derive the comparison from scratch (needs `npm`; on Windows Git Bash add `--force-local` to tar):

```bash
cd packages/braces-patched
npm pack braces@3.0.3 --pack-destination /tmp          # integrity must equal the value above
mkdir -p .upstream-3.0.3 && tar -xzf /tmp/braces-3.0.3.tgz -C .upstream-3.0.3   # gitignored
diff -ru .upstream-3.0.3/package . -x node_modules -x test -x .upstream-3.0.3 -x PATCHED.md \
  -x package.json -x .gitignore -x pnpm-lock.yaml
node test/golden/run.js --diff .upstream-3.0.3/package   # "no differences" over the whole corpus
node test/golden/run.js --generate .upstream-3.0.3/package   # regenerates upstream-3.0.3.json
```

## Removing the fork

Do this when npm publishes a `braces` that is **not** listed as affected by GHSA-vfj7-8cjw-p6xm
(check the advisory's affected ranges first; `npm view braces version` alone is not enough).

1. Delete the `"braces": "link:./packages/braces-patched"` line from the root `pnpm.overrides`
   (and, if needed, add a floor such as `"braces": ">=<fixed version>"`).
2. `git rm -r packages/braces-patched` and delete the `packages/braces-patched` line from
   `.prettierignore`.
3. `pnpm install`, then `pnpm why braces -r` (everything should resolve to the npm release) and the
   CI's OSV command: `osv-scanner scan --config=osv-scanner.toml -L pnpm-lock.yaml`.
4. Update `apps/connect/RESUME_HERE.md` (§3 Process and the housekeeping item for this fork).

## Upstream

A fix for micromatch/braces (the same guard, plus tests) is drafted in the PR description that
introduced this package. When upstream releases its own fix, prefer that over this fork.
