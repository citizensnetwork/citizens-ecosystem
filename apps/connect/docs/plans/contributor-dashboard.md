# Contributor Dashboard — Planning Doc

> Created 2026-05-23. Capture clarifying questions + scope before any implementation.
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

## Open questions for user (≥30 before implementation)

> Please answer freely; skip what you don't know yet — leave "TBD" and we'll converge later.

### Scope & framing
1. **Route:** should the dashboard live at `/dashboard`, `/contributor/dashboard`, `/manage`, or `/c/[handle]/manage`? (Last option uses contributor handle in URL.)
2. Should the dashboard be **a single full-screen page with internal tabs**, or **a multi-route section** (sidebar nav, each tab is its own route)?
3. Is this a **contributor-only** surface, or should **admins** also use it as their per-org view (in addition to `/admin`)?
4. Should it be **mobile-first** (Capacitor app primary target) or **desktop-first** (web admin primary target)?
5. Should it have a **distinct visual identity** vs the public site (e.g. denser, more utilitarian, darker), or stay within the existing 60/30/10 white-black-gold system?

### Identity & profile
6. Should the **profile photo + cover** + bio + contact details be **editable inline** within the dashboard, or link out to `/profile/[id]/edit`?
7. Should contributors be able to **upload multiple cover photos** (carousel) for their org page, or just one?
8. Do you want a **"verified" badge** managed somewhere in the dashboard (or admin-only)?
9. Should social links (Facebook / Instagram / WhatsApp / website) be **part of profile edit** or a separate "Channels" tab?
10. Where should the **contributor handle / slug** be editable, and how often can it change? (SEO concern.)

### Places tab
11. List view: **table** (sortable rows), **card grid** (visual), or **both with toggle**?
12. Per-place row operations: which subset of `[Edit · Delete · Duplicate · View public · Add event · Manage media · View reviews · Toggle visibility · Transfer ownership]`?
13. Should "soft delete" (archive) be supported, or only hard delete?
14. Should contributors see **per-place analytics** (follower count, view count, RSVP count across linked events)?
15. When place has **pending reviews flagged for moderation**, surface in this tab as a badge?
16. Should there be a **"My drafts"** sub-section for places not yet published?

### Events tab
17. **Tab structure:** Upcoming / Past / Drafts / Cancelled — confirm all four, or different split?
18. Per-event row operations: which subset of `[Edit · Cancel · Duplicate (recurring) · View RSVPs · Message attendees · View comments · Promote (paid) · Delete]`?
19. Should event **broadcast updates** (existing FEAT broadcast) launch from this tab?
20. Should there be **bulk operations** (select multiple events → cancel / message all)?
21. Should event creation from this dashboard **pre-fill the linked place** when launched from a place row?
22. Should past events surface **review aggregates** (avg rating, count)?

### Comments / messages / engagement
23. Should there be an **"Inbox" tab** unifying DMs + event comments + place reviews + RSVP questions, or keep DMs at `/messages` separately?
24. Should contributors be able to **reply to reviews** from this surface?
25. Should there be a **moderation queue** (hide / report flagged comments) accessible here for the contributor's own assets?

### Tags / categories / discoverability
26. Should contributors be able to **propose new categories** (admin approves) from this surface?
27. Should there be a **"discoverability score"** widget telling contributors what to improve (e.g. "Add 3 more photos to rank higher")?
28. Should contributors see **search terms that surfaced their place/event** (privacy-safe aggregate)?

### History / audit
29. Should there be a **history / audit log** ("you edited X on date Y") visible to contributors, or just admins?
30. Retention: how many months of history?

### Billing / paid features (D11/T5 territory)
31. Should the dashboard expose **billing status** (free vs paid tier) and a **paid-promotion** flow, or wait until PayFast is wired?
32. Should it show **invoices + receipts** when billing is live?

### Permissions
33. **Multi-user orgs:** can a contributor org have multiple users (team members), each with roles (owner / editor / viewer)? Or is it strictly one-user-one-org for now?
34. If multi-user: invitation flow, role management — where?
35. Should **admins** see a "view as this contributor" mode for support purposes?

### Tech / data
36. Should new tables be added for **drafts**, **audit log**, **team memberships**, or reuse existing tables with `status` flags?
37. Should the dashboard pre-fetch via a single **RPC** (like `get_user_places_with_stats`) per tab, or use multiple parallel queries?
38. Real-time updates needed (e.g. new RSVP arrives → row updates live), or refresh on load is fine?

### UX polish
39. Should there be a **dashboard home / summary tab** with top-level KPIs (events this month, total followers, recent reviews), or jump straight to the first tab?
40. Empty states — what tone? ("No places yet — let's add your first one →")
41. Should the dashboard be **the default landing page after login** for contributors (instead of `/events`)?

---

## Proposed architecture sketch (subject to answers above)

```
src/app/contributor/dashboard/
├── layout.tsx          # sidebar nav + auth gate (must be contributor)
├── page.tsx            # default tab — overview / summary
├── places/page.tsx
├── places/[placeId]/page.tsx   # per-place drill-down with event sub-list
├── events/page.tsx
├── events/[eventId]/page.tsx
├── inbox/page.tsx               # if Q23 = unified
├── profile/page.tsx             # org profile editing
└── settings/page.tsx            # billing + team + danger zone
```

Server components fetch via RSC + Supabase server client. Client islands for table interactions.

RLS already enforces ownership at DB layer. Dashboard relies on that + role guard in layout.

---

## Out of scope (defer to later batches)

- PayFast wire-up (waits on credentials)
- Push notifications setup wizard
- Multi-language UI
- Public org page redesign (already covered by `/c/[handle]`)

---

## Next step

User answers Q1–Q41 (or a useful subset). Then we lock the v1 cut, slot it after the edit-fixes batch, and break it into stages.
