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

---

## Q&A Round 2 — Answered 2026-05-25 (locked)

> Authoritative answers. Implementation MUST honour these. Where an answer
> conflicts with the proposed architecture above, the answer wins.

### Admin access (A1–A7)
- **A1.** "Request access" is visible **only to admins**, placed where the contributor's own "Open Dashboard" affordance appears on the public profile. If the admin has no active grant, render the same Dashboard button with a white "Request access" overlay label.
- **A2.** Approved admin = **full access** (full read + edit, same as owner).
- **A3.** Full access. All actions are written to the non-destructible `activity_log` so wrongful actions are traceable.
- **A4.** Access window = **3 days**, then auto-expires.
- **A5.** Yes — contributor sees currently-active admin grants in the dashboard and can revoke any of them. Place under Settings → Access. (Position negotiable later.)
- **A6.** Yes — while an admin grant is active, contributor sees a visible "Admin X is viewing your dashboard" indicator.
- **A7.** **Max 2 concurrent admins** per contributor.

### Visual theme (A8–A10)
- **A8.** Slightly more vivid / darker-gold tint applies across the **entire contributor-owned experience** (public `/c/[handle]` profile, dashboard, all contributor surfaces). Not dark mode — a tonal shift only.
- **A9.** All surfaces shift: background tints, card borders, buttons, nav highlights.
- **A10.** Fixed design decision for users. Provide a dev-only override toggle (e.g. env var or query flag) so we can flip back to the standard theme during development.

### Cover photos (A11–A16)
- **A11.** Max **5** cover photos per contributor profile.
- **A12.** Carousel **auto-rotates** on the public profile.
- **A13.** Aspect ratio **16:9**.
- **A14.** Optional caption per image.
- **A15.** Accept PNG, JPG, **SVG, and GIF**. (If GIF/SVG poses a security or perf risk that cannot be cleanly mitigated, fall back to PNG/JPG only and note in DECISIONS.)
- **A16.** Cover photos are **contributor-only**. Citizens (non-contributors) instead get optional profile "flair" icons (crowns, balloons, etc.) shown beside their avatar on the map when live. (Flair system scoped as a follow-up.)

### Analytics (A17–A21)
- **A17.** Per-contributor analytics, **nested** by place → events → volunteers/followers/managers. Storage should reflect this hierarchy so other Citizens ecosystem apps (Vision) can pull contributor-rooted trees.
- **A18.** Daily aggregated counters (light footprint, retain as much functionality as possible).
- **A19.** Public to Citizens: follows + joins on users / events / orgs / places. Owner-only: views, cancels, reports, RSVPs, search-results, anything tied to contributor profile/assets.
- **A20.** CSV / XLSX export from the analytics tab if possible.
- **A21.** **1 year** retention inside Connect. Yearly snapshots get exported to Citizens Vision storage for longer-term use.

### 40% right-panel (A22–A25)
- **A22.** Empty state when nothing selected. Show a friendly "Select an item to preview" + a couple of "you may want to…" suggestions. (Design free to surface KPIs/quick-actions here if helpful.)
- **A23.** Explicit **Save** button — no auto-save.
- **A24.** On save, the change goes live on the public surface **immediately** (no review step for owners).
- **A25.** Mobile panel supports **swipe-to-close**.

### Specialised services (A26–A29)
- **A26.** Predefined tags **plus** custom strings — expands the search bank.
- **A27.** Max **10** specialised services per place.
- **A28.** Searchable **immediately** on entry. **Strict input validation/sanitisation** to prevent SQL injection / search-engine injection. Apply best-practice allowlist (length cap, character class restrictions, normalisation) on insert and on search.
- **A29.** **Per-place** scope, not contributor-wide.

### Broadcasts (A30–A34)
- **A30.** Place broadcasts → **all followers of the place**. Event broadcasts → **only RSVPed users**.
- **A31.** Delivered as **in-app notification + push notification + a banner update on the event/place view card**.
- **A32.** **500 char** limit.
- **A33.** **Text only.** No media or links.
- **A34.** Reactions allowed **only if implementation stays lightweight**. If it adds bugs or perf cost, ship read-only and revisit later.

