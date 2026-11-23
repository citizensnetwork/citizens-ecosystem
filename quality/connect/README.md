# Citizens Connect QA

Start with [VISION.md](../../apps/connect/VISION.md), the [programme charter](programme/MASTER.md) and the [scenario coverage map](programme/COVERAGE.md). The framework records what was exercised so a broken guest entry, inaccessible control or hidden listing does not get masked by a passing mock suite.

## Setup and commands

From the repository root, use Python 3.10+ with IANA timezone data, and the repository’s Node and pnpm versions for Playwright. Prefix `pnpm` commands with `corepack` if a different global pnpm is installed. Use a fresh checkout with no dotenv files or active production credentials for local fixture runs.

```sh
python3 -m venv quality/connect/.venv
. quality/connect/.venv/bin/activate
python -m pip install -r quality/connect/requirements.txt

python -m unittest discover -s quality/connect -v
node --test quality/connect/guest-policy.test.mjs
python quality/connect/qa.py dry-run --out /tmp/connect-qa-dry
python quality/connect/qa.py validate quality/connect/programme/templates/evidence.example.json /tmp/connect-qa-dry/evidence.json
```

- `dry-run` starts a synthetic HTTP server on an ephemeral IPv4 loopback port. It verifies the canonical redirect, HTML app-root marker, CSS response and staging denials. It never selects a live scenario.
- `public` checks the fixed Connect route and one stylesheet by GET. Redirects are never followed automatically. One exact same-origin slash redirect is allowed as a separate GET. Browser readiness remains a separate measurement.
- `staging` returns a recorded CC-07 blocker. It launches no staging processes, accepts no credentials and has no environment flag that can grant mutation access. Phase 3 must add the mutation adapter only after reviewing the exact deployment and independent backend pair, synthetic roles, cleanup, delivery sinks and redirect/egress controls. A preview alone is insufficient.
- Set `--previous-run-id` when using a known preceding run. Pass `--run-id` for a chosen unique ID. `--out` must refer to a directory that does not yet exist, so retries cannot overwrite evidence. Use another run ID and directory for partial or interrupted runs.
- Runner exit codes are 0 for completed checks that passed, 1 for an assertion failure, and 2 for a blocked prerequisite or interrupted run. Evidence is validated and atomically saved before execution and after each check. An `in_progress` file after a hard stop is partial evidence. Scenario status is separate from framework check status.

### Production guest browser (Phase 2)

Install Playwright from the locked app dependencies with `corepack pnpm install --frozen-lockfile` and `pnpm --filter citizens-connect exec playwright install chromium`. Use a supported desktop with a visible display. Run the desktop and narrow commands from the coverage map and document outcomes directly against CC-01 through CC-06. The browser launcher opens a fresh context, blocks service workers and WebSockets, allows only reviewed public GET/HEAD routes and asset origins, strips credential headers, and discards redirects. Its terminal counters contain no raw URLs. This is an HTTP request policy for this browser session. Continue to observe the production read-only operating rules.

The allowlist intentionally excludes telemetry, auth, unreviewed endpoints and external navigation. If this prevents a journey, record a tooling blocker and the sanitized request class. Review source for the exact host, path, method and side effects before extending the allowlist. Prefer using the visit to establish meaningful visible behaviour rather than introducing broad routing exceptions. Browser exit 0 only means the launcher completed. Record viewport, run time, visible expected/actual and independently verified evidence before assigning a scenario result.

### Configuration names

| Name                                                                     | Purpose                                                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONNECT_QA_STAGING_ORIGIN`                                              | Candidate origin checked by the staging preflight. Currently no environment can pass.                                                         |
| `E2E_PORT`                                                               | Existing Playwright local app server port. A fresh checkout avoids collisions.                                                                |
| `NEXT_PUBLIC_BASE_PATH`, `HUB_ORIGIN_CONNECT`                            | Existing base-path Playwright config sets these to the app prefix and loopback origin itself.                                                 |
| `CI`                                                                     | Existing Playwright runner policy for retries, workers and server reuse.                                                                      |
| `MOBILE_API_BASE_URL`, `MOBILE_PUBLIC_ORIGIN`, `MOBILE_PUBLIC_BASE_PATH` | Existing mobile build settings. Review against the environment before any app execution, since the API setting can default to the live alias. |

Do not load credential variables into the runner. The Phase 1 gate and dry run require zero provider credentials.

## Evidence, retention and recovery

- Store approved Markdown, JSON and redacted supporting files at `quality/connect/runs/YYYY-MM-DD/RUN-ID/` using Africa/Johannesburg dates. Use the report and handoff templates in `programme/templates/`. Use names such as `CC-01-desktop-first-entry.png` for reviewed evidence. Keep canonical report JSON and findings with Git history. Keep temporary diagnostic captures in restricted storage and remove them after seven days or sooner after generating reviewed summaries. CI keeps sanitized dry-run JSON for seven days.
- Before saving shared evidence, remove cookies, API keys, tokens, configuration dumps, request/response bodies, personal identifiers, emails, and sensitive URL parameters. Use relative artifact references and coarse network observations. Replace any raw trace or screenshot containing private data with a redacted copy or a textual summary. The runner saves fixed assertion labels, status, exception type on transport failure, and no HTTP bodies or headers.
- For operator evidence, use `python quality/connect/qa.py --schema <original-handoff-schema> dry-run --out <new-dir>` and the same `--schema` option before `validate`. The original schema is in the supplied handoff. The repository projection uses reserved example mailboxes. All other schema fields and constraints match the original. Keep the original schema, example and mailbox-bearing evidence in the private run package. Retain a clearly named redacted projection in the review patch.
- The supplied schema requires the canonical production target even for local runs. Use `environment` and `scope` to identify the actual execution environment. A dry-run commit identifies the source checkout base. For live evidence, keep deployment and commit null unless a request can be correlated with the upstream build. Record independently verified Hub and Connect alias metadata separately if request-level attribution is unknown.
- The latest pointer starts empty. Advance it only after the dated report and evidence have been merged and verified readable through the canonical repository path. Local packets and PRs are useful inputs for the next session and carry `local_only` or `pr_only` until publication is confirmed.
- If GitHub publishing is pending, generate a scoped `git diff --cached --binary` and verify it with `git apply --check` on the pinned main revision. If the package registry is unavailable, use an approved cache or CI and log dependency setup as blocked. If Chromium or the policy prevents live execution, preserve independent HTTP observations and move the guest run to a supported, credential-free browser environment with equivalent read-only enforcement. Record `not_run` for journeys never attempted.
- The PR-only workflow adds a small Python environment and uses loopback only for application requests. Existing Connect fixture suites retain their own CI job and browser download. No QA schedule or paid services are needed for Phase 1. Future staging, provider traffic and device access may incur usage costs and need separate verification.
