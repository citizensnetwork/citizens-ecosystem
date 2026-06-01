# Notifications System - Feature Clarity

> Status: product decisions updated 2026-06-01. Remaining open item: whether map update bubbles are dismissed per-user after viewing.

## Current Decisions

| Area | Decision |
|---|---|
| Default model | Keep in-app notifications as the dependable baseline. Push is reserved for user-relevant, timely, or operationally important events. |
| Digests | Digests are only for contributors and admins, and should be weekly analytics-style summaries rather than general citizen notification bundles. Citizens still receive in-app notifications where relevant. |
| Contributor weekly digest | Contributors receive weekly reports for their own events/places: RSVP/connect counts, cancellations, considers, consider-to-connect conversions, messages, comments, and similar citizen activity around their surfaces. |
| Admin weekly digest | Admins receive weekly platform/contributor activity: reports, applications, new entries, new users, total new events/places, total deleted events, and average attendance overall if these metrics can be produced from cheap/precomputed aggregates. |
| Considering users | Ship per-event opt-out first; add a global "do not notify me for considered events" preference later if usage shows it is needed. Considering users may receive in-app event-update notifications, but no push by default unless they opt in or the update is cancellation/material. |
| Material event changes | Push-worthy changes are date/time, location, cancellation, price, and volunteer openings. Title, description, and image changes are not material enough for push by default. |
| Contributor followers | Contributor followers receive contributor/event/place activity by default, but both sides need controls: contributors can choose notification frequency/mute for their own followers where appropriate, and followers can mute a contributor from the contributor profile. Event-level mute/frequency should also be available if wiring cost stays reasonable. |
| Contributor profile/status posts | Followers receive in-app bell notifications only. Otherwise these posts create silent map attention, not push. |
| Event broadcasts | Notify attending and considering RSVPs. Considering users need an opt-out path for event updates. |
| Place broadcasts | Notify place followers and contributor followers; no push by default unless the specific trigger requires it. |
| Event changed/cancelled | Notify RSVPs, considering users, and followers. Push for material changes and cancellations. |
| Direct messages | In-app notification, push notification, and badge, unless muted at conversation/source level. |
| Admin/contributor operational messages | Send to Contributor Inbox as a message/card and show as a dashboard update banner. |
| Nearby interested users | Do not send intrusive notifications by default. Use map-surface attention instead, such as update/status bubbles above markers. |
| Map update bubbles | Public, close-zoom attention surface for any passer-by user; status-style expiry around 24 hours. Bubbles may dismiss per user after that user has seen them to reduce clutter. |
| Broadcast reactions | Broadcast cards in event view should support anonymous reactions. Use five fixed emoji options with visible counts beneath the lower edge of the broadcast card; store reaction counts without exposing reacting user identities in the UI. |
| Citizen/contributor service test | For every notification path ask: does this help citizens reach their right spaces and help contributors serve their people better without adding noise? |

## Notification Matrix

| Trigger | Recipients | In-App Bell | Push | Badge | Dashboard/Inbox | Map Bubble | Weekly Digest |
|---|---|---:|---:|---:|---:|---:|---:|
| Event broadcast | Attending + considering | Yes | Yes for attending; considering only if opted in/material | No | Event update feed | Yes, z12+ | Contributor analytics |
| Place broadcast | Place followers + contributor followers | Yes | No by default | No | Place update feed | Yes, z12+ | Contributor analytics |
| Contributor profile/status post | Contributor followers | Yes | No | No | Contributor profile feed | Silent map attention | No |
| New event by followed contributor | Contributor followers | Yes | Yes | Yes | Contributor profile feed | Event dot/prominence | Contributor analytics |
| New place by followed contributor | Contributor followers | Yes | No | No | Contributor profile feed | Place dot/prominence | Contributor analytics |
| Event details changed | Attending + considering + followers | Yes | Yes if material | No | Event update feed | Yes | Contributor analytics |
| Event cancelled | Attending + considering + followers | Yes | Yes | Yes | Event update feed | Yes | Contributor analytics |
| DM received | Conversation participants | Yes | Yes | Yes | Messages panel/inbox | No | Contributor analytics count only |
| Volunteer application | Contributor team | Yes | Yes | Yes | Contributor inbox | No | Contributor + admin digest |
| Admin change on contributor dashboard | Contributor owner/team | Yes | Yes | Yes | Dashboard banner + inbox | No | Contributor + admin digest |
| Report/suggestion response | Submitter/admins/relevant contributor team | Yes | Yes | Yes | Admin inbox where relevant | No | Admin digest |
| New contributor activity/platform totals | Admins | No instant by default | No instant by default | Admin inbox count if surfaced | Admin dashboard | No | Admin digest |
| Moderation/security/admin-critical item | Admins | Yes | Yes | Yes | Admin inbox/dashboard | No | Admin digest |

## What "Digest" Means

A digest is a bundled weekly analytics update, not a replacement for urgent notifications. It should summarize patterns and counts that help contributors and admins act, while urgent notifications such as cancellations, direct messages, volunteer applications, reports, and admin changes can still send instant push/badge notifications.

Digest generation should prefer already-aggregated analytics tables or cheap daily rollups. Expensive metrics such as average attendance overall should be included only if they can be computed without slowing user-facing app paths.

## Preference Model

- User-level: global push/on-off and broad notification categories.
- Contributor profile level: follower can mute or reduce notifications from a contributor.
- Contributor-side controls: contributor can decide whether follower-facing updates should notify all followers or stay map/feed-only where the surface allows.
- Event level: follower/RSVP/considering user can mute or reduce notifications for a specific event.
- Conversation level: existing message mute suppresses push for that thread.

## Closed Questions From 2026-06-01

1. Map update bubbles should expire after roughly 24 hours by default and can dismiss per user after viewing.
2. Followers may mute a contributor while still receiving notifications for specific events they care about.
3. Nearby discovery remains map-only unless the user follows, RSVPs, or considers.
4. Admins should receive push for moderation/security items; if it becomes too noisy, tune it later.

## Implementation Notes From Recovery Session

- Event broadcasts: attending users get in-app + push; considering users get in-app/bell/feed/map attention, but not push by default.
- Cancellations and clearly material changes can still push to considering users if the user has explicitly opted in for that event.
- Nearby discovery should feel like noticing life on the map, not being interrupted by the app.
- Contributor/admin digests should be weekly analytics summaries, not five-times-daily notification batches.
- Anonymous broadcast reactions should be aggregated counts only in the UI; avoid turning reactions into identity-bearing social pressure.
- The contributor/citizen quality question for each trigger: does this get the right person to the right need, event, organisation, or relationship with minimum noise?
