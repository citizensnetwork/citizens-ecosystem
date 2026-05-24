# Contributor Dashboard — Planning Doc v2

> Created 2026-05-23. Updated with user answers 2026-05-24 (v2). Extended Q&A round added below.
> Companion: `docs/plans/edit-fixes-batch.md`.

---

## North Star (paraphrased from user request)

A full management surface for contributors (ministry / organization / business) to operate **all assets they own**: places, events, media, comments, tags, reviews, history. Edit-place / edit-event flows should link into this dashboard instead of being one-off forms.

Plain users: only see "suggest edit" affordances or nothing — never the edit surface.

Owners + admins: full edit + create + delete + analytics-lite.

---

## Current state (snapshot)

- `/contributor/apply` — application form (citizen → contributor request)
- `/contributor/setup` — onboarding after approval
- `/profile/[id]` — public profile (read-only)
- `/profile/[id]/edit` — exists for self-edit (interests + basic profile)
- `/admin` — admin-only inbox + tools
- `/dashboard` — exists but minimal (verify before assuming reusable)

**Gap:** no consolidated contributor operations surface.

---

## Q&A Round 1 — Answered 2026-05-24

### Scope & framing

**Q1. Route?**
`/c/[handle]/dashboard` — uses the contributor's own handle.

**Q2. Single-page or multi-route?**
Full-screen page with internal, responsive tabs.

**Q3. Contributor-only or admins too?**
Contributor-owned by default. Admins can request access: dashboard shows a "Request Access" button on a contributor's public profile → contributor sees an accept/deny notification (in notification bar, or as a banner/pop-up on their profile, or as a floating notification — reuse existing notification patterns). If accepted: admin gets a notification and gains view access. If denied: contributor must supply a reason; admin receives a denial notification with that reason. Denial is logged. Access expires and can be revoked.

**Q4. Mobile-first or desktop-first?**
Web-first; Capacitor scaffolded and prepared for mobile.

**Q5. Visual identity?**
Slightly more vivid / darker-gold-leaning variant of the 60/30/10 system applied to the entire contributor UI layer (not just the dashboard). Keeps brand coherence while signalling a "management" context. Exact tokens TBD in v2 questions.

---

### Identity & profile

**Q6. Profile editing?**
All editing lives inside the dashboard — it is the only profile-editing surface for contributors. `/profile/[id]/edit` route should be renamed/expanded into the dashboard; standalone edit route removed for contributors.

**Q7. Cover photos?**
Carousel of cover photos. One single icon/logo image. Cover photos appear behind the profile icon (like a Facebook cover photo) on the public contributor profile. Carousel image upload currently broken — needs fixing. Applies to user profiles too (separate feature note).

**Q8. Verified badge?**
Admin-only award/revoke. Shown in dashboard as a status indicator. In admin view of contributor: grey "Verify" pill → click → requires reasoning input → logged; transforms to green "Revoke" pill → click → requires reasoning → logged. Contributor receives an in-app notification on each action. All badge activity stored as non-destructible admin activity logs.

**Q9. Social links?**
Fully editable inside the dashboard profile section (no separate tab).

**Q10. Handle / slug edit?**
Editable inside the dashboard. Maximum one change per month. SEO warning shown on edit.

---

### Places tab

**Q11. List layout?**
Thin, elongated cards. Place name in bold, lightly outlined in its category colour. Click expands inline options horizontally beneath the card. Clicking the same card (or another) collapses it. Selected place fills a **40% right-panel** (desktop) with a live replicant of the public place view, all items editable/moveable. On mobile: side panel. The 40% right-panel split is a layout constant for the entire dashboard.

**Q12. Place operations?**
All listed: Edit · Delete · Duplicate · View public · Add event · Manage media · View reviews · Toggle visibility · Transfer ownership · **Assign volunteer** · **Icon edit** (colour, SVG) · **Categories** · **Specialised services** (shown publicly on place info, aids SEO, acts as search-bar keyword bank).

**Q13. Soft delete (archive)?**
Only if it does not degrade UI or DB performance. If it adds clutter, hard delete only. Archived items shown in a lightly-written sub-section at the bottom.

