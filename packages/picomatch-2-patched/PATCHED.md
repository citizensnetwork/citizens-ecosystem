# picomatch-2-patched: Citizens' patched copy of picomatch@2.3.2

**A private, unpublished stand-in for npm's `picomatch` 2.x, wired in through the root
`package.json` `pnpm.overrides`.** It exists for one reason: every `picomatch <= 4.0.7` has a known
advisory and **npm has no fixed version**, so there was nothing to bump to. Delete this package as
soon as npm ships one (see [Removing the fork](#removing-the-fork)). Its sibling
`packages/picomatch-4-patched` does the same for the 4.x line; the patch is
identical in both.

## Why

- Advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) / CVE-2026-112366
  (published 2026-10-19, reviewed 2026-11-17, High, CWE-1333): a repeated extglob whose body holds a
  wildcard, such as `+(*a)`, compiles to nested unbounded quantifiers (`(?:[^/]*?a)+`), which
  backtrack exponentially on short strings that do not match. Affected: every `picomatch` up to
  4.0.7 (npm's latest). Upstream has several fix proposals open (micromatch/picomatch PRs 237, 238,
  246 and 254), none merged or released when this fork was made.
- Our paths to it are dev tooling: `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch@4.0.8` -> `picomatch` 2.3.2. Nothing ships to users. CI's OSV-Scanner gate still blocks
  on it, and repo policy (`osv-scanner.toml`) is to fix a dependency rather than ignore an advisory.
- Reproduced here (Node 24): on pristine picomatch, `+(*a)` against `'a'.repeat(22) + '!'` takes
  about 100 ms and doubles with every extra character; `+(!(b)!(b))` (a shape the advisory does not
  name, see below) took 271 seconds on a 23-character string. The patched copy answers both in well
  under a millisecond.

## What is this code

|                 |                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base            | the npm tarball of **picomatch@2.3.2**, integrity `sha512-V7+vQEJ06Z+c5tSye8S+nHUfI51xoXIXjHQ99cQtKUkQqqO1kO/KCJUfZXuB47h/YBlDhah2H3hdUGXn8ie0oA==` (the value `pnpm-lock.yaml` had)                                                |
| Licence         | MIT, Copyright (c) 2017-present Jon Schlinkert. [`LICENSE`](./LICENSE) is the upstream file, unchanged                                               |
| Unchanged files | everything except `package.json` (private, renamed, versioned, `node --test` scripts, devDependencies for the integration test) and `lib/parse.js` |
| Version         | `2.3.2-citizens.1`                                                                                                                              |

Git history keeps the vendored import (`chore(deps): vendor picomatch@2.3.2 and picomatch@4.0.7
verbatim`) separate from the patch, so `git diff <vendor commit>..HEAD -- packages/picomatch-2-patched/lib`
is exactly the patch. Or compare against a fresh tarball, see [Verifying](#verifying).

## The patch

One extra check in `lib/parse.js`, at the single point where upstream's own repeated-extglob guard
(`analyzeRepeatedExtglob`, which already literalizes other risky shapes such as `+(a|aa)`) would call
a `+(...)` or `*(...)` body safe:

- `scanBranchStars(branch)` looks for an **unbounded wildcard** in each branch: a `*` or `**` that is
  not escaped and does not open a nested `*(...)` (upstream's guard handles those), or a nested
  `!(...)`, which compiles to a lookahead plus an unbounded star. It errs towards finding one: a `*`
  inside quotes, a bracket expression or a nested extglob counts too.
- If a branch has one, there are two outcomes:
  - **Collapsed** when the body is a single branch of nothing but plain characters, `?` and single
    stars (`+(*a)`, `*(*.js)`, `+(a*b?)`). Such a branch B is closed under concatenation: in a match of
    B B, the first star absorbs everything up to the second copy's matching star, because that stretch
    contains no `/`. So `+(B)` is emitted as `@(B)` and `*(B)` as `?(B)`, which match exactly the same
    strings, without the outer repetition.
  - **Literalized** otherwise (`+(*a|*b)`, `+(*/a)`, `+(*[ab])`, `+(**)`, `+(!(b)!(b))`): the extglob
    becomes literal text, exactly what upstream already does for every other risky repeated extglob.
- `extglobClose` emits the collapse (`)` instead of `)+`, `)?` instead of `)*`). Nothing else changes.

### Behaviour

- **Every pattern without a repeated, wildcard-bearing extglob behaves exactly as before**, and so do
  collapsed ones. `test/golden.test.js` checks 24,273 (2,716 of them literalized) corpus patterns (every extglob of up to 3
  body tokens, and up to 2 in 19 prefix/suffix contexts, plus 33 real-world globs), each compiled with
  4 option sets and run against 369 inputs, against digests taken from the pristine tarball.
- **Literalized patterns change meaning**: they now match only their own text. Of the 10,864 (pattern, option set) pairs the corpus literalizes, 7,240 matched at least one short input on upstream; the rest upstream had already made literal. They are
  unusual shapes (an alternation, a path separator, a bracket, a globstar or a negation inside `+(...)`
  or `*(...)` next to a wildcard); no glob in this repository or its tooling configs uses one.
- **Captures**: `capture: true` wraps the whole extglob, outside the repetition, so its group is
  unchanged. Only a capture of the inner star itself can differ for a collapsed extglob (it now covers
  the whole match instead of the last repetition).
- **`maxExtglobRecursion: false`** still turns every safeguard off, this one included (upstream's
  documented opt-out, which restores the vulnerable behaviour on purpose). A number for it does not
  disable this check.

### Deliberately left alone

- Upstream's own analysis and rewrites (e.g. `+(*(a))` to a character class) run first, unchanged.
  In 2.x that includes a known upstream quirk: as soon as one branch is a `*(x)` sequence, the
  whole body becomes a flat character class and the other branches are dropped (`+(*(a)|!(b))`
  matches like `a*`; 4.x fixed it). It is safe from backtracking, so it is kept as is.
- Other open upstream bugs, such as a leading `?` in an extglob body not being parsed as an extglob
  (micromatch/picomatch PR 194), are kept exactly so behaviour stays identical.

## Wiring

Root `package.json`:

```json
"pnpm": {
  "overrides": {
    "picomatch@<3": "link:./packages/picomatch-2-patched",
    "picomatch@>=3": "link:./packages/picomatch-4-patched",
    "fdir>picomatch": "^3 || ^4"
  }
}
```

`link:` resolves to the workspace package, so no `picomatch` entry exists in `pnpm-lock.yaml` any more
and OSV-Scanner has no vulnerable package to match. The third line is needed because pnpm applies
overrides to peer ranges too: without it, fdir's optional `picomatch` peer range is rewritten to an
**absolute path on the machine that ran the install** (a local path in a public repository, and a
lockfile CI would not reproduce). With it, fdir keeps its published range and still resolves to the
patched copy (through tinyglobby). `test/integration.test.js` asserts the resolution, that the
lockfile has no `picomatch@` entry, and (in the 4.x copy) that no `link:` holds an absolute path.

## Verifying

```bash
pnpm --filter picomatch-2-patched test   # golden (identical behaviour), ReDoS cases, integration
pnpm why picomatch -r                       # every path ends in picomatch-2-patched / picomatch-4-patched
```

CI's unit-test step runs `pnpm test:coverage`, so this package defines `test:coverage` as the same
command as `test` (there is no coverage report); without it turbo would skip the suite in CI.

To re-derive the comparison from scratch (needs `npm`; on Windows Git Bash add `--force-local` to tar):

```bash
cd packages/picomatch-2-patched
npm pack picomatch@2.3.2 --pack-destination /tmp          # integrity must equal the value above
mkdir -p .upstream-2.3.2 && tar -xzf /tmp/picomatch-2.3.2.tgz -C .upstream-2.3.2   # gitignored
diff -ru .upstream-2.3.2/package . -x node_modules -x test -x .upstream-2.3.2 -x PATCHED.md \
  -x package.json -x .gitignore                                 # only lib/parse.js differs
node test/golden/run.js --diff .upstream-2.3.2/package     # "no differences" over the whole corpus
node test/golden/run.js --generate .upstream-2.3.2/package # regenerates upstream-2.3.2.json
```

`run.js` never runs upstream's regex for a pattern the patch literalizes (that is the vulnerable one);
`literalizedByPatch` in it restates the patch's contract independently of `lib/parse.js`, and the
test requires those patterns to now be literals.

## Removing the fork

Do this when npm publishes a `picomatch` 2.x that is **not** listed as affected by
GHSA-fc5q-39xc-vjpf (check the advisory's affected ranges first; `npm view picomatch versions` alone
is not enough).

1. Delete this package's line from the root `pnpm.overrides` (and, if needed, add a floor such as
   `"picomatch@<3": "^2.3.3"`). Delete `"fdir>picomatch"` once neither fork is linked any more.
2. `git rm -r packages/picomatch-2-patched`, delete its line from `.prettierignore` and from the
   live-graph test in `scripts/vercel-ignore.test.mjs`, and its paragraph in `osv-scanner.toml`.
3. `pnpm install`, then `pnpm why picomatch -r` (that line should resolve to the npm release) and the
   CI's OSV command: `osv-scanner scan --config=osv-scanner.toml -L pnpm-lock.yaml`.
4. Record it in your session-journal entry (the daily fold updates `apps/connect/RESUME_HERE.md`).

## Upstream

Prefer an upstream release over this fork as soon as one exists. The same check (collapse when exact,
literalize otherwise, counting a nested `!(...)` as a wildcard) would make a focused upstream PR; the
proposals open today each miss at least one shape the golden corpus here covers.
