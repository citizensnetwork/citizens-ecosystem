# Citizens Connect QA — 2026-11-28

Partial source and evidence review; not a full execution. Revision latest returned by commit search: e54d32df7bc2b4caa05ad10d902244313c467bc4 (26 Nov, #403); default main confirmed; Vercel combined statuses success for four apps, not a functional test. Vision read. No production writes, exploit tests or deployments requested.

## Prior evidence
25 Nov fix plan docs/audit/cc-qa-2026-11-25-fix-plan.md reports 2 pass, 4 fail, 2 blocked. Full original report not retrieved; latest.json returned 404. #387 contains weekly QA framework and historical hosted rehearsal; do not duplicate or assume merged. #393 location, #394 keyboard, #396 city/empty, #397 dates, #395 hierarchy, #398–401 boot/CSP, #402 Android are existing remediation tracks; retest, do not reopen as new defects. #402 reports 511 root and 34 base-path passes historically, not current-run results. Release signing and assetlinks plus device checks remain unverified. #403 replaces Discover with Explore overlay, snapshot blur, shared dock and edge gestures; source/commit description only, no visual confirmation.

## Coverage
CC-01–06 blocked (no interactive browser evidence); CC-07–08 not_run (staging/device unverified). No scenario passes or failures this run. Phase 0 partial (repo access and vision); Phase 1 historical framework #387; Phase 2 blocked; Phase 3/4 not_run; Phase 5 partial (this review package). Security, performance, accessibility, functional suites not executed. No outage inferred. Android Unverified. Email pending; authorized delivery not verified. Prototype source snippets retrieved, not executed. Existing PR search is partial deduplication, not exhaustive issue registry.

## Implementation cards (proposals only)
### INNOV-01: Explore regression and gesture arbitration
Priority P1; effort M. User value: Reliable spacious discovery. Evidence: PR #403; snapshot backdrop and edge swipe. Acceptance: Verify 320/390/768/1440 widths, single dock, focus restoration, no map movement during Explore, 20 swipe trials each direction with no accidental navigation during vertical scroll; compare p95 frame time and cold entry against baseline; preserve 3–80% veil, floating rows and gold restraint. Dependencies: #403, #394, #396, #397.

### INNOV-02: Optional precision controller and quick zoom
Priority P2; effort M. User value: One-handed map access. Evidence: Library prototype static code: 112px/68px, 85ms lock, pointer capture; alternate pill buttons only faded, not disabled in visible source. Acceptance: Prototype behind opt-in; 10px dead zone, neutral hold no action, tap center recenter, lock until release/cancel, disable alternate controls, capped progressive pan/zoom outside bounds, spring return pill, +/- and keyboard alternatives, handedness; 20 trials per mode per hand on Android/iOS, zero stuck gestures, target >=95% intended mode, optional single haptic on lock; compare standard controls. Dependencies: INNOV-01; physical devices; existing map gesture ownership.

### INNOV-03: Contextual discovery cards
Priority P2; effort M. User value: Relevant discovery without attention capture. Evidence: Existing news/nearby #275 and feed #351; extend rather than duplicate. Acceptance: One card at a time, Explore max 2 per 10 min, map max 1 per 10 min, no cards during gestures/forms/modal or within 5s after; map card <=8% viewport and no control/pin overlap; dismiss/snooze, preferences, quiet hours, reduced motion, keyboard and polite announcements; measure interruptions per completed task and target no >5% task-time regression. Dependencies: INNOV-01; existing feed and nearby ranking.

### INNOV-04: Imminent event relevance
Priority P2; effort M. User value: Timely feasible participation. Evidence: Proposal only; event dates #397 and location truth #393. Acceptance: Opt-in location or selected city; verified start time and venue, 5–30 min window only if plausible travel, expire at start or cancellation, no countdown pressure; no repeat after dismissal, no background location; synthetic timezone and stale-data tests; distinguish informational, devotional, discovery and time-sensitive cards. Dependencies: INNOV-03; date/location retest.

### INNOV-05: Tenant style guide with live preview
Priority P3; effort L. User value: Tenant flexibility without fragmentation. Evidence: Composition plan #390 already covers fixed catalogue; extend its scope rather than create a parallel builder. Acceptance: Responsive preview 320/390/768/1440, scoped tokens for surfaces/type/spacing/accent, contrast validation, reset/undo, no cross-tenant changes, preserve navigation and accessible defaults; preview only until authorized save in isolated tenant. Dependencies: #390 composition C4; tenant authorization and staging.

## Design guidance
Prefer a single quiet contextual slot, not a new feed or overlay stack. Informational updates factual and dismissible; devotional scripture opt-in and never urgent; discovery based on explicit interests and fair contributor exposure; time-sensitive events only with verified relevance and expiry. Preserve map attribution, focus, safe areas and active gestures. Measure meaningful participation rather than impressions. Proposed thresholds are experiments, not measured results.