**Q14. Per-place analytics?**
Yes — critical for Citizens Vision. Tracked: follower count, view count, RSVPs (Connects), cancellations (un-RSVPs), Follows, contributions, Convinces, event attendances, comments, event/place view taps, all button taps, shares, reports, errors, engagement timestamps. Data stored per-profile/per-org (exact DB architecture TBD — see v2 Q on analytics storage). Can be pulled by the Citizens ecosystem when requested.

**Q15. Pending-review moderation badge?**
Yes.

**Q16. Drafts?**
Yes — contributors can construct and save place drafts for later publishing or scheduling.

---

### Events tab

**Q17. Filter/view structure?**
Two interchangeable filter modes:
- **Categories** — standard category grouping.
- **Places** — filters by owned place; shows place title with editable event cards beneath.
Category-coloured thin card outlines, same card UX as places. Date groupings (lightly highlighted tiles): **Upcoming / Current** · **Archived** · **Cancelled/Deleted** (lightly red highlighted). Non-current/future events have a **reschedule** button. Deleted events retained in list for 90 days, then purged.

**Q18. Event operations?**
All listed minus "Promote": Edit · Cancel · Duplicate · **Schedule** (modify event duration/date for future events) · View RSVPs · Message attendees · View comments · Delete. Same 40% right-panel replicant as places. Sort by date.

**Q19. Broadcast?**
Yes. Broadcast pill/SVG icon right-aligned inside each event card. On-click: text entry box appears in broadcast section above previous broadcasts. Send button bottom-right. All broadcasts time-stamped. Previous broadcasts: deletable by owner (both sides) and by admin (preview panel + permitted dashboard view only). Broadcast also available in the Owner view of both event and place panels. Users see broadcasts as **"From the Organiser:"**

**Q20. Bulk operations?**
Yes — discretionary selection of safe actions (e.g. cancel, message attendees, schedule).

**Q21. Pre-fill linked place on event creation?**
Yes. Location field surfaces owned places as options, with ability to switch to another place or use map-select (bi-operational). Pre-fills all relevant details from the selected place.

**Q22. Review aggregates on past events?**
Yes. Avg rating, count surface on cards. Also available for Citizens Vision ecosystem data pull.

---

### Comments / messages / engagement

**Q23. Unified Inbox tab?**
Yes — DMs + event comments + place reviews + RSVP questions unified. Planning section also lives here (task planning / ideas / contributor notes).

**Q24. Reply to reviews?**
Yes. Contributor replies visually distinct from citizen comments. Thread visualisation: vertical line from parent comment bending toward indented child reply.

**Q25. Moderation queue?**
Yes — contributor can hide/report flagged items on their own assets. Category proposal from contributors also routes through this queue (admin reviews; contributor can add a message with the proposal).

---

### Tags / categories / discoverability

**Q26. Propose new categories?**
Yes, via moderation queue. Proposal includes a message. Admin reviews and can message back.

**Q27. Discoverability score?**
Yes — only when operational and responsive to real platform activity data.

**Q28. Search terms + keyword bank?**
Yes — privacy-safe aggregate search terms shown. Contributors can also add their own discovery keywords/sentences in a dedicated label section.

---

### History / audit

**Q29. Audit log visible to contributors?**
Yes — contributors see their own activity log inside the dashboard.

**Q30. Retention?**
3 months (90 days).

---

### Billing / paid features

**Q31. Billing scaffold?**
Yes — build and scaffold fully but hide behind a feature flag until PayFast is wired.

**Q32. Invoices / receipts?**
Yes, when billing is live.

---

### Permissions

**Q33. Multi-user orgs / team roles?**
Yes. Roles: owner / editor / viewer / **volunteer**. Citizens can apply to volunteer via event or place views → contributor receives a volunteer application card in the Team section with options: open chat / approve / decline (with message). Full multi-user detail covered in v2 Q session.

**Q34. Invitation flow / role management?**
Deferred to v2 question session.

**Q35. Admin "view as contributor"?**
Yes — valuable only when fully functional. Full details in v2 Q session.

---

### Tech / data

