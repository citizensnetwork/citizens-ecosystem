# Phase 2 — Public guest journeys, visual UX and accessibility

**Start condition:** Phase 1 exit criteria complete, or explicit exception recorded. For Phase 0, no prerequisite.

## Objective

Establish evidence, not assumptions, for this phase; produce durable outputs for the next stateless Work session.

## Work instructions

1. Review Phase 0/1 reports and verify current production route; use a browser-capable Work session when available.
2. Execute CC-01 to CC-06 on desktop and narrow mobile viewport. Capture screenshots, URLs, viewport sizes, time, expected/actual, visible error messages and sanitized console/network observations when accessible.
3. Check public discovery to action: find small and large contributors, select a place/event, understand how to attend or participate, recover from empty filters and errors. Do not click controls that commit writes or contact people.
4. Review design rubric against canonical VISION.md; assess typography, whitespace, floating panels, map legibility, filter/calendar coherence, keyboard focus, touch target reachability, accessibility, and cross-app links without inventing scores.
5. Distinguish confirmed application defect from test-environment blocker; record exact reproduction and user impact.
6. Compare latest merged run, update stable finding IDs, propose acceptance tests and developer handoff. Do not deploy fixes.

## Required deliverables

- Dated `report.md` with summary, scope, verified outcomes, blockers, risks, user impact, proposed fixes, design guidance and acceptance checks.
- `evidence.json` validated against the provided schema; unknown values `null`.
- `NEXT_SESSION.md`: exact next phase, open blockers, links, what changed, what to avoid, and copy-paste prompt.
- Screenshots/logs/fixtures or PR link **only if actually created**; storage status explicit.

## Exit criteria

CC-01–06 each pass/fail/blocked/not_run with evidence; desktop and mobile coverage documented; design rubric grounded; defects have reproduction, impact and acceptance criteria; no writes.

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

> Execute Citizens Connect QA **Phase 2: Public guest journeys, visual UX and accessibility** according to the attached documents. Start by verifying prerequisites and reading `apps/connect/VISION.md`. Work autonomously within the stated read-only production and isolated staging boundaries. Do the work rather than merely proposing it. Produce a dated Markdown report, validated JSON evidence and NEXT_SESSION.md; use a reviewable PR for repository changes and state the exact storage outcome. Do not claim tests, email delivery or device execution unless verified. Stop and explain blockers rather than bypassing safety rules.
