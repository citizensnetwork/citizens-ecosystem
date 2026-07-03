# Friends System — Feature Clarity

> **Status:** The `follows` table is bidirectional-follow (mutual = friend).
> The social graph exists at the DB level. The UX contract, privacy rules, and
> surface-level behaviours need clarity before further work.

---

## What exists right now

- `follows` table — `follower_id`, `followee_id`, `created_at`
- Bidirectional follow = friend (both users follow each other)
- `FollowButton` component — follow / unfollow a profile
- `isFriend` boolean passed down from profile queries
- "Friends" badge on contributor profiles when viewer is friends with the contributor
- `friends` list in BurgerMenu data (for "convince" feature)

---

## Questions

### 1. Follow vs. Friend — terminology
- Do you want one concept ("friends") or two ("follow" for one-way, "friend" for mutual)?
- Should users be able to follow a contributor/person without needing mutual approval?
- Or should there be a "friend request" flow where both sides must accept?

### 2. Follow request / pending state
- If follow is one-way (Twitter-style), no request needed.
- If mutual-required (Facebook-style), show a "pending" state on the button.
- Which model fits Citizens Connect better?

### 3. Who shows in the followers/following list?
- On a contributor profile, is the followers list public?
- On a Citizen profile, can other users see who they follow?
- Should there be a privacy setting ("friends only can see my followers list")?

### 4. Friend suggestions
- Should the platform suggest "people you may know" based on shared RSVPs, places, or mutual friends?
- Is this in scope now or later?

### 5. Friend feed / social activity
- Do friends' activity (RSVPs, new reviews, etc.) appear in a feed anywhere?
- Or is the friend relationship purely for the "convince" / "buddy-up" feature?

### 6. The "Convince" feature
- This lets a friend "nudge" another friend about an event they're considering.
- Is this feature locked to mutual friends only, or can any follower nudge?
- What does the nudge look like to the recipient?

### 7. Maximum connections
- Is there a cap on how many people a user can follow?
- Is there a cap on followers (relevant mainly for Contributors)?

### 8. Blocking
- If User A blocks User B, should B be automatically unfollowed/unfriended?
- Should a blocked user still see A's public events?

### 9. Contributor ↔ Citizen asymmetry
- Should a Contributor's "following" list be private (they follow places/topics, not individuals)?
- Should Citizens see which Contributors a Contributor "endorses" by following?

### 10. Notifications for follows
- When someone follows you, do you get a push notification?
- When the follow becomes mutual (friend), is there a separate notification?
- Can these be toggled in notification preferences?

### 11. "Find friends" / contacts import
- Is contacts-import (phonebook / Google contacts) in scope to help people find friends?
- Or is discovery purely through the app (events, places, profiles)?

### 12. Friends in event context
- On the event detail, should there be a "X of your friends are going" line?
- Should the attendee list highlight friends?

### 13. Profile privacy levels
- Should a Citizen's profile be publicly visible by default?
- Or only visible to followers / friends?
- Should Contributors always be public?

### 14. Unfriend vs. Unfollow
- If the relationship is mutual (friends), does unfollowing one side break the friendship?
- Should there be a distinct "remove friend" action, or is unfollow sufficient?

### 15. Mutual friends display
- On a profile that's not a direct friend, show "3 mutual friends"?
- Click to see who?

### 16. Admin visibility
- Can admins see the social graph for moderation purposes?
- Should there be a "report a profile" flow that severs the follow relationship?

---

## Decision log

*Fill in as answers are given.*

| Question | Decision | Date |
|----------|----------|------|
| | | |