**Q36. New tables?**
Architect decides for efficiency. Likely new tables: `drafts`, `activity_log` (non-destructible), `team_memberships`, `broadcast_messages`, `contributor_keywords`, `specialised_services`. Reuse `status` flags where appropriate.

**Q37. Fetch strategy?**
Parallel queries for dynamic per-tab freshness, with performance as the governing constraint. Use RPC aggregates (like `get_user_places_with_stats`) where a single DB call can replace 3+ parallel fetches cleanly.

**Q38. Real-time?**
Refresh on load is fine.

---

### UX

**Q39. Dashboard home?**
Yes — home/overview tab with top-level KPIs. Details in v2 Q session.

**Q40. Empty state tone?**
Supportive and uplifting. "Let's" framing (e.g. "Let's add your first place →").

**Q41. Default post-login landing for contributors?**
No — default is their own public profile opened as a side panel above the map. Dashboard accessible via a pill/button at the top of the profile panel.

---

### Additional direction (outside Q1–Q41)

- **Suggest/Report icon** — a prominent suggest/report entry point (icon + label + button) should appear in the burger bar top section, as a single icon on the map menu top-right, and in all menus: profile menu, settings, organisation view, side panels. Citizen applications include an optional message.
- **Non-destructible logs** — all important platform activities (verified badge changes, admin access grants/denials, broadcast deletes, role changes, moderation actions) must be written to a non-destructible log. No navigation logs.
- **Cover photos for user profiles** — same carousel/cover-photo behind profile icon pattern should apply to plain user profiles (a separate feature note, same batch scope TBD).
- **Contributor landing post-login** — map view by default; own profile slides in as a side panel; dashboard pill visible at top of panel.

---

## Q&A Round 2 — Open Questions (v2)

> These emerge from the answers above. Resolve these before implementation begins.
> Mark "TBD" for anything not yet decided.

---

### Admin access to contributor dashboard (Q3 expansion)

**A1.** Where exactly does the "Request Access" button appear on the contributor's public profile? Inline in the profile header? In the "…" overflow menu? Visible only to admins or to all users?

**A2.** What access level does an approved admin get — full read + edit, or read-only? Can the admin make changes on behalf of the contributor, or only observe?

**A3.** Does access approval cover the whole dashboard or specific tabs only (e.g. admin can view analytics but not edit profile)?

**A4.** How long does approved access last? Is there an expiry (e.g. 24 hours, 7 days), or is it permanent until revoked?

**A5.** Can the contributor see which admins currently have active access, and revoke individual access from the dashboard?

**A6.** When an admin has active access, does the contributor see a visible indicator (banner/badge) that someone is currently viewing their dashboard?

**A7.** Is there a maximum number of admins that can have concurrent access to a single contributor's dashboard?

---

### Visual theme for contributor UI (Q5 expansion)

**A8.** Should the darker-gold theme be a CSS variable override scoped to `/c/[handle]/dashboard`, or should it apply to the entire contributor-owned experience (e.g. public `/c/[handle]` profile pages too)?

**A9.** Which specific elements shift to the "vivid gold" variant — background tints, card borders, buttons, nav highlights — or all of them?

**A10.** Should the theme variant be **togglable** by the contributor (light vs dark-gold), or is it a fixed design decision?

---

### Cover photos & profile image carousel (Q7 expansion)

**A11.** Maximum number of cover photos in the carousel? (Suggest 5; confirm or adjust.)

**A12.** Should the cover carousel auto-rotate on the public profile, or is it static (user swipes manually)?

**A13.** What is the aspect ratio / crop for cover photos? (e.g. 16:9 or 3:1 banner?)

**A14.** Can individual carousel images have captions?

**A15.** Should the profile icon (logo) be uploadable as an SVG, or raster only (PNG/JPG)?

**A16.** For user profiles (not contributor) — should cover photo functionality be identical, or a stripped-down version (single cover, no carousel)?

---

### Analytics storage architecture (Q14 expansion)

**A17.** Should analytics data be stored **per-contributor** (a contributor-scoped JSONB column or related table), **per-asset** (event/place row has its own stats), or in a **central `activity_events` event-sourced table** that every read aggregates from?

