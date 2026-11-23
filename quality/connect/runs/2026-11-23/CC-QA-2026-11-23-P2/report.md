# Citizens Connect QA — 23 November 2026

Phase 2 public guest journeys, visual UX and accessibility · CC-QA-2026-11-23-P2 · SAST

CCQA-0001 did not reproduce in successful fresh desktop and narrow runs. Keep it open because the original intermittent failure remains unexplained. CCQA-0002 captures missing visible no-match feedback in the collapsed guest map.

## Handoff verification

- Read the repository vision and attached programme, Phase 1 report, handoff and finding register. The standalone original Phase 0 packet was absent from this ZIP. The Phase 1 carry-forward and the earlier Work Phase 0 report were available. They describe separate observations, so a healthy Work smoke alone does not invalidate the earlier blank-screen report.
- A fresh checkout and GitHub both reported `ff8e3770d2a3931fa471de53c6b668200b7326d1`. The attached patch applied cleanly to that checkout and all five Node request-policy tests passed. Ajv Draft 2020-12 with format validation accepted the original example and full Phase 1 evidence. The public projection validated against the repository schema and matched the private evidence outside delivery metadata. Other historical Phase 1 CI and dry-run counts were not rerun in this session.
- Phase 1 is reliable as evidence of a local framework and synthetic rehearsal. Its browser startup failure belongs to that run. Phase 2 was able to launch headless Edge Chromium. The framework is absent on main. The existing weekly QA PR has a provisional scenario mapping and cannot substitute for this catalogue.
- Vercel reported both the Hub and Connect production aliases READY. The Hub alias used `e8af517a5d59cb8e4bb7f7c26be6522f392b670a` and the Connect alias matched main. Both canonical routes returned the same bundle identifier, `app/bundle.152e20e593.js`. The Hub request’s exact upstream deployment ID remains unknown.

## Coverage

| Scenario | Viewport | Outcome | Evidence |
| --- | --- | --- | --- |
| CC-01 | desktop 1280×900 CSS px | pass | HTTP 200. Visible and enabled after selection: Map 186 ms, Search 188 ms, Explore 189 ms. No blank surface. One routine refresh preserved Discover. |
| CC-02 | desktop 1280×900 CSS px | pass | Synthetic Pretoria location, zoom, and the named place preview all verified. |
| CC-03 | desktop 1280×900 CSS px | blocked | Category toggled and reset. This weekend displayed a filter chip and reset cleared it. A separate calendar surface was not identified for parity. |
| CC-04 | desktop 1280×900 CSS px | fail | Matching pin opened its preview. The nonsense query removed the pin without a visible no-match message in the inspected map state. Clear search removed the query and restored the pin. See CCQA-0002. |
| CC-05 | desktop 1280×900 CSS px | pass | Full event opened. The app copied a Connect event URL and the same event reopened with HTTP 200. Native share was disabled in the harness to use the app's clipboard fallback. |
| CC-06 | desktop 1280×900 CSS px | pass | Sampled keyboard traversal and Search panel recovery were observed. No page overflow. At narrow width the idle map shows a crown ahead of persistent Map and Explore labels. Contrast and assistive technology conformance remain untested. |
| CC-01 | narrow 390×844 CSS px | pass | HTTP 200. Visible and enabled after selection: Map 158 ms, Search 158 ms, Explore 159 ms. No blank surface. One routine refresh preserved Discover. |
| CC-02 | narrow 390×844 CSS px | pass | Synthetic Pretoria location, zoom, and the named place preview all verified. |
| CC-03 | narrow 390×844 CSS px | blocked | Category toggled and reset. The scripted Explore transition timed out before the weekend/date check. Calendar parity remains unverified. |
| CC-04 | narrow 390×844 CSS px | fail | Matching pin opened its preview. The nonsense query removed the pin without a visible no-match message in the inspected map state. Clear search removed the query and restored the pin. See CCQA-0002. |
| CC-05 | narrow 390×844 CSS px | pass | Full event opened. The app copied a Connect event URL and the same event reopened with HTTP 200. Native share was disabled in the harness to use the app's clipboard fallback. |
| CC-06 | narrow 390×844 CSS px | pass | Sampled keyboard traversal and Search panel recovery were observed. No page overflow. At narrow width the idle map shows a crown ahead of persistent Map and Explore labels. Contrast and assistive technology conformance remain untested. |

