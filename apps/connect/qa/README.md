# Citizens Connect weekly QA

Read [VISION.md](../VISION.md) before reviewing the results. This programme checks whether guests can discover Contributors, places, events and community needs, then uses isolated fixtures for repeatable regression coverage.

## Phase 0 baseline

On 23 November 2026, a read-only HEAD request to the public URL followed a 308 redirect to the canonical Connect entry and returned HTTP 200. That establishes HTTP availability for the request. The previous report summary from the Create Test Scenarios chat records six blocked public checks and no staging or Android execution. The original dated evidence and the Library programme were unavailable to this implementation session. The automation uses a provisional catalogue until its scenario mapping can be reconciled with the Library.

## Weekly execution

The workflow is designed to run every Monday at 07:23 South Africa time after it is merged into the default branch and GitHub Actions is enabled. It runs on a GitHub-hosted runner with no dependency on an open Work session. GitHub may delay a scheduled run. Review the Actions run history for missed weeks. The PR trigger tests report generation and runs the existing hermetic Connect Playwright and Vitest suites. A manual default-branch dispatch rehearses the live smoke path with email disabled.

Production smoke uses fresh anonymous Chromium contexts with GET/HEAD requests, service workers disabled and WebSockets closed. It checks the front door, public Discover, map and Community routes, and mobile viewport overflow. Browser and runner failures are recorded as blocked. HTTP availability can be checked independently with a HEAD request. Review listings, keyboard operation, visual consistency and authentic user goals in an exploratory session. Hermetic suites use synthetic fixtures.

The report keeps pass, fail, blocked and not_run distinct. Each run uploads Markdown, keyed by date and run attempt, and schema-versioned JSON. The previous retained scheduled run supplies a baseline for the same catalogue version. A transition from pass to fail is a regression. A pass becoming blocked or not_run is lost coverage. Retention is requested for 90 days and subject to repository policy. Archive the artifacts separately if longer retention is required.

## Staging and Android gates

Staging authenticated scenarios remain not_run until a separate staging origin, isolated database and authorized synthetic Citizen and Contributor identities are established. Verify isolation before provisioning identities. Keep outbound email and messaging confined to test sinks. Record evidence of role-based sign-in, settings, listings, participation and cleanup before marking the scenario passed.

Android stays unverified until the same release-candidate revision has evidence for each gate.

- Build and sync the bundled Capacitor assets and produce the release-candidate Android build using the [mobile launch runbook](../docs/MOBILE_LAUNCH_RUNBOOK.md).
- Install that build on an emulator or device. Check cold start, offline and reconnect behavior, back navigation, guest discovery, sign-in and deep-link return with isolated identities, geolocation permission decisions and sharing.
- Record results for release signing, current store requirements and review prerequisites. Tie the evidence to the build revision and device configuration. A confirmed critical failure blocks the candidate. Approve readiness only when the build, device and release gates pass.

## Resend activation

Delivery remains pending until a repository administrator confirms that the exact From address is approved, the Resend domain `citizenscentral.co.za` is verified for sending, and the sending channel is authorized for the weekly QA report. Verify these in Resend before configuring GitHub. Use a domain-scoped sending key in the `connect-qa-reporting` GitHub environment as secret `CONNECT_QA_RESEND_KEY`. Restrict the environment to the default branch. Set environment variable `CONNECT_QA_RESEND_VERIFIED_DOMAIN` to the verified domain as the administrator's attestation. Set repository variable `CONNECT_QA_RESEND_AUTHORIZED` to `true` only after those checks.

Delivery only runs on the scheduled default-branch first attempt. It uses a run-keyed Resend idempotency header and uploads a separate receipt. Provider acceptance confirms submission for processing. Check the receipt or the Actions summary for provider status. A missing receipt leaves delivery pending. If the response is ambiguous, check Resend before any retry. A rerun or manual dispatch creates no report email.

## Local verification

From the repository root, run `node --test apps/connect/qa/report.test.mjs`. With workspace dependencies and Chromium installed, the PR and manual rehearsal exercise the same runner commands as weekly execution. The repository's lint, typecheck, test and build checks still apply before merge.