**A18.** Should raw event data (e.g. every tap, every view) be stored, or only aggregated counters (daily/weekly roll-ups)? Raw is richer for Vision but heavier at scale.

**A19.** Which analytics are **public** (e.g. follower count shown on place card) vs **contributor-only** (e.g. individual tap counts) vs **admin+Vision only** (e.g. engagement timestamps)?

**A20.** Should analytics be exportable (CSV download) from the dashboard?

**A21.** What is the retention period for raw analytics data? (Different from the 90-day activity log? E.g. aggregate counters kept forever, raw events 12 months?)

---

### 40% right-panel replicant (Q11 / Q18 expansion)

**A22.** When no place or event is selected, what does the 40% panel show? An empty state ("Select an item to preview"), a dashboard summary widget, or is it hidden (60% expands to full width)?

**A23.** Should edits made in the right-panel replicant **auto-save** (debounced) or require an explicit **Save** button?

**A24.** When an edit is saved in the replicant, does the change appear live on the public profile / event page immediately, or after a review step?

**A25.** On mobile (side panel), can the user swipe to dismiss the panel, or only use an explicit close button?

---

### Specialised services (Q12 expansion)

**A26.** What format are "Specialised services"? Free-text strings, predefined tags, or a combination (predefined + custom)?

**A27.** Maximum number of specialised services per place?

**A28.** Should specialised services be searchable via the main map search bar immediately on entry, or after admin approval?

**A29.** Are specialised services shared across places owned by the same contributor, or strictly per-place?

---

### Broadcast (Q19 expansion)

**A30.** Who receives a broadcast — only current RSVPed users, all followers of the contributor, or both with the contributor choosing?

**A31.** Is a broadcast delivered as an in-app notification, a push notification, or both?

**A32.** Is there a character limit for broadcast messages?

**A33.** Can broadcasts contain media (images, links), or text only?

**A34.** Should users be able to react to (like/emoji) or reply to broadcasts, or are they read-only from the user side?

---

### Volunteer system (Q33 expansion)

**A35.** When a citizen applies to volunteer, what information do they provide? (Message only? Or structured fields: availability, skills, contact preference?)

**A36.** Can a volunteer be assigned to a specific **event** (temporary) or a specific **place** (ongoing), or both?

**A37.** Once a volunteer is approved, do they gain any special permissions on the contributor's content (e.g. can edit event descriptions, check in attendees), or is the role purely informational?

**A38.** Should approved volunteers appear publicly on the event/place page (e.g. "Volunteers: John, Sarah"), or is the list contributor-private?

**A39.** Should there be a **maximum number of volunteers** per event/place, set by the contributor?

**A40.** Can a volunteer withdraw their application after being approved? Flow?

---

### Team roles & multi-user orgs (Q33–Q34 expansion)

**A41.** Beyond owner/editor/viewer/volunteer — are there any other roles needed immediately (e.g. "moderator" who can approve comments but not edit content)?

**A42.** How does a contributor invite a team member (editor/viewer)? Email invitation, username search, or QR code?

**A43.** Can a contributor have only one **owner** (the founding account), or can ownership be transferred or shared?

**A44.** What does an **editor** role allow vs. a **viewer** role? (Suggested: editor = full edit on events/places/broadcasts; viewer = read-only analytics + inbox.) Confirm or revise.

**A45.** Should team membership be visible on the public contributor profile?

---

### Admin "view as contributor" (Q35 expansion)

**A46.** When an admin views the dashboard with contributor permission, should their actions (edits, deletes) be attributed to "Admin [name] on behalf of [Contributor]" in the audit log?

**A47.** Should the contributor receive a notification each time an admin makes a change during an approved access session?

**A48.** Can an admin revoke their own access, or only the contributor can?

---

### Dashboard home / KPIs (Q39 expansion)

**A49.** Which KPIs should appear on the home tab? Suggested set: total followers, total RSVPs this month, upcoming events count, active places count, unread inbox count, discoverability score, recent activity feed, top performing event (by RSVPs). Confirm / add / remove.

