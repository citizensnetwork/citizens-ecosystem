# Map Layering - Feature Clarity

> Status: answered; implementation in progress. The current code has zoom + prominence tiers; this document captures the richer founder direction for a more service-minded reveal model.

## Current Decisions

| Area | Decision |
|---|---|
| Far zoom | Explore city activity glow instead of individual icons. |
| First event reveal | Event markers should not all show from zoom 0-4. First dots begin around zoom 6/7. |
| Event dot layers | Dots should reveal gradually, with a maximum count per layer, using time proximity, duration, follow status, and prominence. |
| Places | Places start as black dots at zoom 10, remain clickable, and reveal fully around zoom 12. |
| Mid markers | No pictures in mid tier. Use category SVGs, with category-coloured SVG treatment. |
| Full markers | Full profile/logo/photo treatment can appear at closer zooms only. |
| Update bubbles | Instagram-style/speech-bubble update banners above markers are valuable from around zoom 12+. |
| Update bubble expiry | Status-style update bubbles should expire around 24 hours by default. |
| Labels | Name labels and update bubbles become useful at close zooms. |
| Personal relevance | Follow is first; time is second. Consider and friend activity are equal secondary signals. Contributor prominence is last. Followed, RSVP'd, or considered events can reveal earlier for that signed-in user without becoming visually overpowering. |
| Prominence | Prominent markers/events get a subtle gold pulse from beneath the icon. This pulse supersedes the optional Activity Pulse layer and does not reintroduce square halos around icons. |
| Contributor credit | Contributor names should be available on hover and click. |
| Nearby discovery | Nearby users are not pushed by default; map bubbles are the ambient discovery mechanism for passers-by. |

## Draft Reveal Model

| Zoom | Events | Places | Notes |
|---:|---|---|---|
| 0-5 | No individual event markers | No individual place markers | City activity glow / density signal only. |
| 6-7 | Up to 5 event dots | Hidden | Highest relevance: soon/live, followed, RSVP/considered, high prominence. |
| 8 | Full event markers only for live-and-followed events; other events stay dots | Hidden | Combined conditional: most relevant, but not status bubbles yet. |
| 9-10 | First event layer may become full category SVG; newer layers stay dots | Hidden | Avoid pictures; category readability first. |
| 10 | Event dots/icons continue | Place dots begin | Places enter as clickable black dots. |
| 11 | More event dots/icons; pictures only for soon-and-followed events | Place dots continue | Combined conditional; no broad photo wall. |
| 12 | Event full markers + update bubbles | Place full markers begin | Marker status/update bubbles start. |
| 13-14 | Labels/status bubbles richer | Labels/status bubbles richer | Close inspection mode. |
| 15+ | Maximum detail | Maximum detail | Photos allowed for selected/top items only. |

## Open Questions

1. Yes: use viewport grid-cell caps rather than one global cap.
2. Ranking priority: follow first; time second; consider and friend activity equal; prominence last.
3. Prominent markers get a gold pulse. They do not skip the zoom rules except for the explicit live-and-followed and soon-and-followed combined conditionals.
4. Followed/RSVP/considered events get priority noticeability, but still follow zoom rules.
5. City activity glow should encode active events, contributors, and today/this-week activity.
6. Update bubbles appear for unseen/recent updates with roughly 24-hour expiry.
7. Update bubbles use compact text snippets at close zooms, with simpler indicators available at lower close-zoom tiers if needed.
8. Place priority should account for place following and upcoming event activity, nudging active/involved places without making it preferential treatment.
9. Contributor name should show on hover and click.

## Implementation Notes From Recovery Session

- Map attention should answer: "What life is happening near me right now, and where can I belong or serve?"
- The map should help small contributors be noticed, so caps and ranking must not become a popularity-only filter.
- Update bubbles are public visual invitations, not private notifications.
- For every reveal rule ask: does it help citizens find their right spaces and help contributors be found by the people they can serve?
