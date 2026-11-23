# Phase 1 — Durable QA framework and reporting

**Start condition:** Phase 0 exit criteria complete, or explicit exception recorded. For Phase 0, no prerequisite.

## Objective

Establish evidence, not assumptions, for this phase; produce durable outputs for the next stateless Work session.

## Work instructions

1. Read Phase 0 deliverables and reconcile blockers. Inspect existing Vitest, Playwright, CI and test fixtures before adding anything; prefer reuse.
2. Prepare `quality/connect/programme` docs and schemas, `state/findings.json`, `state/latest.json` and a reproducible runner that separates read-only public tests from staging mutation tests.
3. Add schema validation, status separation, artifact naming, evidence redaction, run metadata, commit/deployment provenance and failure-safe reporting. Never mark a test passed merely because its command exited successfully without executing assertions.
4. Configure optional CI for safe deterministic tests on PR; schedule only after reliable environment and secrets handling. Explicitly guard against production writes.
5. Validate using synthetic example report and run a dry-run in an isolated environment. Produce a PR, not a direct main change; leave merge to founder.
6. Document exact commands, required environment variables by **name only**, cost considerations, retention, and recovery when tools are unavailable.

## Required deliverables

- Dated `report.md` with summary, scope, verified outcomes, blockers, risks, user impact, proposed fixes, design guidance and acceptance checks.
- `evidence.json` validated against the provided schema; unknown values `null`.
- `NEXT_SESSION.md`: exact next phase, open blockers, links, what changed, what to avoid, and copy-paste prompt.
- Screenshots/logs/fixtures or PR link **only if actually created**; storage status explicit.

## Exit criteria

A reviewable PR or downloadable patch exists; JSON schema validates; dry-run evidence recorded; CI/test runner avoids production writes; user can reproduce results; report storage path and update policy documented.

## Mandatory operating rules

## Mandatory operating rules

- Production URL: `https://219.co.za/citizens/connect/`; repository: `https://github.com/citizensnetwork/citizens-ecosystem`, Connect path `apps/connect/`.
- Before acting, read `apps/connect/VISION.md`, `apps/connect/RESUME_HERE.md` (recognise that it may be stale), repository `CLAUDE.md`/`AGENTS.md` and this package's `MASTER.md`. The vision is a decision criterion, not evidence that features are implemented.
- Production is **read-only**. No account creation, mutations, synthetic event publication, form submissions that write, notification dispatch, intrusive security probing, deployment or configuration changes in production.
- No vulnerability exploitation, penetration testing, vulnerability reproduction or intrusion. Only authorised functional QA.
- Use isolated staging and clearly marked synthetic data for state-changing tests, after verifying environment isolation, account roles, credential handling and cleanup procedures.
- Never print or commit secrets or personal data. Never invent screenshots, browser observations, test results, commit SHAs, provider acceptance, deployment IDs or Android device evidence.
- Statuses are exactly `pass`, `fail`, `blocked`, `not_run`. `blocked` means attempted but prevented by a specific prerequisite/tooling problem; `not_run` means not attempted. Tool failure does not prove site failure.
- Do not send email except through the verified and authorised sender and recipient specified in the operator’s private handoff. If verification is absent, mark delivery `pending`, and never substitute a Gmail From address.
- Follow repository PR process. Never push directly to main, merge, apply migrations or deploy without explicit approval. Documentation or test-infrastructure changes must be reviewable.
- Each Work session must produce a dated report, machine-readable evidence, `NEXT_SESSION.md` and a clear storage outcome. If GitHub write access or approval is missing, produce downloadable artifacts and mark repository storage `pending`.

## Copy-paste prompt

Open a new ChatGPT Work session. Attach `MASTER.md`, this phase file and the latest `NEXT_SESSION.md`/report if available. Say:

> Execute Citizens Connect QA **Phase 1: Durable QA framework and reporting** according to the attached documents. Start by verifying prerequisites and reading `apps/connect/VISION.md`. Work autonomously within the stated read-only production and isolated staging boundaries. Do the work rather than merely proposing it. Produce a dated Markdown report, validated JSON evidence and NEXT_SESSION.md; use a reviewable PR for repository changes and state the exact storage outcome. Do not claim tests, email delivery or device execution unless verified. Stop and explain blockers rather than bypassing safety rules.
