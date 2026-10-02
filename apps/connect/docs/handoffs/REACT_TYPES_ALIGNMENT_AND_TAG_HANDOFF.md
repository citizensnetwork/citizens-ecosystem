# HANDOFF — (A) One React-types version per React line + Next-scoped type resolution · (B) push the pre-mig-174 git tag

> **Status (2026-09-27):** founder-approved, **not started**. Both tasks were proposed at the end of
> `RESUME_HERE.md` §3AS and the founder said: *"I'd like to enact both of those suggestions."*
> Task A's exact change was **validated end-to-end** in the authoring sandbox (every workspace gate green,
> all three apps typecheck under every possible hoist), then **reverted**. Nothing below has been
> committed, and no database work is involved.
>
> Written for a **stateless** session: every fact, command and expected output you need is here.
> Base: `main` @ `4c82fcb` (merge of PR #68). Repo `citizensnetwork/citizens-ecosystem`.
>
> **⚠ RESUME_HERE.md was restructured on 2026-09-27 (after this brief was written).** It no longer has
> `## 3A…` sections or a NEXT STEPS block; §3A–§3AT now live verbatim in
> `docs/archive/RESUME_HISTORY_2026H2.md` (do not edit the archive). This work is **item S2** in RESUME §4.
> Wherever this brief says "add a RESUME section" or "update NEXT STEPS", instead: delete item S2 from §4,
> fix the S2 tag note, and add a short entry at the top of §6 (Recent sessions). In the canary-file comment,
> cite the PR number instead of a RESUME section. Task B's tag status was re-checked on 2026-09-27: neither
> `connect-pre-mig174-profiles-privacy` nor `pre-mig-172-entity-socials` exists locally or on the remote
> (create them, don't just push); `connect-pre-mig158`, `connect-v1-pre-mig164` and `wear-pre-mig163` exist
> only locally (push them too).

---

## 0. Before you start (repo protocol — root `CLAUDE.md`)

1. Read `apps/connect/VISION.md`, then `apps/connect/RESUME_HERE.md` §3AS (the section that produced
   this hand-off). Run VISION's alignment self-prompt. This is "excellence as stewardship" work: it
   removes a class of phantom production-build failures.
2. Create a session offload file in `.claude/sessions/`, for example `react-types-alignment.md`. The
   folder is gitignored.
3. Work on your designated branch, cut from the latest `main`. **Do not** reuse
   `claude/gifted-pasteur-c5jjoh`; its PRs (#67, #68) are merged.
4. **PR / merge authority.** In the session that wrote this, the founder granted permission to open
   and merge PRs once CI is green, and has now approved both tasks. If your own session instructions
   say otherwise, follow them and ask.
5. Gates are workspace-wide (root `CLAUDE.md`):
   `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
   Run them **one at a time** (see §A.8, gotcha 1). Playwright e2e runs in CI (`e2e-connect`). The
   authoring sandbox could not run it locally because its egress policy blocks unpkg, jsdelivr and
   the Tailwind CDN, so React never loads (§3AS, "Honest checkpoint").

---

## Task A — make React type resolution deterministic (no app may depend on pnpm's hoisting)

### A.1 Why (the incident this prevents)

On 2026-09-26 and 2026-09-27 Vercel builds failed with this error on code nobody had touched:

```
./src/lib/contributors/resolveSlug.ts:12:10
Type error: Module '"react"' has no exported member 'cache'.
```

It hit PR #63's production build (§3AQ) and PR #68's preview on `c27cf22` (§3AS). The same commits
built locally and in GitHub CI. §3AQ blamed the `tsc` incremental cache; **that was wrong**. The real
mechanism was reproduced both ways:

- With `@types/react` 18.3, `cache`'s type exists only in `@types/react/canary.d.ts`.
- Connect got it via Next's `/// <reference types="react/experimental" />` in `next/dist/types.d.ts`
  (`experimental` includes `canary`).
- `next` is a **shared** pnpm virtual-store package, and it has **no** dependency or peer on
  `@types/react`. So TypeScript resolves that reference upward from Next's real path, into
  `node_modules/.pnpm/node_modules/@types/react`. That is pnpm's hoist slot, and it holds whichever
  of the monorepo's `@types/react` versions pnpm happened to put there.
- A Vercel build restores a cached `node_modules`, which can hoist a different version. The canary
  augmentation then lands on a copy that Connect's own `import … from "react"` never sees.

**Current mitigation (on `main`):** `apps/connect/src/types/react-canary.d.ts`
(`/// <reference types="react/canary" />`, resolved from Connect's own `node_modules`). It fixes
Connect only.

### A.2 Current layout (verified 2026-09-27 on `main` @ `4c82fcb`)

| Workspace | `react` | `@types/react` (resolves to) | `@types/react-dom` | `next` instance |
|---|---|---|---|---|
| `apps/connect` | `^18.3.1` | `^18.3.28` → **18.3.31** | `^18.3.7` → 18.3.7 | `next@15.5.26…react@18.3.1` (**shared with wear**) |
| `apps/wear` | `18.3.1` | `18.3.3` (exact) → **18.3.3** | `18.3.0` (exact) | same `next@15.5.26` instance (wear declares `15.5.18`; root `pnpm.overrides` lifts it) |
| `packages/ui` | dev `18.3.1`, peer `^18.3.0` | `18.3.3` (exact) → **18.3.3** | — | — |
| `apps/vision` | `19.2.4` | `^19` → **19.2.17** | `^19` → 19.2.3 | `next@16.3.6…react@19.2.4` (own instance; declares `16.2.6`, lifted by the same override) |

- Installed `@types/react` versions: **18.3.3, 18.3.31, 19.2.17**. The hoist slot currently points at
  18.3.31.
- Both `next` instances, **including Vision's Next 16**, resolve React types through that one slot.
- TypeScript: connect and vision use `^5.9.3`; wear and packages use `5.5.4`. Package manager is
  `pnpm@9.12.0` (root `packageManager`); Vercel installs with pnpm 9.15.9 against the same v9
  lockfile.

**Risk today is latent, not active.** On `main`, re-pointing the hoist slot to 18.3.3 or 19.2.17
leaves **all three apps at 0 `tsc` errors**, because Connect's canary file covers the only
hoist-sensitive API in use. Correctness still depends on luck of layout, and the next canary or
experimental React API, or any cross-copy JSX type, would re-open it for Wear or Vision.

### A.3 Goal and definition of done

1. **One `@types/react` version per React major line.** The React 18 line (connect, wear, ui) all
   resolve **18.3.31**, and `@types/react-dom` resolves **18.3.7**. The React 19 line (vision) keeps
   `^19` (19.2.17 / 19.2.3). Vision is on React 19, so a single version across all four is neither
   possible nor wanted.
2. **Next's type references resolve to the app's own copy, never the hoist slot.** This is done by
   giving `next` optional peers on `@types/react` and `@types/react-dom` through
   `pnpm.packageExtensions`. pnpm then links the consuming app's types **inside** each `next`
   instance.
3. **Proof:** every app typechecks with 0 errors under **every** hoist, **even with Connect's
   `react-canary.d.ts` temporarily removed** (§A.6).
4. Workspace gates, CI (Verify, E2E, CodeQL), and Vercel previews for **all three** projects are
   green. After merge, all three production deploys are READY with 0 runtime errors.
5. `RESUME_HERE.md` gains a new section, and NEXT STEPS is updated (§C).

### A.4 The change (exactly what was validated)

Three `package.json` edits, then a lockfile regeneration by pnpm. **Never hand-edit
`pnpm-lock.yaml`.**

**1. `apps/wear/package.json`**, in `devDependencies`:

```diff
-    "@types/react": "18.3.3",
-    "@types/react-dom": "18.3.0",
+    "@types/react": "^18.3.28",
+    "@types/react-dom": "^18.3.7",
```

**2. `packages/ui/package.json`**, in `devDependencies`:

```diff
-    "@types/react": "18.3.3",
+    "@types/react": "^18.3.28",
```

**3. Root `package.json`**: add `packageExtensions` inside the existing `"pnpm"` object, as a sibling
of `"overrides"`. Do **not** touch `overrides`.

```diff
       "baseline-browser-mapping@2.10.41": ">=2.11.0"
+    },
+    "packageExtensions": {
+      "next": {
+        "peerDependencies": {
+          "@types/react": "*",
+          "@types/react-dom": "*"
+        },
+        "peerDependenciesMeta": {
+          "@types/react": {
+            "optional": true
+          },
+          "@types/react-dom": {
+            "optional": true
+          }
+        }
+      }
     }
   }
 }
```

The peers are **optional** so that anything installing `next` without React types (none today)
wouldn't fail. `*` is correct: each app's own devDependency range picks the version.

**4. Regenerate the lockfile:** run `pnpm install` from the repo root, **without**
`--frozen-lockfile`. In validation this took about 7 s. The lockfile diff was
`pnpm-lock.yaml | 61 +++++++++++++++++++++++++-----------------------` (32 insertions, 29
deletions). Commit `pnpm-lock.yaml` together with the three `package.json` files.

**5. Update Connect's canary file comment.** Keep the file: it's harmless and documents intent, and it
becomes a second line of defence. Its current comment says the reference resolves "from Next's
*shared* pnpm install, i.e. whichever @types/react pnpm hoisted", which will no longer be true. Append
this paragraph to the end of the comment block, directly above the `/// <reference …>` line:

```ts
//
// Since the React-types alignment (see RESUME_HERE.md, the section after §3AS),
// root package.json `pnpm.packageExtensions` gives `next` optional peers on
// @types/react(-dom), so Next's own references resolve to each app's copy too.
// This file is now belt-and-braces: it keeps Connect's canary types explicit.
```

Put the section number in once you've written that RESUME section (§C).

### A.5 Structural check (expected output from validation)

After `pnpm install`:

```bash
ls node_modules/.pnpm | grep -E '^next@'
for d in node_modules/.pnpm/next@*/node_modules/@types; do
  echo "$d"
  for t in react react-dom; do
    [ -e "$d/$t" ] && echo "   $t -> $(readlink -f "$d/$t" | sed 's#.*/.pnpm/##; s#/node_modules.*##')"
  done
done
for a in connect wear vision; do
  echo "$a -> $(readlink -f apps/$a/node_modules/next | sed 's#.*/.pnpm/##; s#/node_modules.*##')"
done
grep -cE "@types/react@18\.3\.3([^0-9.]|$)" pnpm-lock.yaml      # expect 0 (was 2)
grep -cE "@types/react-dom@18\.3\.0([^0-9.]|$)" pnpm-lock.yaml  # expect 0 (was 2)
```

Expected: two **new** `next` instance names containing `@types+react…`, each with `@types` linked
**inside**:

```
next@15.5.26_…_@types+react-dom@18.3.7_@types+react_<hash>/node_modules/@types:
   react -> @types+react@18.3.31
   react-dom -> @types+react-dom@18.3.7_@types+react@18.3.31
next@16.3.6_…_@types+react-dom@1_<hash>/node_modules/@types:
   react -> @types+react@19.2.17
   react-dom -> @types+react-dom@19.2.3_@types+react@19.2.17
connect -> next@15.5.26_…_@types+react-dom@18.3.7_@types+react_…
wear    -> next@15.5.26_…_@types+react-dom@18.3.7_@types+react_…   (still shared with connect: same peers)
vision  -> next@16.3.6_…_@types+react-dom@1_…
```

In an **existing** checkout, the old `next@…` directories and `@types+react@18.3.3` stay in
`node_modules/.pnpm` as orphans. That is harmless and they're absent from a fresh install. Judge by
the symlinks and the lockfile, not by `ls`.

### A.6 The hoist-swap proof (the acceptance test for Task A)

This harness re-points pnpm's hoist slot to each installed `@types/react` version and typechecks
every Next app. Save it to your scratchpad, not the repo, and run it from the repo root.

```bash
#!/usr/bin/env bash
# hoist-swap.sh — typecheck every Next app under each possible hoisted @types/react.
set -u
cd "$(git rev-parse --show-toplevel)"
H=node_modules/.pnpm/node_modules/@types/react
ORIG=$(readlink "$H")
trap 'ln -sfn "$ORIG" "$H"; echo "restored hoist -> $(readlink "$H")"' EXIT
for d in node_modules/.pnpm/@types+react@*/; do
  v=${d#node_modules/.pnpm/@types+react@}; v=${v%/}
  ln -sfn "../../@types+react@$v/node_modules/@types/react" "$H"
  printf 'hoist=%-9s' "$v"
  for a in connect wear vision; do
    n=$(cd "apps/$a" && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c 'error TS')
    printf ' %s=%s' "$a" "$n"
  done
  echo
done
```

Run it twice:

1. As is. **Expect every cell to be 0.**
2. With Connect's canary file moved aside, which proves the structural fix works on its own:
   ```bash
   mv apps/connect/src/types/react-canary.d.ts /tmp/ && bash hoist-swap.sh; mv /tmp/react-canary.d.ts apps/connect/src/types/
   ```
   **Expect every cell to be 0.** Validation output:
   ```
   hoist=18.3.3    connect=0 wear=0 vision=0
   hoist=18.3.31   connect=0 wear=0 vision=0
   hoist=19.2.17   connect=0 wear=0 vision=0
   ```

**Control (optional, run on `main` before your change):** with the canary file moved aside and
`hoist=19.2.17` (or 18.3.3), Connect shows **1** error, the exact
`Module '"react"' has no exported member 'cache'`. So the harness really detects the bug.

Always make sure the `trap` restored the link (`readlink node_modules/.pnpm/node_modules/@types/react`),
and that the canary file is back (`git status` must show no deletion).

### A.7 Gates, CI, deploys

- Local, sequentially: `pnpm format:check`, `pnpm lint` (12/12), `pnpm typecheck` (12/12),
  `pnpm test` (11/11; Connect is about 775 passed and 32 skipped, the skips being the live privacy
  probe), `pnpm build` (8/8). All five passed on the validated change.
- `pnpm install --frozen-lockfile`, which is what CI runs, must succeed after you commit the lockfile.
  It did in validation.
- PR CI: **Verify** (format, lint, typecheck, coverage tests, build, OSV-Scanner), **E2E (Connect —
  Playwright)**, **CodeQL / Analyze**. The OSV-Scanner step audits the lockfile. This change removes
  packages and adds none, but read the step if it goes red.
- **Vercel previews.** A root `package.json` change affects all three projects, so expect all three
  to build, **not** "Skipped". Confirm each is READY:

  | Project | ID |
  |---|---|
  | Connect | `prj_VZzA43vga00TqyXdVcOldGRdJGaT` |
  | Vision | `prj_fH9D5q6zPK9lCcsGFKi2yhncZ3pF` |
  | Wear | `prj_ohA5Uvks92sqnp7E2L8CYur35YXx` |

  The team is `team_nEw2knMsXJOHrOvajiUZjOLT`, and the Vercel MCP tools work with these IDs. If a
  build fails, pull the real log (`list_deployment_events`, `direction: backward`); don't guess.
- **After merge:** all three **production** deploys READY (Connect serves `www.citizenscentral.co.za`),
  and `get_runtime_errors` (`since: "30m"`) shows none for each project.

### A.8 Gotchas (all hit in the authoring session)

1. **Don't run `lint typecheck build` in one `turbo run`.** `build` regenerates `.next/` while
   `typecheck` reads `.next/types/…`, which gives spurious `TS6053: File '…/.next/types/app/…/route.ts'
   not found`. CI runs them as separate steps; do the same.
2. **`next-env.d.ts` is gitignored and generated.** It references `./.next/types/routes.d.ts`. If you
   delete `.next/` but keep `next-env.d.ts`, a bare `tsc` gives TS6053. Delete both together, or run
   `pnpm build` first.
3. **Remove generated `apps/*/coverage/`** after `pnpm test:coverage`. ESLint lints it and warns
   ("Unused eslint-disable directive").
4. **The sandbox can't run Playwright** because the CDNs are blocked. Rely on CI's `e2e-connect`, and
   confirm it actually ran (its log shows `13 passed`), not just that it went green.
5. **Scope.** Do not change `react` / `react-dom` runtime versions, Next versions, `pnpm.overrides`,
   or Vision's `^19` types. A Wear `next` bump from 15.5.18 to 15.5.x is out of scope, since the
   override already lifts it.

### A.9 Rollback

Revert the merge commit on `main`. It touches only three `package.json` files, `pnpm-lock.yaml` and
one comment. Vercel then rebuilds the previous dependency graph. Connect stays protected by
`react-canary.d.ts` either way.

---

## Task B — push the missing pre-migration-174 git tag

### B.1 Facts

- **Tag:** `connect-pre-mig174-profiles-privacy`.
- **Target:** `dca44115e7c29ab8fcc5a0236c8ce21d1fe6b92b`, "Merge pull request #64 …", merged
  2026-09-27 13:07:50 UTC.
- **Why this commit:** migrations 174 → 177 (the `public.profiles` PII lockdown, §3AS) were first
  applied at 13:23:37 UTC. `dca4411` is the last **code-bearing** `main` commit before that.
  - PR #65 (`b1e57db`, merged 13:21:49 UTC) sits in between, but it changed **only**
    `apps/connect/RESUME_HERE.md`.
  - `SHARED_DB_CONTRACT.md` §9 and RESUME §3AS both cite `dca4411`. **Tag `dca4411`; don't "correct"
    it to `b1e57db`.**
- **Convention: lightweight tags** (`git cat-file -t` gives `commit`), named `<app>-pre-mig<N>[-slug]`.
  Existing remote tags: `connect-pre-mig157`, `connect-pre-mig168-no-fixed-location`,
  `connect-pre-mig173-form-intake`, `wear-pre-mig160`, `wear-pre-mig161`, `wear-pre-mig162`,
  `wear-pre-monorepo`.
- **Why it's missing:** the authoring session created it locally (annotated, by mistake), but its git
  proxy refused the tag push with `send-pack: unexpected disconnect while reading sideband packet` /
  `fatal: the remote end hung up unexpectedly`. That container is gone, so **recreate the tag**; don't
  look for it.
- **No GitHub MCP tool creates tags.** `create_branch` makes only `refs/heads/*`.

### B.2 Steps

```bash
git fetch origin main --tags
git merge-base --is-ancestor dca44115e7c29ab8fcc5a0236c8ce21d1fe6b92b origin/main && echo "on main ✓"
git ls-remote --tags origin connect-pre-mig174-profiles-privacy   # expect empty (not yet pushed)
git tag connect-pre-mig174-profiles-privacy dca44115e7c29ab8fcc5a0236c8ce21d1fe6b92b   # lightweight
git cat-file -t connect-pre-mig174-profiles-privacy               # expect: commit
git push origin refs/tags/connect-pre-mig174-profiles-privacy
git ls-remote --tags origin connect-pre-mig174-profiles-privacy   # expect: dca44115e7c2…  refs/tags/connect-pre-mig174-profiles-privacy
```

**If the push is refused** (a cloud session's git proxy may allow only your designated branch), try
**once**, then stop. Don't loop and don't route around the proxy. Give the founder these two options:

- **From their own machine** (simplest):
  ```bash
  git fetch origin
  git tag connect-pre-mig174-profiles-privacy dca44115e7c29ab8fcc5a0236c8ce21d1fe6b92b
  git push origin connect-pre-mig174-profiles-privacy
  ```
- **Or with the GitHub REST API**, using a token that has `contents: write`:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/citizensnetwork/citizens-ecosystem/git/refs \
    -d '{"ref":"refs/tags/connect-pre-mig174-profiles-privacy","sha":"dca44115e7c29ab8fcc5a0236c8ce21d1fe6b92b"}'
  ```

Then verify with `git ls-remote` as above.

### B.3 Docs to update once the tag is on the remote

Every doc mention wraps across lines, so find them by the tag name:

```bash
grep -rn "connect-pre-mig174-profiles-privacy" apps/connect --include=*.md
```

Expect three hits outside this hand-off. Edit each one:

- `apps/connect/docs/SHARED_DB_CONTRACT.md`, §9: "(local tag `connect-pre-mig174-profiles-privacy`;
  the session's git proxy refused tag pushes)". Change it to "(tag … — pushed <date>)".
- `apps/connect/RESUME_HERE.md`, §3AS: "Pre-apply snapshot `dca4411` (tag … exists locally only — the
  git proxy refused tag pushes)". Change it to say the tag is pushed.
- `apps/connect/RESUME_HERE.md`, NEXT STEPS, in the §3AS bullet that points to this hand-off. Mark
  Task B done.

---

## C. Finish

1. Add a new `RESUME_HERE.md` section after the last `## 3A…` section (check the highest letter on
   `main`; §3AS was the latest when this was written). It should cover what changed, the §A.5 / §A.6
   evidence, gates, PR number, CI and deploy results, and the tag result.
2. Update NEXT STEPS: drop the two §3AS follow-ups, and put the new section number into the canary
   file comment (§A.4 step 5).
3. Mark this hand-off's **Status** line as done, with the PR link.
4. Report to the founder what shipped, what (if anything) needed their hands (the tag fallback), and
   anything left.