**A50.** Should KPIs have time-period selectors (7 days / 30 days / 3 months)?

**A51.** Should the home tab show a **quick-action row** (e.g. "+ Add Event", "+ Add Place", "View Inbox") above the KPIs?

**A52.** Should there be a **Recent Activity feed** (last 10 actions on contributor's assets) on the home tab?

---

### Planning section / workspace (Q23 expansion — inbox includes planning)

**A53.** What does the planning section contain? Suggested: private task list (title + status + due date), linked to optional event/place, notes/ideas scratchpad, saved drafts list. Confirm / adjust.

**A54.** Should tasks in the planning section sync with a calendar view, or are they freeform list only?

**A55.** Are planning items visible only to the contributor (and permitted admins), or can team members see them too?

**A56.** Should there be a **"Ideas bank"** — a freeform section where contributors capture ideas that aren't yet tasks?

---

### Suggest / Report icon (new feature — all menus)

**A57.** What types of suggestions should the icon support? (Suggested categories: Report a bug · Suggest a feature · Report inappropriate content · Other.) Confirm / adjust.

**A58.** Should suggestions route to a general Citizens inbox (admin), or to a specific team/category queue?

**A59.** Should the contributor or citizen who submitted a suggestion receive a status update when it's actioned?

**A60.** Is there a rate limit on submissions (e.g. max 5 suggestions per day per user)?

---

### Handle slug one-change-per-month rule (Q10 expansion)

**A61.** What warning copy should be shown before a slug change? ("This will break any existing links to your profile. Are you sure?")

**A62.** Should old handles redirect to the new handle for a grace period (e.g. 30 days)? If so, handled at DB level or Next.js redirect config?

**A63.** Who can override the one-change limit — admins only, or nobody?

---

### Search term analytics (Q28 expansion)

**A64.** At what aggregation level are search terms shown — top 10 this month, top 10 all-time, or both?

**A65.** Should terms be bucketed ("ministry", "market", "healing") or shown as raw anonymised queries?

**A66.** Should contributor-added keywords feed back into the platform's autocomplete suggestions for all users?

---

## Proposed architecture v2

```
src/app/c/[handle]/dashboard/
├── layout.tsx          # auth gate: must be contributor owner OR admin with permission
├── page.tsx            # home tab — KPIs, quick actions, recent activity
├── places/
│   └── page.tsx        # places tab — card list + 40% right-panel replicant
├── events/
│   └── page.tsx        # events tab — category/places filter + card list + 40% panel
├── inbox/
│   └── page.tsx        # unified inbox: DMs + comments + reviews + RSVP questions
├── planning/
│   └── page.tsx        # tasks, ideas bank, drafts
├── analytics/
│   └── page.tsx        # per-asset analytics (Phase 2 — scaffold now, populate when data ready)
├── team/
│   └── page.tsx        # team members, volunteers, role management
├── profile/
│   └── page.tsx        # profile edit (replaces /profile/[id]/edit for contributors)
└── settings/
    └── page.tsx        # billing (hidden), keywords/discoverability, slug, danger zone
```

**New DB tables (proposed):**
- `contributor_access_requests` — admin → contributor access grant/deny with reason + expiry
- `activity_log` — non-destructible per-profile event log
- `broadcast_messages` — time-stamped broadcasts per event/place
- `contributor_drafts` — drafts for events and places
- `team_memberships` — contributor → user, role, status
- `contributor_keywords` — discoverable keyword bank per contributor
- `specialised_services` — per-place service tags (searchable)
- `volunteer_applications` — citizen → event/place volunteer application with status + message
- `planning_tasks` — contributor task list items
- `analytics_events` — raw activity event log (with configurable retention)

RLS: all tables scoped by `contributor_id` = `auth.uid()` or `is_admin()`.

---

## Out of scope (defer)

- PayFast wire-up (scaffolded, hidden behind flag)
- Push notification setup wizard
- Multi-language UI
- Citizens Wear / other ecosystem channels

---

## Next step

User answers v2 questions (A1–A66). Then lock v1 cut, slot after edit-fixes batch, break into stages.

