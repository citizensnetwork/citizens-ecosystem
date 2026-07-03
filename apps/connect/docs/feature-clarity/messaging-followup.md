# Messaging Follow-Up - Feature Clarity

> Status: active questioning. The transport exists, but the intended surface behavior needs one more clarity pass.

## Current Decisions

| Area | Decision |
|---|---|
| DM delivery | In-app notification, push notification, and unread badge. |
| Admin/contributor operational messages | Contributor Inbox message plus dashboard update banner. |
| Citizen-to-contributor | Citizens can message event/place/contributor owners from detail surfaces. |
| Contributor-to-citizen | Allowed when the citizen has interacted, such as RSVP/follow/place follow. Starts as a request where appropriate. |
| Citizen-to-citizen | Allowed, especially from discoverable attendee/profile surfaces. |
| Default message surface | Message buttons should open the floating messages panel with the conversation selected. |
| Deep links | Full `/messages` and `/messages/[id]` pages remain as fallback/deep-link surfaces for direct loads. |
| Contributor inbox | Evolve toward one unified dashboard inbox with filters for DMs, volunteer applications, admin/system cards, comments, and reviews. |

## Why Click Paths Need Diagnosis

The app currently has more than one messaging surface: a floating navbar `MessagesPanel`, full `/messages` pages, and intercepted right-side panel routes. A "message button says messages do not exist" bug may be caused by which surface the click came from, whether an intercepted panel was already open, or whether conversation membership/creation failed.

## Click Paths To Verify

1. Event detail -> organiser message icon -> conversation opens.
2. Place detail -> owner message icon -> conversation opens.
3. Contributor public profile -> message icon -> conversation opens.
4. Discoverable attendee chip -> citizen profile/message icon -> conversation opens.
5. Navbar message icon -> floating panel opens.
6. Conversation row -> inline chat opens in floating panel.
7. Existing side panel open -> message icon -> expected surface opens without "not found".
8. Direct `/messages/[id]` URL -> full page works for participants and rejects non-participants.

## Open Questions

1. Every message button should open the floating messages panel, even from inside right-side detail panels.
2. Message buttons inside a right-side panel should not open the chat as the next right-side panel by default; that was the collision risk.
3. The full `/messages` page remains as a fallback/deep-link surface for direct loads.
4. Contributor inbox should combine DMs, volunteer applications, admin operational messages, comments, and reviews in one unified dashboard inbox with filters.
5. Should admin operational messages be actual DM conversations, system inbox cards, or both?
6. Should contributors be able to message all followers directly, or only users who have interacted with a specific event/place?

## Implementation Notes From Recovery Session

- Fix direction: `MessageButton` creates/retrieves the conversation, then asks the global floating panel to open that thread instead of pushing straight to `/messages/[id]`.
- Direct `/messages/[id]` must still work for copied links, browser refresh, and cases where the floating panel is unavailable.
- The user-facing service test: messaging should reduce friction between citizens and contributors without surprising users with intrusive or privileged access.