CC-07 and CC-08 were not run. Email remains pending. The first probe also reached all three guest controls before refresh at 1280×900 and 412×839. A separate 390×844 probe timed out waiting for the guest button, then reached the guest map on later navigation. It did not confirm an empty screen. Timings measure visible and enabled controls in the runner. They do not represent end-user latency.

The guard forwarded only permitted GET/HEAD requests and stripped credentials. It blocked service workers, WebSockets, auth/backend requests and other unapproved traffic. The initial pinned-build asset test blocked a Tailwind 302 and showed incomplete visual styling. The styled pass allowed only the verified redirect from the CDN root to the same CDN’s exact `/3.4.17` asset. All other redirects stayed blocked. Secondary production-host and CDN denials can affect images, icon and optional integrations, so this run does not attribute missing optional assets to the app.

## Design rubric

Scores use 0 harmful, 1 weak, 2 adequate, 3 strong, and null unobserved. Based on the [desktop](evidence/desktop-settled-map.png) and [narrow](evidence/narrow-settled-map.png) screenshots and [structured observations](observations.json). Screenshots mask inputs and detail content.

| Dimension | Desktop | Narrow | Observed evidence |
| --- | --- | --- | --- |
| Discovery and path to action | 2 | 1 | Desktop labels Map and Explore alongside Search. At narrow idle width, Search and the crown are visually prominent and Explore is less explicit. Event detail and the share path were reached. Attendance instructions were not evaluated. |
| Small contributor visibility and fairness | 2 | null | Desktop Explore surfaced a youth collective alongside other contributors. Organisational size and ranking fairness were not established. Narrow small-contributor coverage was incomplete. |
| Identity and language | 2 | 2 | Guest entry offers Browse as Guest. Map categories connect faith and activity, and the crown carries the brand. |
| Map-first clarity | 2 | 2 | Basemap labels, gold marker and zoom hint rendered. With no guest location the observed map centred near Durban. Synthetic Pretoria geolocation worked. |
| Responsive panels and spacing | 2 | 2 | No page-width overflow and the Search panel recovered. Mobile keeps the map visible while compressing nav into the crown. |
| Hierarchy and typography | 2 | 2 | Map and Search stand out. Desktop category labels and narrow zoom guidance remain legible in the captures. |
| White, black, gold and glass restraint | 2 | 2 | Neutral surfaces and dark labels preserve the map, with gold highlighting the marker and Search. Formal contrast was not measured. |
| Accessibility and keyboard | 2 | 1 | Keyboard sampled Search and map controls. Narrow nav has fewer persistent visible labels. VoiceOver/TalkBack, contrast conformance and physical touch execution remain untested. |
| Feedback and recovery | 1 | 1 | Clear search and panel close worked. The collapsed map gave no visible no-match cue in the two targeted searches. |
| Cross-app coherence | null | null | Cross-app navigation was outside the guarded run. |

## Developer handoff

- **CCQA-0001 · high · open.** Reproduce the original first-entry blank without refreshing, then record loading, error and recovery behavior across fresh desktop and narrow contexts. Guests could otherwise lose the path to events, places and contributors. The acceptance criteria in the findings register require first-click access, refresh persistence and actionable stalled-load feedback. No root cause is confirmed.
- **CCQA-0002 · medium · new.** Open Search with the map panel collapsed, enter a nonsense phrase, observe that the known pin disappears, and use Clear search to recover. Add a visible and announced no-results status beside Search while keeping the context and reset control. Accept after verifying the empty, loading and populated states at both viewport widths. [Desktop](evidence/desktop-zero-results.png) · [Narrow](evidence/narrow-zero-results.png)
- Review whether the narrow crown should expose an obvious Explore label or first-use affordance. Recheck calendar parity and narrow weekend reset with a verified calendar path.

## Storage and progression

Local report, original-schema evidence, updated register and next-session handoff. The review patch includes a repository-schema projection. Latest-run pointer remains unchanged. No draft PR was opened for this packet.

Phase 3 can begin with staging verification and synthetic fixture planning. Authenticated execution remains blocked until the exact target, independent backend, staging roles, outbound sinks and cleanup are verified. Android remains Unverified.
