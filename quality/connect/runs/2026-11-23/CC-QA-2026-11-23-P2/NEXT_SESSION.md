# NEXT_SESSION — Citizens Connect QA

Phase 2 ran on live read-only desktop and narrow Chromium. Review [report.md](report.md), [evidence.json](evidence.json) and [observations.json](observations.json). CCQA-0001 remains open, and CCQA-0002 is new. Public filter/calendar parity, full accessibility evaluation and exact Hub upstream deployment attribution remain open.

## Phase 3 start conditions

- Obtain the exact staging URL and hosting environment. Verify that it points to a separate backend project or independently isolated branch, with separate auth, database and storage. A preview can still use production credentials.
- Verify the synthetic Citizen and Contributor identities and approved fixture prefixes. Provision secrets through a protected staging secret store. Provide secret names and access scope to the operator.
- Verify that email, OTP, webhooks, push and user messaging are disabled or go only to test sinks. Agree on cleanup ownership, run identifiers and approved state-changing actions.
- Keep production read-only. Keep the latest pointer unchanged until approved evidence is merged and accessible.

## Copy-paste prompt

> Begin Phase 3 of Citizens Connect QA. Read apps/connect/VISION.md and the updated Phase 2 handoff. Verify staging isolation, synthetic roles, delivery sinks and cleanup before any state change. If staging is absent or connected to production, record CC-07 as blocked and stop ahead of mutations. In approved staging, run synthetic citizen join/cancel and contributor draft and verify cleanup. Save a dated report and original-schema evidence, preserve current finding IDs, and request separate authorization for publication.
