# Messaging System — Feature Clarity

> **Status:** MessageButton removed from ContributorPublicProfile until design is finalised.
> Work through all questions below before re-implementing.

---

## What exists right now

- `conversations` table — DM threads between two users
- `conversation_participants` — many-to-many user ↔ conversation
- `messages` table — up to 2 000 chars, sender FK, created_at
- `GET/POST /api/conversations` — list + create
- `GET/POST /api/conversations/[id]/messages` — fetch + send
- `PATCH /api/conversations/[id]/read` — mark read
- `ConversationList`, `ChatView` components (under `/messages`)
- `MessageButton` component — was on contributor profiles (removed pending clarity)

The transport works. What's unclear is **product scope** — who can message whom and under what
conditions, what the UX contract is, and how it integrates with notifications.

---

## Questions

### 1. Who can send a message to whom?
- Can any Citizen message any Contributor freely?
- Can Contributors message Citizens they haven't met yet (cold outreach)?
- Are there privacy tiers — e.g., "followers only can message me"?
- Can a Citizen message another Citizen?

### 2. Message request vs. direct delivery
- If a user hasn't followed/interacted with the sender, should the message
  land in a separate "Requests" inbox instead of the main inbox?
- Should the recipient be able to accept/decline message requests?

### 3. Where does the Message CTA live?
- Contributor public profile ✅ (removed pending this)
- Event detail page (message the organiser)?
- Place detail page (message the owner)?
- Any other surfaces?

### 4. Message content types
- Text only (current)?
- Image attachments?
- Event / place cards shared inline?
- Reactions / emoji?

### 5. Group messaging
- Is group messaging in scope at all?
- If yes — who can create a group? Can Contributors create broadcast channels?
- Max group size?

### 6. Read receipts
- Should senders see when a message was read?
- Should this be opt-out for privacy?

### 7. Notifications
- How should in-app and push notifications work for new messages?
- Should there be a "mute conversation" option?
- Digest or real-time only?

### 8. Message retention & deletion
- Can a sender delete a sent message (and does it disappear for both parties)?
- Is there a message history limit (e.g., 90 days)?
- What happens to the conversation thread when a user's account is deleted?

### 9. Blocked users
- If User A blocks User B, do existing conversation threads disappear?
- Can a blocked user still see old messages they already received?

### 10. Contributor broadcast / announcements
- Should Contributors be able to send a one-way broadcast to all their followers?
- Is this a separate "Announcements" feature or part of messaging?

### 11. Spam / moderation
- What's the rate limit per user per hour for sending messages?
- Is there keyword filtering or flagging for inappropriate content?
- Can conversations be reported?

### 12. Conversation list UX
- Where does `/messages` live in the main nav (currently not in the Navbar)?
- Should the unread badge appear in the Navbar next to the notification bell?
- How many conversations show in the list before pagination/infinite scroll?

### 13. Typing indicators & presence
- Should the chat show "typing…"?
- Should it show "online" / "last seen"?

### 14. Deep-link behaviour
- When a notification routes the user to a message, does it open `/messages/[id]`
  full-page or in a side panel?
- On the events page, does the conversation open in the SidePanel or navigate away?

### 15. API rate-limiting
- Current limit: unset. What should the limit be for message sends?
- Should it differ for Citizens vs. Contributors?

---

## Decision log

*Fill in as answers are given.*

| Question | Decision | Date |
|----------|----------|------|
| | | |
