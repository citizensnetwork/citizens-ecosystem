# MASTER — programme charter and execution contract

## Mission and product fit

Citizens Connect is the map-first discovery and participation layer of the Citizens ecosystem: connect citizens to places, events, contributors and real community needs; make small and overlooked contributors visible; make movement from discovery to real participation intuitive. Read the canonical `apps/connect/VISION.md` every run. Assess mutual discovery, connection to real need, dignity for small contributors, welcoming and clear Kingdom identity, excellence, intuitive service and recovery from errors. Do not confuse desired features with shipped features.

## Scope and references

- Production: https://219.co.za/citizens/connect/
- Repository: https://github.com/citizensnetwork/citizens-ecosystem
- Canonical product vision: `apps/connect/VISION.md`
- Existing state guide: `apps/connect/RESUME_HERE.md` (dated snapshots may be stale)
- Existing scripts (observed 2026-11-23): `pnpm --filter citizens-connect test`, `test:e2e`, `test:e2e:base-path`, `build:mobile`, `cap:sync`, `cap:run:android`; inspect current scripts before executing.
- Mobile architecture previously observed: Capacitor 8 with bundled `mobile-dist` static frontend; no native execution evidence.
- Prior baseline: 2026-11-22 programme initial baseline and partial 2026-11-23 review; previous site fetch/browser tooling failure was **not** an outage finding.

## Responsibility boundaries

**ChatGPT weekly coordinator:** locate latest accessible run; check dated files and unresolved register; report status and storage gaps; generate a precise Work handoff. **Work operator:** inspect repository and live guest UI when browser works, run authorised tests, create reports, prepare PRs, and verify evidence. **Founder:** approve staging, secrets/provider configuration, production changes, merges, deployment and any real emails.

## Phase ordering and gates

0. Environment & source-of-truth inventory. Exit: confirmed access matrix, latest baseline, exact source/deployment, blockers and storage plan.
1. QA framework & reporting templates. Exit: reviewable PR or local bundle, scenario coverage map, reproducible commands and sample report validation.
2. Public functional, UX, visual and accessibility baseline. Exit: evidence-backed guest scenario outcomes, responsive coverage and design evaluation.
3. Isolated staging and authenticated workflows. Exit: verified isolation, QA roles, synthetic fixtures, cleanup and evidence of state-changing scenarios.
4. Android readiness. Exit: emulator and physical-device matrix, build provenance and Ready/Blocked/Unverified decision.
5. Recurring operating model. Exit: documented weekly runbook, report storage verification, optional CI job and verified email channel (or explicit pending blockers).

## Canonical scenario catalogue

| ID    | Journey                                   | Expected outcome                                                                            | Allowed environment                        |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| CC-01 | Open live base route and refresh          | App and assets load, controls usable                                                        | Production guest read-only                 |
| CC-02 | Explore Pretoria map, zoom, select marker | Marker/detail agree, map usable                                                             | Production guest read-only                 |
| CC-03 | Category/date filters and clear           | Map/calendar agree; reset works                                                             | Production guest read-only                 |
| CC-04 | Public search + nonsense phrase           | Result opens; empty state recovers                                                          | Production guest read-only                 |
| CC-05 | Open event/place and share URL            | Details coherent; shared URL reopens same item                                              | Production guest read-only (copy URL only) |
| CC-06 | Keyboard and narrow viewport              | Visible focus, reachable controls, recoverable panels                                       | Production guest read-only                 |
| CC-07 | Join/cancel/contributor draft             | Correct state and cleanup                                                                   | Isolated staging only                      |
| CC-08 | Capacitor Android native flows            | Launch, back, permissions, deep links, share, auth, offline/recovery, release notifications | Emulator + physical device                 |

## Reporting and classification

Every run must contain `schema_version`, `run_id`, `started_at`, `target_url`, `repository`, `commit_sha`, `deployment`, `environment`, `previous_run_id`, `scope`, `tests`, `findings`, `android_decision`, `storage`, `email_delivery`. Each test contains scenario ID, status, observed_at, environment, browser/device, fixture reference, steps, expected, actual and evidence references. Findings use stable IDs `CCQA-0001` etc, severity `critical|high|medium|low`, lifecycle `new|recurring|resolved`, user impact, evidence, code location only if verified, proposed fix, design guidance and acceptance checks. See `templates/evidence.schema.json` and `templates/REPORT_TEMPLATE.md`.

**Severity:** critical = confirmed app-wide outage/data loss; high = broken core journey; medium = degraded journey; low = minor friction. Do not assign severity to tooling blockers as if they were product defects.

**Android decision:** `Ready` only with evidenced release-candidate build, native emulator and physical device tests and no release blockers. `Blocked` only for a confirmed release blocker. Otherwise `Unverified`. Never infer readiness from presence of Capacitor dependencies.

## Evidence storage and review convention

Proposed repository layout:

```text
quality/connect/
  programme/             # master, phases, schemas, prompts
  state/latest.json       # pointer to last completed run and phase
  state/findings.json     # stable finding registry
  runs/YYYY-MM-DD/RUN-ID/
    report.md
    evidence.json
    NEXT_SESSION.md
    evidence/             # sanitized screenshots, logs, traces (only if policy permits)
  handoffs/               # developer briefs
```

A PR may contain run records, but the latest pointer must only advance once reports are merged and accessible. If there is no verified writable repository route, save downloadable files locally and report `storage.status=local_only` with a clear follow-up. A private Drive folder is an optional mirror, not a replacement source of truth. Never claim an upload succeeded without confirmation.

## Design review rubric

Score each 0–3 with evidence: (1) discovery and path to action, (2) small contributor visibility and fairness, (3) welcoming identity and language, (4) map-first clarity, (5) responsive panels/spacing, (6) visual hierarchy and typography, (7) white/black/gold balance and glass overlay restraint, (8) accessibility/keyboard/contrast, (9) feedback and recovery states, (10) cross-app coherence. 0=confirmed harmful; 1=weak; 2=adequate; 3=strong; null=unobserved. Do not score unobserved screens.

## Safety, trust and source integrity

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

## Minimum weekly report

Executive result; coverage matrix; confirmed findings; previous-run comparison; Android decision; screenshots/evidence references; storage outcome; email delivery status; top three priorities; next phase and a copy-paste Work prompt. No invented claims.