### Volunteer system (A35–A40)
- **A35.** Volunteer application = **message only** (free-text).
- **A36.** Volunteers apply per-asset: each event or place exposes its own "Volunteer" CTA when the owner has enabled it. Provide an **"Open for volunteers"** toggle on event create/edit and on place create/edit which shows or hides the volunteer pill.
- **A37.** Approved volunteer role is **purely informational** for now — no special edit permissions. Expandable later.
- **A38.** Volunteer list is **contributor-private**.
- **A39.** No hard cap. Owner approves or declines individually.
- **A40.** Volunteers may **withdraw** after approval. Flow: TBD in implementation (simple "Withdraw" button on the volunteer's own application card).

### Team roles (A41–A45)
- **A41.** Only owner / editor / viewer / volunteer for now. Other roles deferred.
- **A42.** Invite via in-dashboard **search popup** with 3 search bars: full name, user ID, email. Results stream from the user database; click to send invite.
- **A43.** Exactly **one owner**, but ownership can be **transferred** (reassign owner `user_id`).
- **A44.** Confirmed:
  - **Editor** — full edit on events, places, broadcasts.
  - **Viewer** — read-only analytics + inbox.
- **A45.** Team membership is **visible on the public contributor profile** (removable later if unneeded).

### Admin "view as contributor" (A46–A48)
- **A46.** Yes — every admin action while access is active is logged as "Admin [name] on behalf of [Contributor]" in the audit log.
- **A47.** Yes — contributor receives an in-app notification on each admin-attributed change.
- **A48.** **Only admins** can revoke their own active access (contributor cannot self-revoke an active session). _Note: this overrides the earlier A5 statement — contributor sees the active grant, but revocation power sits with admins. Clarify in implementation if user reconfirms._

### Dashboard home (A49–A52)
- **A49.** Confirm the suggested set. Rename "KPI" → **"Analytics"** throughout the UI.
- **A50.** Time-period selectors: **7 / 14 / 30 / 60 / 90 days · 6 months · 1 year**.
- **A51.** Quick-action row above analytics — confirmed.
- **A52.** Recent activity feed showing **citizen activity on the contributor's events and places**.

### Planning (A53–A56)
- **A53.** Confirm the suggested contents. Additional rule: each task is a **card with a title** that, when opened, exposes details, lists, links, assigned places, etc. Each card has a **top-right completion box** (turns green when complete).
- **A54.** **Free-form lists only.** No calendar sync.
- **A55.** Planning items are **contributor-private by default**. Each card has a **"Public" toggle below the delete control** that, when on, makes the card visible to the contributor's team members.
- **A56.** Yes — **Ideas bank** as a sibling of tasks. Same card model as tasks (title + detail body + lists + links + assigned places). Top-right control is a **delete marker**; same Public toggle below it.

### Suggestion button (A57–A60)
- **A57.** Not a categorised report — a single floating **"Suggestions?" / "Fixes?"** button that invites open feedback. On click, glass-panel popup with a **Suggestion Title** + free-text body. Apply **strict character restrictions + SQL-injection prevention** (allowlist, length cap, server-side validation). Submission must capture the **surface / URL / page / event / place** it was triggered from so admins know the context.
- **A58.** Routes to the **admin inbox** (admin notifications).
- **A59.** Yes — submitter receives a status update when the suggestion is actioned (best-effort; tie to existing notification system).
- **A60.** **10 per user per day.** All suggestions land in a dedicated **admin-side suggestion inbox** with an option to **export as XLSX**.

### Handle / slug (A61–A63)
- **A61.** Warning copy confirmed: "This will break any existing links to your profile. Are you sure?"
- **A62.** **No legacy-handle redirect.** Old handles stop resolving immediately — keeps code simple.
- **A63.** Only **admins** may override the one-change-per-month limit.

### Search term analytics (A64–A66)
- **A64.** Show **top 10 this month**.
- **A65.** **Raw anonymised queries** (no bucketing).
- **A66.** Contributor-added keywords **do feed the platform autocomplete** for all users (after sanitisation).

---

## v2 → Implementation Plan (locked)

> Foundation: Batch 16 already shipped the schema + dashboard scaffold
> (`/c/[slug]/dashboard/{overview,planning,team,settings,broadcasts,volunteers,analytics,drafts,history,search,profile}`),
> 12 tables, SECURITY DEFINER functions, global Suggestion button.
> The plan below covers everything still missing or needing refinement to
> satisfy the v2 answers in full.

### Stage A — Admin access UX + safety surface
1. Migration: extend `contributor_access_requests` with a `viewing_started_at` column for indicator + concurrency tracking.
2. API + UI: "Request access" button on the public contributor profile for admins
   (rendered in the same slot as the owner's "Open Dashboard" CTA, with a white
   overlay label when no active grant).
3. Dashboard indicator banner when an admin grant is active (uses Realtime).
4. Admin action attribution: middleware/helper that writes `actor_role = 'admin'` + impersonated contributor id into every mutating API call while a grant is active. All inserts go through `activity_log` with the "on behalf of" framing.
5. Contributor notification on each admin-attributed change (reuse notification system).
6. Settings → Access: list of active grants + admin self-revoke endpoint
   (contributor view is read-only per A48).
7. **Unified mutation attribution helper** (`src/lib/dashboard/activity.ts` →
   `recordContributorMutation`): every mutating contributor route
   (broadcasts, team, volunteers, drafts, keywords, services, planning
   tasks/ideas, access-request revoke) delegates audit through this helper.
   Owner writes → `activity_log.actor_role='contributor'`. Admin-with-grant
   writes → `logAdminOnBehalfAction` (activity_log row with
   `actor_role='admin'` + metadata.on_behalf_of, plus a notification of
   type `admin_on_behalf_action` deep-linking the contributor to
   `/c/{slug}/dashboard/settings`).

### Stage B — Contributor theme tint
1. Add a tonal-variant token set in `globals.css` (vivid/darker-gold tint).
2. Wrap all `/c/[slug]/**` and contributor-owned surfaces with a `data-theme="contributor"` attribute.
3. Add dev-only override (env flag `NEXT_PUBLIC_CONTRIBUTOR_THEME=off` or query param).

### Stage C — Cover photos + carousel
1. Storage: reuse the existing public bucket; gate per-user folder via RLS.
2. UI: 5-slot carousel uploader inside Dashboard → Profile.
3. Public profile: 16:9 auto-rotating carousel behind avatar.
4. Validate MIME (PNG/JPG/SVG/GIF); SVG sanitised through DOMPurify-equivalent or rejected at upload if sanitisation cost is too high (decide on apply; log decision).
5. Optional caption per image (separate jsonb structure).
6. Citizens flair (crowns/balloons) scoped to a follow-up batch.

### Stage D — Specialised services + keyword bank
1. UI: per-place editor (Dashboard → Places → selected place) with a chip
   input (predefined tag list + custom-string entry). Max 10.
2. Strict server-side validation: allowlist `[A-Za-z0-9 ._-]`, length cap 40, NFC-normalise, dedupe per place.
3. Contributor keywords editor in Settings (sanitisation identical).
4. Wire both into the global search index / autocomplete (A66).

### Stage E — Broadcasts wiring
1. UI: composer on Dashboard → Broadcasts and in the per-event/per-place panels (500-char text-only).
2. API: POST broadcast → fan-out to followers (place) or RSVPed users (event).
3. Delivery: in-app notification + push notification + banner on event/place view card.
4. Soft-delete + audit retention (already in schema).
5. Reactions: skip in this batch (revisit per A34).

### Stage F — Volunteers UX
1. Add `volunteer_openings boolean` toggle on event create/edit and on place create/edit.
   (Event side already has the column from migration 098 — extend places.)
2. Public surfaces: render "Volunteer" pill only when the toggle is on.
3. Citizen application form (message only) → existing `volunteer_applications` table.
4. Dashboard → Volunteers: approve / decline (with reason), private list, withdraw flow.

### Stage G — Team management UX
1. Dashboard → Team → "+ Add team member" popup with 3 search bars (name, user_id, email).
2. Server search endpoint with rate-limit + sanitised LIKE query.
3. Invite flow → `team_memberships` row, in-app notification to invitee, accept/decline.
4. Owner transfer flow (reassign `team_memberships.role = 'owner'` atomically).
5. Public profile: render team list (removable later).

### Stage H — Analytics depth + export
1. Daily aggregation trigger or pg_cron job populating `contributor_analytics`
   nested by place → event.
2. Dashboard → Analytics: time-window selector (7/14/30/60/90d, 6mo, 1yr).
3. Citizen-public vs owner-only segmentation per A19.
4. CSV/XLSX export endpoint (use existing CSV util; XLSX via SheetJS if cost-justified — else CSV with `.xlsx` MIME left as TODO).
5. 1-year retention + Vision-export hook (stub for now).

### Stage I — Planning cards (tasks + ideas)
1. Card open/close UI for tasks and ideas with title + body + lists + links + assigned places.
2. Tasks: top-right completion box (green when done).
3. Ideas: top-right delete control.
4. Public toggle under the control to expose card to team members.

### Stage J — Suggestion button polish
1. Glass-panel composer with title + body, server-side validation (length cap, allowlist), capture trigger URL / event / place.
2. Admin suggestion inbox view with status updates back to submitter.
3. XLSX export.
4. Per-user 10/day rate limit.

### Stage K — Handle change rule
1. UI warning copy on slug edit.
2. Server enforces 1-change-per-month using `handle_changed_at`.
3. Admin override endpoint (bypass with audit-log entry).

### Stage L — Search term analytics
1. Capture sanitised search queries in a daily-rolling table.
2. Dashboard → Settings or Analytics: "Top 10 queries this month".
3. Feed contributor keywords into autocomplete (A66).

---

### Sequencing (first cut, may re-order as we land each batch)

1. **Stage A** — admin access UX + safety (security-critical).
2. **Stage B** — contributor theme tint (low risk, sets visual baseline for next stages). 
3. **Stage C** — cover photos.
4. **Stage F** — volunteer toggle + public CTA.
5. **Stage E** — broadcasts fan-out + delivery.
6. **Stage D** — specialised services + keyword bank.
7. **Stage G** — team invite popup.
8. **Stage I** — planning cards refinement.
9. **Stage H** — analytics depth + export.
10. **Stage J** — suggestion inbox polish + XLSX.
11. **Stage K** — slug change rule.
12. **Stage L** — search term analytics.

Each stage = its own batch: migrations (if any) → API → UI → tests → architect → security → push.




---

## Implementation Decisions Log

> Decisions made while shipping this plan. Append new entries here as each stage is delivered; do not duplicate into `.github/DECISIONS.md`.
> For codebase-wide rules (non-dashboard), use `.github/DECISIONS.md` instead.

### Stage A — Admin attribution (server-stamped + dual audit)

Stage A admin-on-behalf-of attribution lives in `src/lib/dashboard/adminAttribution.ts` and writes BOTH an `activity_log` row (with `actor_role='admin'` + `metadata.on_behalf_of`) AND a `notifications` row (type `admin_on_behalf_action` with `data.url` deep link) for every action an admin performs while operating with an active access grant. The `activity_log` row gives the contributor a non-destructible audit trail (RLS allows contributor read-only); the notification gives them real-time awareness so admin activity never feels surreptitious. Both writes are best-effort (errors logged, not rolled back) so the underlying mutation succeeds even if audit insert fails. A new SECURITY DEFINER RPC `mark_admin_viewing_started(p_request_id uuid)` stamps `viewing_started_at` once per grant (idempotent COALESCE) so the owner banner can display "viewing since Xm ago". `actor_role` is constrained `IN ('contributor','admin','system')` with a partial index `WHERE actor_role='admin'` for admin-action queries. Migration 104.

### Stage A item 6 (A48) — contributor read-only on access list

On the dashboard Settings page, the active-sessions list is purely informational for the contributor; only the granting admin can revoke their own session. The `viewerIsOwner` prop (computed server-side from `user.id === contributor.id`) hides the Revoke button and the pending-request approval block when the viewer is the contributor. The PATCH handler enforces the same rule server-side: `action: 'revoke'` is only valid for an admin acting on their own row (`.eq("admin_id", user.id)`). Rationale: contributors can decline before granting (the existing approve/deny flow), and grants are time-bounded (3-day expiry); allowing post-hoc termination by the contributor breaks the trust contract admins agreed to and creates a UX where admins are wary of accepting access at all.

### Stage A item 7 — Unified contributor mutation attribution helper

All mutating contributor API routes route their audit-log writes through `recordContributorMutation(supabase, opts)` in `src/lib/dashboard/activity.ts`, which branches on `access.isAdminWithAccess` to either insert an owner-attributed `activity_log` row (`actor_role='contributor'`) or delegate to `logAdminOnBehalfAction` (admin path: dual write of `activity_log` with `actor_role='admin'` + `metadata.on_behalf_of` AND a `notifications` row of type `admin_on_behalf_action` with `data.url`). Wired into broadcasts, team, volunteers, drafts, keywords, places/services, planning/tasks, planning/ideas — ~18 mutation points across 8 routes. Routes pass `access` (already computed by `checkDashboardAccess`) so the helper has zero extra DB cost. Writes are awaited but errors are logged-and-swallowed — never block the user mutation on audit failure. Companion invariant in `logAdminOnBehalfAction`: caller `metadata` is spread FIRST and `on_behalf_of: contributorId` LAST so callers cannot forge the on-behalf-of audit target.

### Stage A.1 — Server-computed dashboard-access mode

`DashboardAccessButton` receives `mode: "owner" | "admin-granted" | "admin-no-grant"` as a server-rendered prop; the component never inspects the viewer's role client-side. `ProfileDetailServer` resolves the mode by checking `profile.id === viewer.id`, then querying `contributor_access_requests` for `admin_id = auth.uid()` with status in (`pending`, `approved`), filtering server-side for `revoked_at IS NULL` and unexpired `expires_at`. The button only renders when mode is non-null; non-admin Citizens get no button at all. Keeps the RLS-first model: `is_admin()` and `auth.uid()` are evaluated inside Postgres, never inferred from a client header.

### Concurrent access-request submissions — DB-level uniqueness

`contributor_access_requests_pending_unique` is a partial unique index on `(contributor_id, admin_id) WHERE status = 'pending' AND revoked_at IS NULL`. The POST handler in `/api/contributor/[handle]/access-requests` had a check-then-insert pattern that two concurrent requests from the same admin could both pass, producing duplicate notifications. Pushing uniqueness into the DB collapses the race into a 23505 unique_violation which the API translates into the same 409 the pre-check already returned. Migration 102.

### Stage B — Contributor theme tint env flag + dev-only query-param override

Stage B accepts two env-flag forms and a client-side query-param override. `isContributorThemeEnabled()` in `src/lib/dashboard/theme.ts` is the single check; it disables when `NEXT_PUBLIC_CONTRIBUTOR_THEME=off` OR `NEXT_PUBLIC_CONTRIBUTOR_THEME_ENABLED=false` (legacy from batch 16b). Both forms remain accepted until all envs migrate; consolidation is a nice-to-have. Runtime override lives in `ContributorThemeOverride` (`"use client"`) which reads `?contributorTheme=on|off` via `useSearchParams()`, whitelists the value, persists to `sessionStorage["cc:contributorTheme"]`, and toggles by swapping `data-contributor-ui` ↔ `data-contributor-ui-target` on all matching elements. Override is env-wins. No XSS surface — only the literals `"on"`/`"off"` reach DOM/storage. Mounted in `/c/[slug]/dashboard/layout.tsx` and `ContributorPublicProfile.tsx`. Plan doc Stage B item 2 calls for renaming the attribute to `data-theme="contributor"` — left as a follow-up.

### Stage C — Cover photos: PNG/JPG/GIF/WebP only (SVG rejected)

Stage C cover-photo uploads (`/api/contributor/cover-photos`) reuse `validateImageFile()`, which excludes SVG. A15 in the v2 Q&A asked for PNG/JPG/SVG/GIF support, but `event-images` is a public bucket that serves uploads with the user-supplied Content-Type. An attacker-uploaded SVG with inline JS would execute on the storage subdomain origin, leaking session data — same threat that already blocked SVG avatars. GIF stays in (frame-based, harmless), SVG out. Uploads go through POST `/api/contributor/cover-photos` so the storage write uses `createAdminClient()` with a server-validated `user.id` path. PATCH only accepts URLs that already exist in the contributor''s stored array, blocking off-platform URL injection.

### Batch 16 foundation — Non-destructible audit + SECURITY DEFINER for privileged transitions

`contributor_access_requests` and `activity_log` are append-only; no DELETE RLS policies. Admin dashboard access is gated by an approval workflow with max 2 concurrent sessions enforced inside `check_max_dashboard_sessions(uuid)` (SECURITY DEFINER). State transitions go through `approve_dashboard_access(uuid)` and `deny_dashboard_access(uuid, text)` so the audit-log INSERT and the status UPDATE are atomic; the contributor''s own UPDATE RLS path is reserved for self-driven actions. `purge_old_activity_logs()` (90-day) and `purge_old_analytics()` (1-year) are SECURITY DEFINER with `REVOKE EXECUTE FROM anon, authenticated, public` so only service-role / pg_cron can run them. Migrations 100 + 100b. Function-expression uniqueness (e.g. `lower(keyword)`) must be a separate `CREATE UNIQUE INDEX`, not an inline table `UNIQUE` constraint — Postgres syntax requirement.

### Stage H — Aggregator is idempotent REPLACE, XLSX serves CSV body

Migration 110 ships `aggregate_contributor_analytics_daily(p_target_date date)` which derives per-day counters from the canonical source tables. Each metric INSERT uses `ON CONFLICT (...) DO UPDATE SET value = EXCLUDED.value` — *replace*, not *increment* — so a re-run for the same date corrects any drift instead of doubling counters. The same UNIQUE index that `increment_contributor_metric` upserts onto (`contributor_id, entity_type, entity_id, date, metric`) is reused, so the live in-app counter and the nightly rebuild compose cleanly. Cron schedule `15 2 * * *` UTC picks up *yesterday* (default arg `CURRENT_DATE - 1 day`), avoiding a race with end-of-day writes. `cancellations` and `shares` are deliberately omitted from the aggregator — no source-of-truth table exists today (rsvps cancel via DELETE; no shares table). Counters stay at whatever the in-app `increment_contributor_metric` calls write.

Public analytics surface honours A19's "follows + joins public, everything else owner-only" rule by enforcing the metric allowlist inside `get_public_contributor_analytics(uuid, integer)` rather than in the API layer — so even direct RPC calls from anon clients cannot ask for owner-only metrics. The RPC returns aggregated totals across all entity_types so callers cannot enumerate the contributor's events/places from this surface either. `p_days` is clamped server-side to [1, 365] to match retention.

The export endpoint accepts `format=xlsx` but serves the same RFC-4180 CSV body with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` MIME and an `.xlsx` filename. Stage H plan item 4 explicitly allows this fallback ("…else CSV with `.xlsx` MIME left as TODO") and Excel/Numbers open the file natively. Avoiding SheetJS keeps the bundle ~600KB lighter; real XLSX with sheets and formatting is a follow-up if a customer actually needs it.

### Suggestions — anonymous allowed but `user_id` must match `auth.uid()` when set

`suggestions_insert` policy is `user_id IS NULL OR user_id = auth.uid()`, not `WITH CHECK (true)`. Allowing `true` triggered `rls_policy_always_true` advisor and let an authenticated user spoof a suggestion as another user. The new check still permits anonymous (logged-out) submissions because `auth.uid()` returns NULL and the row''s `user_id` may be NULL, but prevents impersonation. `page_url` is validated against `^https?://` at the API layer to block `javascript:` / `data:` XSS vectors before insert. Migration 100b.

### Stage G.2 — Atomic owner transfer via team_memberships + dedicated proposal table

Ownership is now sourced from `team_memberships.role='owner' AND status='active' AND member_id=auth.uid()` in `checkDashboardAccess`, replacing the prior `user.id === contributor.id` shortcut. The legacy self-id check remains as a defensive fallback for the rare case where migration 111's backfill missed a row, but the new `ensure_contributor_self_owner` trigger on `profiles` covers every future approval transition so the fallback should be unreachable in steady state. Proposals are stored in a dedicated `team_owner_transfers` table with a partial unique index `(contributor_id) WHERE status='pending'` — the proposal RPC cancels any prior pending row before insert, so a re-proposal by the same owner replaces the previous one rather than 23505-ing. Acceptance runs inside a single SECURITY DEFINER function body, demoting the prior owner to `'editor'` (preserving them on the team per A43 — "ownership can be transferred") and promoting the acceptor to `'owner'` atomically. Two-owner edge case is prevented by guarding the self-owner trigger: if any other active owner exists for the contributor, the trigger skips the self-row insert (handles the de-approve → re-approve cycle after a prior transfer). Notifications text comes from `profiles.full_name` and is rendered via React default escaping. Migration 111.

### Stage H optional — Backfill RPC, not auto-run during migration

`backfill_contributor_analytics(p_days_back integer DEFAULT 90)` loops `aggregate_contributor_analytics_daily` over the previous N days (clamped 1..365). Implemented as a callable RPC rather than baked into the migration body so deployments stay quick — backfilling 90 days inline could exceed the migration window for a busy cluster, and the operator may want to pick a different window. The function returns `(target_date, rows_written)` rows so `SELECT * FROM public.backfill_contributor_analytics(90);` from psql with service_role surfaces progress. REVOKEd from anon/authenticated/public so only service_role / pg_cron can invoke it. The underlying daily aggregator is REPLACE-not-increment, so re-runs are safe. Migration 112.

### Stage K — Handle change rule: API-side cooldown + SECURITY DEFINER admin override

Owner-driven slug changes go through PATCH `/api/contributor/[handle]/slug` which enforces format, the 30-day cooldown from `profiles.handle_changed_at`, and uniqueness (translated from `profiles_contributor_slug_key` 23505 to a 409). Admin overrides delegate to a SECURITY DEFINER RPC `admin_change_contributor_slug(uuid, text, text)` that re-checks the admin role inside Postgres (defence-in-depth) and writes both `admin_actions` and `activity_log` rows. The format regex `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$` is enforced *in both places* so a compromised admin session cannot inject arbitrary strings via SECURITY DEFINER. UI lives in `SettingsDashboardClient` — server-computed `handleCooldownDaysRemaining` drives the disabled state without a client flash, and a two-click confirm gate carries the A61 warning copy verbatim ("This will break any existing links to your profile. Are you sure?"). Per A62, no legacy-handle redirect — the client hard-navigates to `/c/{new}/dashboard/settings` so the old URL stops resolving immediately. Migration 115.

### Stage J — Dedicated suggestion notification type + admin inbox + CSV-injection neutralisation

Stage J replaces the prior `contributor_approved` hack with a first-class `suggestion_response` notification type (migration 114). The admin inbox at `/admin/suggestions` mirrors `/admin/reported` — tabbed status nav + `SuggestionsManager` client component. Page-URL rendering on the admin surface uses an origin allowlist: `new URL(rawUrl, window.location.origin)` then origin check; only same-origin URLs render as Next `<Link href>` with pathname+search+hash only, and the resolution happens in a post-mount `useEffect` to avoid SSR/CSR hydration mismatch. External URLs collapse to `(external)` text, with the raw URL shown only in the `title` attribute. CSV/XLSX export at `/api/admin/suggestions/export` follows Stage H precedent: CSV body served with xlsx MIME, zero new deps, hard cap 5000 rows, `RATE_LIMITS.heavy`, `Cache-Control: no-store`. A `neutraliseFormula()` helper prefixes any cell starting with `=`, `+`, `-`, `@`, TAB, or CR with a single quote so Excel/Sheets don't execute attacker-supplied formulas. Applied retroactively to the Stage H analytics export (`src/lib/analytics/csv.ts`) as well — a real CSV-injection vector had shipped without protection. The global `SuggestionButton` composer was nudged to a glass-panel treatment (`bg-white/90 backdrop-blur-md` + gold ring) and now surfaces a "Submitted from <path>" line so the user confirms the platform knows their trigger context (A57). No data.url field on the response notification because there is no meaningful destination — the body conveys the outcome.

### Stage I — Planning cards: structured fields + per-card mutation, kanban removed

`planning_tasks` and `planning_ideas` each gained `checklist jsonb` (max 50 `{id,text,done}` items), `links jsonb` (max 20 `{url,label}` with URL validated `^https?://` at the API layer), and `assigned_place_ids uuid[]` (max 10, server-filtered via `filterContributorPlaceIds` against the contributor's own places to block cross-contributor assignment). All caps enforced by DB CHECK constraints AND mirrored in the shared `src/lib/planning/cardFields.ts` validators so the budget is consistent. The single-place `linked_place_id` column is preserved for back-compat; `assigned_place_ids` is the new plural surface. Client-supplied checklist item `id`s are accepted only if they're UUID-shaped — otherwise a fresh one is minted server-side so a client cannot point the entry at an external resource via the `id` field. The 3-column kanban was replaced with an expandable 2-column card grid; each card has a single binary completion checkbox top-right (tasks) or delete X (ideas) with a small `visible_to_team` slide-switch below. Legacy `in_progress` status stays valid server-side for any external integrations but renders as "incomplete" in the new UI. Migration 113.

### Stage H follow-ups — cancellations + shares sources, app-instrumented; Vision snapshot is in-Connect

Cancellations and shares each get a dedicated source-of-truth table (migration 116) that the daily aggregator counts, both populated at the **application layer** rather than via DB triggers. `rsvp_cancellations` is written by `DELETE /api/rsvp` *after* a `.select("id")` confirms a row actually existed — a `BEFORE DELETE` trigger on `rsvps` was rejected because it cannot distinguish a genuine user un-RSVP from the `ON DELETE CASCADE` that fires when an event is torn down (which would inflate the metric). `shares` is written by a new best-effort `POST /api/shares` that the client share surfaces (`ShareButton`, `SocialShareButtons`, `ConsiderBadge`) fire after a successful share/copy via `src/lib/analytics/logShare.ts`; shares were previously 100% client-side with zero tracking. `shares.entity_id` carries **no FK** (it's polymorphic across events/places/profiles) — the aggregator's JOIN to `events`/`places` means a share of a non-existent id simply never aggregates, which also neutralises the obvious "spam random UUIDs" abuse (only shares of real owned entities ever count). Anonymous shares are allowed (`user_id` NULL) because the surfaces live on public pages; RLS `WITH CHECK (user_id IS NULL OR user_id = auth.uid())` blocks an authenticated caller forging another user's id, and the endpoint is rate-limited by user-id-or-IP. Raw logs purge at 90 days (long after daily aggregation consumes them) via the extended `purge_old_analytics()`.

The migration-110 `snapshot_contributor_analytics_for_vision()` NOTICE stub is rewritten (migration 116) into a real materialiser that builds one **nested per-contributor rollup** (`totals` + `places[]` + `events[]`, each with a metric map per A17) for a given year and upserts it into a new `contributor_analytics_snapshots` table (idempotent on `(contributor_id, period_label)`). This honours A21 ("yearly snapshots exported to Citizens Vision storage") without inventing an external HTTP endpoint — Vision pulls from the table. Scheduled yearly (Jan 1, 03:30 UTC). The function is SECURITY DEFINER, REVOKEd from non-service roles; the snapshot table has a read-only RLS policy (owner + admin) and no insert policy, so writes flow only through the function. The signature gained a `p_year integer DEFAULT (last year)` param; the old zero-arg stub is `DROP`-ed in the same migration so the no-arg cron call resolves to the new default.

**Operator action (post-deploy):** after applying migrations 116/117, run `SELECT * FROM public.backfill_contributor_analytics(90);` from psql with service_role to hydrate the last 90 days (now incl. cancellations + shares for any rows already logged).

### Stage L — Search term analytics: anonymised rolling table, RPC-only access, autocomplete merge

Search queries are captured into `search_term_stats` (migration 117): a `(term, day)` unique anonymised aggregate with **no `user_id`** (A65 "raw anonymised queries"), incremented via the SECURITY DEFINER `log_search_term(text)` which sanitises server-side in Postgres (`sanitise_search_term`: control-char strip, whitespace collapse, lowercase, 2–80 char bound, must contain alphanumerics). `POST /api/ai-search` fires it best-effort for **every** search including anonymous. The table has **no RLS policies at all** — every access goes through SECURITY DEFINER RPCs: `get_top_search_terms(limit, days)` (authenticated, clamped, powers the dashboard "Top searches this month" panel per A64) and `get_search_autocomplete(prefix, limit)` (anon+authenticated, A66) which merges contributor keywords (ranked first) with popular recent terms, escaping LIKE metacharacters in the user prefix before anchoring. The global search bar (`EventsView`) gained a debounced autocomplete dropdown (combobox a11y pattern) over `GET /api/search/autocomplete`; suggestions render as React-escaped text (no XSS). 180-day retention via `purge_old_search_terms()` (weekly cron).

**Accepted residual risk:** `log_search_term` is granted to `anon`, so a determined attacker could call the RPC directly (bypassing the rate-limited ai-search route) to inflate a chosen term into the top-10 / autocomplete feed. Impact is low-severity content-quality only — terms are sanitised, non-executable (no markup possible, alphanumeric-required, ≤80 chars), and curated contributor keywords always outrank popular terms in autocomplete. If poisoning is observed, the hardening path is to move logging behind a service-role call inside the route (so anon loses direct EXECUTE) or add per-IP RPC throttling. Capturing anonymous searches was prioritised for top-10 accuracy, matching the existing `ai_search_queries` trust posture.
