# Engine boundary inventory (step E2)

Status: inventory only, 2026-11-11. Nothing here was changed: no code, no migration. It lists what step E3 (the
configuration contract) and step E5 (the engine baseline schema) must deal with.

Read with [`ENGINE_PLAN.md`](./ENGINE_PLAN.md) and [`ADR-001-engine-architecture.md`](./ADR-001-engine-architecture.md).
This repository is public: this file names no tenant and no real organisation. "The pilot tenant" is a community
radio station. Seed data that names real organisations is described, never quoted.

**Measured at:** `main` at `16298c6` (code), migration head **202** on `main` (file `202_lets_gatherings.sql`), and
the live Citizens database read on 2026-11-11 through the Supabase management tools (read-only queries: catalogue,
`cron.job`, `storage.buckets`, `supabase_migrations`). The live database has 198 recorded migrations including
202; it has the same 79 `public` tables as `main`.

**The three marks** used in sections 4 and 5:

- **engine**: goes into every tenant's baseline as it is.
- **engine after change**: goes in, after the change named on the same line.
- **Citizens-only**: stays out of every tenant. Out by default (ADR decision 5).

**Counting method** for sections 1 and 2: a line counts once per word family. "Kingdom" and "Citizen(s)" and
"Contributor(s)" are whole words with a capital first letter (so `contributor_id` is not counted; section 2 deals
with internal names). "All lines" includes code comments; "visible" leaves out lines that start as a comment
(`//`, `/*`, `*`, `{/*`, `<!--`), which is close to, but not exactly, what a person can see. Tests (`__tests__`,
`*.test.*`) and `frontend/vendor` are left out.

---

## 1. Framing words people can see

### 1.1 Totals

| Area                                         | "Kingdom" (all / visible) | "Citizen(s)" (all / visible) | "Contributor(s)" (all / visible) | Faith words, visible (1) |
| -------------------------------------------- | ------------------------- | ---------------------------- | -------------------------------- | ------------------------ |
| `apps/connect/src/frontend` (the app itself) | 57 in 19 files / 26 in 12 | 91 in 57 files / 28 in 18    | 172 in 42 files / 43 in 20       | 56 lines in 19 files     |
| `apps/connect/src/app` (API routes)          | 11 in 6 / 3 in 2          | 27 in 14 / 13 in 4           | 61 in 31 / 8 in 6                | 2 in 2                   |
| `apps/connect/src/lib` (emails, categories)  | 11 in 7 / 7 in 5          | 44 in 13 / 35 in 7           | 61 in 19 / 23 in 3               | 195 in 11                |
| `supabase/functions` (13 edge functions)     | 1 in 1 / 1 in 1           | 8 in 4 / 7 in 4              | 12 in 3 / 11 in 2                | 10 in 2                  |
| `apps/connect/public` (manifest, worker)     | 1 in 1 / 1 in 1           | 4 in 2 / 3 in 2              | 0                                | 1 in 1                   |
| Database functions (live, string literals)   | 6 in 3                    | 1 in 1                       | 6 in 5                           | not counted              |

(1) Faith words: Christian, Christ, Jesus, God, faith, church, ministry, prayer, pray, worship, gospel, scripture,
believer, Bible, Holy, Lord, saint, congregation, pastor, fellowship. Most of the 195 in `lib` are search keywords
and category names in `lib/categories.ts` (130 lines), which section 3 covers.

The `frontend` totals match the sanity check in the E2 brief exactly. Most "all lines" hits in the frontend are a
one-line file header ("Citizens Connect — …") in 52 files; they are invisible but name the product in every file.

### 1.2 The app (`apps/connect/src/frontend`), by surface

Visible lines only. Line numbers are on `main` at `16298c6`.

| Surface                    | Files (visible framing lines)                                                                                                                                                              | What a person sees                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page titles and navigation | `routes.jsx` (300-303), `shell.jsx` (15, 23, 76, 118, 194), `index.html` (26)                                                                                                              | Browser title "Citizens Connect"; screen names "Kingdom Exploration", "Kingdom Projects", "Become a Contributor", "Contributor Portal", "Claim a Contributor listing"; the word mark "Citizens"; the role badge "Contributor" |
| Sign-in and loading        | `auth.jsx` (19-29, 89, 278), `auth-client.js` (46, 70)                                                                                                                                     | The rotating slogan "Connecting …" with nine phrases ending in "the Kingdom", one naming a city and one naming churches; "Loading Citizens Connect"; "We couldn't reach Citizens"; the fallback name "Citizen"                |
| Becoming a partner         | `apply.jsx` (30-62, 159-160, 267, 321), `pending-application.jsx` (26, 51-56, 188, 229), `onboarding-presets-lib.jsx` (18-44), `pages.jsx` (297-305)                                       | "Become a Contributor", "lead Kingdom initiatives", "About your ministry", a sample organisation name, the default kind "ministry", "Citizens can post one community-organised event each week"                               |
| Discovery and map          | `kingdom-discovery.jsx` (17), `map-v2-strings.jsx` (14-15, 249, 273), `entity-card.jsx` (34, 156), `data.jsx` (82), `dashboard.jsx` (237), `map-v2-discover.jsx` (36), `map.jsx` (31, 211) | "Kingdom Discovery", "Kingdom Projects", type labels "Contributor" and "Ministry", "Churches & worship"; the default map centre is a named square in Pretoria                                                                 |
| Kingdom Projects (needs)   | `pages.jsx` (69, 77, 93, 139, 154, 204)                                                                                                                                                    | "Confirmed Kingdom Project", "Suggest a need", the tier "Provincial Vision", "A weekly summary of Kingdom activity"                                                                                                           |
| Profiles and messages      | `profiles.jsx` (243, 281), `messages.jsx` (49), `store.jsx` (294, 468, 510, 528, 903, 950, 1055, 1103, 1491, 1529, 3089)                                                                   | "Citizen" and "Contributor" under a name; fallbacks "A Citizen", "Unnamed Ministry", "My Ministry"; the involvement level "Shepherd"                                                                                          |
| Involvement badges         | `data.jsx` (310-313), `lib/contributors/involvement.ts`                                                                                                                                    | Levels Seed, Shepherd, Pillar, Beacon ("Shining light across the Kingdom")                                                                                                                                                    |
| Partner tools              | `cohosts.jsx` (40-76), `cohost-lib.jsx` (21), `moments.jsx` (61), `automation.jsx` (98, 434, 604), `listing-claim.jsx` (33-36), `intake-upgrade.jsx` (140)                                 | "Invite another Contributor", "not a Contributor on Citizens Connect", "Citizens can read your public website", "already live on Citizens Connect"                                                                            |
| Admin                      | `admin.jsx` (99-100, 117-142, 221-327, 391-392, 479, 564, 596-627, 832, 942, 979)                                                                                                          | "Kingdom Discovery" in eight messages, "Create Contributor Listing", "an account on Citizens", tab names "Contributors" and "Citizens"                                                                                        |
| Insights (sample data)     | `insights.jsx` (278-313)                                                                                                                                                                   | Chart series "Citizens" and "Contributors", and a made-up church in the sample activity feed                                                                                                                                  |
| Let's (gatherings)         | `lets-lib.jsx` (21-22)                                                                                                                                                                     | "Let's Pray", "Let's Worship"                                                                                                                                                                                                 |

### 1.3 Text sent to people

| Channel                                | Where                                                                                                                                                                                                                                    | Framing                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emails from the app                    | `lib/email/templates.ts` (23 "Citizen(s)", 19 "Contributor(s)", 5 "Kingdom" lines), `listingClaimTemplates.ts`, `automationTemplates.ts`, `send.ts`                                                                                      | Product name in subjects and footers, sender name, links to the Citizens address                                                                                                                                                                                                         |
| Emails from edge functions             | `_shared/email.ts` (default sender "Citizens Connect" on a Citizens address), `review-contributor-application` (162-327), `submit-contributor-application` (157-230)                                                                     | "You're an approved Contributor on Citizens Connect!", "Welcome to the Kingdom.", "[Citizens Connect] New Contributor application"; a gold heading colour hard-coded in the HTML                                                                                                         |
| Push and in-app notifications          | `notify-nearby-rsvp` (113); database functions `approve_contributor_application`, `reject_contributor_application`, `notify_followers_of_event`, `notify_followers_of_news`, `schedule_kingdom_project`, `transition_idea_to_in_process` | "A few Citizens near you just RSVPed", "Kingdom Project" in titles, "Contributor" in follower notices. Notification text written inside the database is not in `apps/connect` at all; E3 must reach into the baseline's functions too                                                    |
| Error and status messages from the API | `app/api/admin/citizens/delete` (48-50), `app/api/admin/contributors/delete-listing` (63-65), `app/api/suggestions` (17)                                                                                                                 | "owns a Citizens Wear brand", "created an organisation in Citizens Vision", the tier "Provincial Vision"                                                                                                                                                                                 |
| Home-screen app and metadata           | `public/manifest.json`, `public/sw.js` (97), `frontend/index.html` (26)                                                                                                                                                                  | Name "Citizens Connect", short name "Citizens", description "Discover faith-based events, places, and community near you. Connecting the Kingdom.", theme colour gold, the offline page "Reconnect to load Citizens Connect". There are no Open Graph or description `<meta>` tags today |
| Calendar files                         | `lib/calendar.ts` (46)                                                                                                                                                                                                                   | Product name in the calendar file's producer line                                                                                                                                                                                                                                        |
| Funder report (PDF)                    | `app/api/contributor/[handle]/funder-report`                                                                                                                                                                                             | A "Kingdom Projects led" row (137)                                                                                                                                                                                                                                                       |

---

## 2. Framing words in web addresses and API fields

### 2.1 Page addresses

| Address                                  | Framing                                  | Note                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/citizens/connect` (base path)          | "citizens"                               | Set only when `NEXT_PUBLIC_BASE_PATH` is set (the 219 hub move). A tenant must run with no base path or its own                                                   |
| `/admin/contributors`, `/admin/citizens` | "contributors", "citizens"               | Admin tabs (`routes.jsx` 44). Staff-only, but a tenant's staff see them                                                                                           |
| `/discover`                              | none in the address                      | The screen's internal id is `kingdom-discovery`; it shows up only in code and in `history.state`                                                                  |
| `/c/:slug`, `?c=<slug>`                  | none (the letter stands for contributor) | Partner pages. Neutral as it is                                                                                                                                   |
| `/community`                             | none                                     | Shows "Kingdom Projects"                                                                                                                                          |
| Others                                   | none                                     | `/`, `/map`, `/explore`, `/lets`, `/me`, `/messages`, `/notifications`, `/settings`, `/apply`, `/onboarding`, `/dashboard`, `/e/:id`, `/p/:id`, `/upgrade/:token` |

### 2.2 Private API paths (called by the app; a partner's browser sees them)

Framing segments: `/api/contributor/*` (28 routes, including `/api/contributor/[handle]/…` for analytics, broadcasts,
dashboard, events, news, team, volunteers and the funder report), `/api/contributors/search`,
`/api/admin/contributors/*` (5), `/api/admin/contributor-applications`, `/api/admin/citizens/delete`. These are 36 of the 109 route files; with the three
`/api/v1/contributors` routes (section 2.3), 70 carry no framing word in their address.

### 2.3 The public API (`/api/v1`, 11 routes)

What a tenant's partner, or anyone with the address, can read.

| Path or field                                                                                           | Framing                        | Where                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| `/api/v1/contributors`, `/api/v1/contributors/{slug}`, `/api/v1/contributors/{slug}/stats`              | "contributors" in the path     | 3 of 11 routes                              |
| `role: "contributor"` (also `citizen`, `admin` as values of `profiles.role`)                            | a framing word as a value      | every contributor payload; guaranteed field |
| `contributor_kind` with the default value `ministry`                                                    | framing name and a faith value | contributors; guaranteed field              |
| `contributor_slug`                                                                                      | framing name                   | contributors; guaranteed field              |
| `community_contributor`                                                                                 | framing name                   | events                                      |
| `kind` query values `ministry \| organization \| business \| individual`                                | a faith value                  | `/api/v1/contributors?kind=`                |
| Category ids such as `worship-prayer`, `church-services`, `churches-ministries`, `christian-businesses` | faith values                   | events, places, categories                  |
| The API's own title "Citizens Connect — Public API v1" and the example host                             | product name                   | `apps/connect/docs/api-v1.md`               |

The API's stability policy (`api-v1.md`, "Stability policy") guarantees `role`, `contributor_kind` and
`contributor_slug`. Renaming them for a tenant is a new API version, not an edit. Section 7 asks whether a tenant
gets this API at all.

### 2.4 Internal names (not shown; kept, per ADR decision 5)

`contributor` appears in 778 frontend lines, 781 API-route lines and 310 lib lines (any case, including
identifiers), in 12 table names, 23 of the 139 function names and 4 scheduled-job names. The ADR keeps them. They matter only
where they leak into one of the places above.

---

## 3. Colours, categories and icons in code

### 3.1 Colours

- **475 hex colour values** in `frontend` and `lib` outside a `:root` token block, plus **75 Tailwind arbitrary
  colour classes** such as `text-[#92400E]` in `.jsx` files.
- The most frequent: `#F2BD22` (Citizens gold, 38), `#16A34A` (green, 33), `#836100` (dark gold, 28), `#DC2626`
  (red, 24), `#0A0908` (near-black, 17).
- Token blocks that exist: `frontend/index.html` (`:root` at line 86) and `frontend/assets/map-v2.css` (`:root` at
  21 and 222, 40 colour tokens). Most components do not use them.
- Files with the most: `assets/map-v2.css` 60 (many are the tokens themselves), `lib/categories.ts` 57 (category
  colours), `app/insights.jsx` 52 (charts), `app/data.jsx` 39 (categories), `app/admin.jsx` 33, `lib/map/markers.ts`
  19, `index.html` 15, `tweaks-panel.jsx` 14, `map.jsx` 14, `dashboard.jsx` 14, `pages.jsx` 13.
- Outside the app: the home-screen theme colour in `public/manifest.json`, email HTML in `lib/email/templates.ts` (9)
  and in two edge functions, the involvement badge colours in `lib/contributors/involvement.ts` (4).
- The facelift (pull requests 348 to 351) is moving colours onto tokens; E3 should build on its token names
  rather than this count.

### 3.2 Category lists (each one would have to come from the tenant's configuration)

| Where                                                                                             | What                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/categories.ts` (740 lines)                                                                   | The 17 event categories: labels, short labels, colours, the six groups (founder, 2026-10-21), and long keyword lists for search and suggestions |
| `frontend/app/data.jsx` (13-55)                                                                   | The same categories again for the app, with colours, icons and group headings, plus place categories                                            |
| `frontend/app/map-v2-explore.jsx` (40-83)                                                         | Category-to-group map and the six group ids (`worship`, `serve`, `culture`, `learn`, `audiences`, `business`)                                   |
| `frontend/app/map-v2-strings.jsx` (273-297)                                                       | Group labels and search chips                                                                                                                   |
| `frontend/app/lets-lib.jsx` (21-22)                                                               | The "Let's" gathering types, two of them faith-specific                                                                                         |
| `frontend/app/onboarding-presets-lib.jsx` (18-40)                                                 | Partner presets by kind, starting at "ministry"                                                                                                 |
| `apply.jsx`, `admin.jsx`, `store.jsx`, `entity-card.jsx`, `map.jsx`, `map-v2-strings.jsx`         | The four partner kinds, with `ministry` as the default in at least six places                                                                   |
| `lib/categorySuggest.ts`                                                                          | Keyword scoring that guesses an event's category                                                                                                |
| `lib/searchProfile.ts`                                                                            | Audiences, needs and vibes for search, several faith-specific                                                                                   |
| `lib/quickPanelOptions.ts`                                                                        | The quick-access tools under the map's menu button                                                                                              |
| `lib/easterEggs/wyr.ts`                                                                           | The "Would you rather" question pool used for personalisation                                                                                   |
| `lib/personalization/percentages.ts`                                                              | Interest scores per category                                                                                                                    |
| `app/api/suggestions/route.ts` (17) and `pages.jsx` (93)                                          | The Kingdom Projects tier ladder, ending in "Provincial Vision"                                                                                 |
| `supabase/functions/_shared/category-interests.ts`                                                | Category-to-interest map used by two edge functions                                                                                             |
| Database `categories`, `interests`, `interest_groups`, `event_tags`, `provinces`, `service_areas` | Seed rows (section 4.3)                                                                                                                         |

### 3.3 Icon maps

- `lib/categoryIcons.ts`: the registry of inline icons for categories, quick access and search.
- `lib/map/markers.ts`: category to marker icon and colour.
- `frontend/app/data.jsx`, `map-v2-explore.jsx`, `entity-card.jsx` (34), `map.jsx` (211): category or partner kind
  to icon name (for example `ministry` to a church icon).
- `frontend/assets/citizens-crown.png` and `public/icons/*`: the Citizens crown and app icons.

---

## 4. The database allow-list (the input to step E5)

### 4.1 Schemas

| Schema                                                                         | Mark              | Reason                                                                              |
| ------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------- |
| `public`                                                                       | per table         | Section 4.2                                                                         |
| `vision`                                                                       | Citizens-only     | Another app. 22 migration files touch it                                            |
| `wear`                                                                         | Citizens-only     | Another app. 15 migration files touch it                                            |
| `auth`, `storage`, `cron`, `net`, `realtime`, `vault`, `extensions`, `graphql` | engine (platform) | Created by Supabase in every project. Only settings and rows are ours (section 4.6) |

### 4.2 The 79 `public` tables

Policies: the number of row policies on the live table today. A policy follows its table's mark unless a note
says otherwise.

**Accounts and roles**

| Table                      | Policies | Mark                | Reason                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                 | 3        | engine after change | Drop the other apps' columns (`wear_style_preferences`, `wear_wardrobe_visibility`, `learn_enrolled_listings`, `timezone`), billing (`billing_tier`, `billing_trial_started_at`), the listing helper (`auto_update_*`); keep the claim columns (section 7, item 7); `connect_home_province` becomes a neutral home-region field or goes; `role` values stay (internal) |
| `team_memberships`         | 4        | engine              | Partner teams (owner, admins, members)                                                                                                                                                                                                                                                                                                                                 |
| `team_owner_transfers`     | 1        | engine              | Same                                                                                                                                                                                                                                                                                                                                                                   |
| `pending_admin_elevations` | 3        | engine              | Two-admin approval for new admins; a tenant needs it                                                                                                                                                                                                                                                                                                                   |
| `admin_actions`            | 2        | engine              | Audit of admin actions inside one world                                                                                                                                                                                                                                                                                                                                |
| `app_settings`             | 2        | engine after change | Rows are Citizens tuning values; the tenant's configuration (E3) may live beside them                                                                                                                                                                                                                                                                                  |
| `user_blocks`              | 3        | engine              | Safety                                                                                                                                                                                                                                                                                                                                                                 |
| `reports`                  | 4        | engine              | Safety                                                                                                                                                                                                                                                                                                                                                                 |
| `push_tokens`              | 3        | engine              | Push notifications                                                                                                                                                                                                                                                                                                                                                     |
| `user_locations`           | 4        | engine              | Live location of people (a user's own); see section 6 for the event-owned live pin                                                                                                                                                                                                                                                                                     |

**Partners (internally "contributors")**

| Table                              | Policies | Mark                | Reason                                                                                                                                             |
| ---------------------------------- | -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contributor_applications`         | 4        | engine after change | The open "apply to become a partner" flow. The pilot invites partners instead (ADR answer 4): keep the table, switch the flow off by configuration |
| `contributor_type_change_requests` | 6        | engine              | A partner asks to change its kind                                                                                                                  |
| `contributor_access_requests`      | 4        | engine              | Asking to join a partner's team                                                                                                                    |
| `contributor_locations`            | 5        | engine              | Extra venues                                                                                                                                       |
| `contributor_service_areas`        | 2        | engine              | Where a partner serves                                                                                                                             |
| `contributor_service_presence`     | 2        | engine              | Same                                                                                                                                               |
| `contributor_service_radius`       | 2        | engine              | Same                                                                                                                                               |
| `contributor_keywords`             | 6        | engine              | Partner search words                                                                                                                               |
| `contributor_drafts`               | 1        | engine              | Partner drafts                                                                                                                                     |
| `specialised_services`             | 8        | engine              | Services a place offers                                                                                                                            |
| `listing_claims`                   | 1        | engine              | Staff create a listing and its owner confirms it by email. This is the nearest thing to "staff invite a partner" (section 6)                       |
| `contributor_analytics`            | 1        | engine              | Daily partner numbers; the base for partner reporting                                                                                              |
| `contributor_analytics_snapshots`  | 1        | Citizens-only       | Yearly roll-ups written for Citizens Vision                                                                                                        |
| `contributor_billing`              | 1        | Citizens-only       | Billing tally. The engine handles no money (ADR answer 5)                                                                                          |
| `activity_log`                     | 3        | engine              | Team activity inside a partner                                                                                                                     |
| `planning_ideas`                   | 4        | engine              | Partner planning tools                                                                                                                             |
| `planning_tasks`                   | 4        | engine              | Same                                                                                                                                               |
| `volunteer_applications`           | 3        | engine              | Volunteers apply to a partner                                                                                                                      |

**Events, places and the map**

| Table                   | Policies | Mark                | Reason                                                                                                                        |
| ----------------------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `events`                | 8        | engine after change | Remove the Citizens-only triggers on it (content labels, billing tally); `community_contributor` stays internal               |
| `places`                | 7        | engine after change | Same triggers to remove                                                                                                       |
| `categories`            | 4        | engine after change | Table in, rows out: categories arrive empty and the tenant fills them (ADR decision 5, step 3)                                |
| `event_cohosts`         | 1        | engine              | Co-hosting                                                                                                                    |
| `event_photos`          | 4        | engine              |                                                                                                                               |
| `place_media`           | 4        | engine              |                                                                                                                               |
| `event_updates`         | 3        | engine              |                                                                                                                               |
| `event_views`           | 2        | engine              |                                                                                                                               |
| `event_impressions`     | 2        | engine              |                                                                                                                               |
| `event_tags`            | 4        | engine after change | Table in; the official tags seeded by migrations stay out                                                                     |
| `event_tag_assignments` | 3        | engine              |                                                                                                                               |
| `rsvps`                 | 4        | engine              |                                                                                                                               |
| `rsvp_cancellations`    | 2        | engine              |                                                                                                                               |
| `reviews`               | 4        | engine              |                                                                                                                               |
| `comments`              | 4        | engine              |                                                                                                                               |
| `map_bubbles`           | 1        | engine              | Speech bubbles on markers                                                                                                     |
| `bubble_dismissals`     | 2        | engine              |                                                                                                                               |
| `service_areas`         | 1        | engine after change | Table in; its rows are South African places (province, city, suburb). Seed per tenant country; for the pilot the rows may fit |
| `provinces`             | 1        | engine after change | Same: South African provinces as seed                                                                                         |
| `indemnity_templates`   | 2        | engine after change | Table in; the template text is Citizens' legal wording and stays out                                                          |
| `indemnity_signatures`  | 3        | engine              |                                                                                                                               |

**Social**

| Table                       | Policies | Mark   | Reason                                  |
| --------------------------- | -------- | ------ | --------------------------------------- |
| `follows`                   | 3        | engine |                                         |
| `place_follows`             | 3        | engine |                                         |
| `saved_items`               | 3        | engine |                                         |
| `conversations`             | 2        | engine | Messaging                               |
| `conversation_participants` | 3        | engine |                                         |
| `messages`                  | 2        | engine |                                         |
| `notifications`             | 4        | engine |                                         |
| `broadcast_messages`        | 3        | engine | Partner broadcasts                      |
| `broadcast_reactions`       | 1        | engine |                                         |
| `news_posts`                | 7        | engine |                                         |
| `moments`                   | 3        | engine | Short-lived partner notes               |
| `consider_joins`            | 3        | engine | "Considering" an event, seen by friends |
| `convinces`                 | 3        | engine | Nudging a friend                        |
| `shares`                    | 2        | engine | Share counts                            |

**Needs, interests and search**

| Table                 | Policies | Mark                | Reason                                                                                                                                                                                                                             |
| --------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suggestions`         | 3        | engine after change | Holds two things: user feedback (engine) and Kingdom Projects ideas with a tier ladder (a Citizens concept). Keep the table; the ideas feature and its tier labels come from configuration and are off for the pilot unless chosen |
| `idea_votes`          | 3        | engine after change | Goes with the ideas feature above                                                                                                                                                                                                  |
| `interests`           | 1        | engine after change | Table in; its rows (migration 011, faith-specific) stay out                                                                                                                                                                        |
| `interest_groups`     | 1        | engine after change | Same                                                                                                                                                                                                                               |
| `user_interests`      | 5        | engine              |                                                                                                                                                                                                                                    |
| `event_interest_tags` | 3        | engine              |                                                                                                                                                                                                                                    |
| `search_term_stats`   | 0        | engine              | Anonymised search counts; read only through functions                                                                                                                                                                              |
| `analytics_daily`     | 3        | engine after change | Daily metrics per organisation. Confirm in E5 that nothing in it is fed by or for Vision                                                                                                                                           |

**Citizens-only**

| Table                     | Policies | Reason                                                                                                                                                                     |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content_labels`          | 2        | Cross-app bridge for Wear and Learn (contract section 5.2)                                                                                                                 |
| `api_keys`                | 2        | Keys for sibling apps and outside users of `/api/v1`. See section 7: a tenant may need its own later                                                                       |
| `ai_search_queries`       | 3        | AI search                                                                                                                                                                  |
| `intake_upgrade_requests` | 1        | Intake from Citizens' Google form                                                                                                                                          |
| `listing_sources`         | 8        | The listing helper that reads a partner's public website, channel and calendar; it needs an outside reader and Citizens' consent wording. Can be added to the engine later |
| `listing_suggestions`     | 2        | Same feature                                                                                                                                                               |
| `kv_store_794cc4b9`       | 0        | Created outside the migration lineage, used by no code in this repository                                                                                                  |
| `kv_store_7f45c4c8`       | 0        | Same                                                                                                                                                                       |

Count: 10 (accounts) + 18 (partners) + 21 (events, places, map) + 14 (social) + 8 (needs, interests, search) + 8
(Citizens-only) = 79. Two of the partner tables are Citizens-only too (`contributor_analytics_snapshots`,
`contributor_billing`): **69 in, 10 out**.

Views: `directory_contributors` **engine**; `my_intake_upgrade` **Citizens-only** (intake).

### 4.3 Seed data (all Citizens-only, describe only)

Migrations that insert rows: `003` (categories), `011` (interests, faith-specific), `016` (places, real venues),
`024` and `055` (indemnity templates), `025`, `031`, `052`, `064` (category changes), `033` and `036` (role data),
`037` (a tuning value), `054` (real organisations and events), `061` (testing partners), `079` (provinces), `132`
(Kingdom Projects data), `195` (South African service areas). All stay out (ADR decision 5). `079` and `195` are
geographic and may be offered as optional seed for a South African tenant.

### 4.4 Functions in `public` (139 on the live database, not counting extension functions)

**Citizens-only (27).** Billing: `stamp_billing_trial_on_approval`, `tally_contributor_event`,
`tally_contributor_place`, `get_my_billing_context`. Vision: `snapshot_contributor_analytics_for_vision`. Content
labels: `apply_event_content_labels`, `cleanup_content_labels_on_entity_delete`. AI search:
`ai_search_trim_rolling_50`. Google-form intake: `create_intake_upgrade_request`, `confirm_intake_upgrade`,
`decline_intake_upgrade`, `preview_intake_upgrade`, `resend_intake_upgrade`, `intake_upgrade_flag_admin`,
`intake_upgrade_statuses`, `clear_intake_upgrade_storage`, `intake_create_contributor_profile`. API keys:
`create_api_key`, `revoke_api_key`, `resolve_api_key`. Listing helper: `get_my_automation_settings`,
`set_my_automation_level`, `guard_profile_automation_columns`, `reset_automation_on_listing_loss`,
`decide_listing_suggestion`, `edit_listing_suggestion`, `enforce_listing_sources_cap`.

**Engine after change (10).**

| Function                                                            | Change                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `admin_delete_citizen_account`, `admin_remove_contributor_listing`  | Each reads three `vision` and `wear` tables to refuse a delete; remove those checks                                             |
| `approve_contributor_application`, `reject_contributor_application` | Notification text with "Kingdom", "Citizen", "Contributor": take it from configuration                                          |
| `notify_followers_of_event`, `notify_followers_of_news`             | "Contributor" in notification text                                                                                              |
| `schedule_kingdom_project`, `transition_idea_to_in_process`         | "Kingdom Project" in notification text (names stay internal)                                                                    |
| `guard_profile_server_columns`                                      | Lists the profile columns that only the server may write, including the cross-app, billing and automation columns removed above |
| `handle_new_user`                                                   | Check in E5 what it seeds for a new account (default role and Citizens defaults)                                                |

**Engine (102):** every other function, as it is. They are the rules of one world: team and role checks
(`is_admin`, `is_approved_contributor`, `is_active_team_member`, `is_organiser`, `enforce_at_least_one_admin`,
`protect_role_column`, `on_role_change_side_effects`, the admin elevation, team invite and owner transfer
functions), messaging and blocking (`find_or_create_conversation`, `is_conversation_participant`, `is_blocked`,
`recipient_follows_me`, `update_conversation_timestamp`), follows and counts (`follower_count_public` and
`_exact`, `get_mutual_followers`, `count_friends`), events and places (`safe_rsvp`, co-host invitations,
`caller_may_read_private_event`, community event rules, `sync_event_category_id`, `enforce_place_six_month_delete`,
tag caps, `trending_events`, `recompute_map_prominence`, `record_event_impression`), map bubbles, moments,
broadcasts, news notices, considering and convincing, listing claims (`peek_claimable_listing`,
`claim_admin_created_contributor`, `mark_own_listing_claimed`, `decline_listing_claim`,
`admin_create_contributor_profile`), partner profile and slug functions, service areas, analytics for partners
(`aggregate_contributor_analytics_daily`, `get_public_contributor_analytics`, `get_contributor_public_stats`,
`get_org_*`, `increment_contributor_metric`, `backfill_contributor_analytics`, `purge_old_analytics`), search
(`search_contributors`, `log_search_term`, `sanitise_search_term`, `get_search_autocomplete`,
`get_top_search_terms`, `purge_old_search_terms`), ideas and votes (with `suggestions`), clean-up
(`cleanup_stale_locations`, `purge_old_activity_logs`), and the dashboard access functions. The grants on each
function are copied with it; E5's CI build checks them (ADR decision 5, step 4).

### 4.5 Scheduled jobs (15 on the live database)

| Job                                                                                                                                                           | Mark                | Reason                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `contributor-analytics-daily`, `contributor-analytics-purge`                                                                                                  | engine              | Partner numbers                                                                                                              |
| `live-location-cleanup`                                                                                                                                       | engine              | Keeps live locations short-lived (ADR decision 7)                                                                            |
| `map-prominence-recompute`                                                                                                                                    | engine              |                                                                                                                              |
| `messaging-purge-60d`                                                                                                                                         | engine              | Retention rule; the period may become a tenant setting                                                                       |
| `moments-cleanup`, `search-term-stats-purge`                                                                                                                  | engine              |                                                                                                                              |
| `contributor-digest`                                                                                                                                          | engine after change | Calls an edge function at an address written into the job: the address must be per tenant, set at provisioning, never copied |
| `contributor-analytics-vision-snapshot`                                                                                                                       | Citizens-only       | Vision                                                                                                                       |
| `impersonation-expiry-sweep`                                                                                                                                  | Citizens-only       | Wear's "sign in as". The engine's support-session expiry (ADR decision 3) is new work                                        |
| `vision_advisory_eval`, `vision_daily_snapshots`, `vision_mv_refresh_daily`, `vision_refresh_activity_daily_aggregates`, `vision_refresh_org_dashboard_stats` | Citizens-only       | Vision                                                                                                                       |

### 4.6 Storage, realtime and platform settings

| Item                                                                                                                                | Mark                | Reason                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| Bucket `event-images` (public)                                                                                                      | engine              | With its storage rules                         |
| Bucket `place-images` (public)                                                                                                      | engine              | Same                                           |
| Bucket `wear-media` (public)                                                                                                        | Citizens-only       | Wear                                           |
| Realtime publication on `notifications`, `messages`, `event_updates`, `broadcast_messages`, `volunteer_applications`, `suggestions` | engine              | The same six tables                            |
| Sign-in settings, email sender, rate limits                                                                                         | engine after change | Per tenant (ADR decision 2)                    |
| Migrations that touch no table but set grants (for example `200_lock_anon_secdef_execute`)                                          | engine              | Their result is part of the dump; CI proves it |

### 4.7 Edge functions (13, plus `_shared`)

| Function                         | Mark                | Change                                                                                                 |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `notify-broadcast`               | engine after change | Sender and wording from configuration                                                                  |
| `notify-event-cancelled`         | engine after change | Same                                                                                                   |
| `notify-event-update`            | engine after change | Same                                                                                                   |
| `notify-interested-users`        | engine after change | Same; uses the category-to-interest map, which becomes tenant data                                     |
| `notify-nearby-rsvp`             | engine after change | "A few Citizens near you" (113)                                                                        |
| `notify-new-follower`            | engine after change | Sender and wording                                                                                     |
| `prompt-post-event-reviews`      | engine after change | Same                                                                                                   |
| `send-event-reminder`            | engine after change | Same                                                                                                   |
| `send-rsvp-reminders`            | engine after change | Same                                                                                                   |
| `send-daily-digest`              | engine after change | Same; category-to-interest map                                                                         |
| `send-contributor-digest`        | engine after change | Same; called by the `contributor-digest` job                                                           |
| `review-contributor-application` | engine after change | Heavy Citizens wording (162-327) and a hard-coded colour; off for the pilot (no open partner sign-up)  |
| `submit-contributor-application` | engine after change | Same; off for the pilot                                                                                |
| `_shared/email.ts`               | engine after change | The default sender is the Citizens name and address; a tenant must always set its own (ADR decision 2) |
| `_shared/category-interests.ts`  | engine after change | The 17 Citizens categories mapped to faith-specific interests; becomes tenant data                     |

---

## 5. Cross-app ties and environment variables

### 5.1 Ties

| Tie                                                                                                                                                      | Mark                | Reason                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Wear reads Connect's `/api/v1` through `packages/connect-client`                                                                                         | Citizens-only       | Siblings of Citizens. A tenant has no siblings                                                                        |
| `vision.category_space_map` and `vision.vision_period_snapshots` hold foreign keys into `public`                                                         | Citizens-only       | They exist only because `vision` lives in the same database                                                           |
| The two admin delete functions and routes read `vision` and `wear` (section 4.4)                                                                         | engine after change | Remove the checks                                                                                                     |
| Shared profile columns and `content_labels` (contract section 5)                                                                                         | Citizens-only       | Bridges                                                                                                               |
| The 219 hub: `SITE_ORIGIN` (`https://219.co.za`), the old-host redirects and `HUB_ORIGIN_CONNECT` in `next.config.ts`; the base path `/citizens/connect` | Citizens-only       | The Citizens address. A tenant serves its own domain with no base path (ADR answer 2)                                 |
| `packages/ecosystem` (`basePathFromEnv`, app slugs, old-address rules)                                                                                   | engine after change | Used by `lib/siteUrl.ts`; the Citizens app list must not reach a tenant                                               |
| `packages/utils` (rate limiting)                                                                                                                         | engine              | Neutral                                                                                                               |
| `packages/ui`, `packages/config`, `packages/frontend-build`, `packages/db`                                                                               | to check in E5      | Shared build and UI code; not read for framing in this step                                                           |
| Links from Connect to sibling apps on screen                                                                                                             | none found          | No visible link to Vision, Wear or Central in the app's screens; only the API error messages in section 1.3 name them |
| Central (drafts 203 to 205)                                                                                                                              | Citizens-only       | Not on `main`; must never enter the engine line                                                                       |

### 5.2 Environment variables

Runtime, `apps/connect`:

| Variable                                                                                  | Mark                | Note                                                              |
| ----------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`  | engine              | Per tenant (ADR decision 4)                                       |
| `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_MAPTILER_STYLE`                                  | engine              | One key per tenant, locked to its domain (ADR decision 6)         |
| `RESEND_API_KEY`                                                                          | engine              | One sending key per tenant                                        |
| `NEXT_PUBLIC_SITE_URL`, `ALLOWED_FRONTEND_ORIGIN`                                         | engine              | The tenant's domain                                               |
| `CRON_SECRET`                                                                             | engine              | Per tenant                                                        |
| `ADMIN_NOTIFY_EMAIL`                                                                      | engine              | The tenant's staff address                                        |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (read in `packages/utils`)           | engine              | Shared or per tenant: E5 decides                                  |
| `NEXT_PUBLIC_BETA_LIVE_LOCATION`, `NEXT_PUBLIC_BETA_EASTER_EGGS`, `NEXT_PUBLIC_MAP_PRUNE` | engine after change | Feature switches; E3 decides whether they move into configuration |
| `NEXT_PUBLIC_CONTRIBUTOR_THEME`, `NEXT_PUBLIC_CONTRIBUTOR_THEME_ENABLED`                  | engine after change | A theme switch; superseded by the tenant's theme (E3)             |
| `NEXT_PUBLIC_BASE_PATH`, `HUB_ORIGIN_CONNECT`                                             | Citizens-only       | The 219 hub. Unset in a tenant                                    |
| `OPENAI_API_KEY`, `NEXT_PUBLIC_BETA_AI_SEARCH`, `CC_ENABLE_EMBEDDINGS`                    | Citizens-only       | AI search                                                         |
| `INTAKE_WEBHOOK_SECRET`                                                                   | Citizens-only       | Google-form intake                                                |
| `AUTOMATION_SUGGEST_KEY`, `AUTOMATION_DIGEST_KEY`                                         | Citizens-only       | Listing helper                                                    |

The static app reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_BASE_URL`, `FRONTEND_ORIGIN`, `MAPTILER_KEY` and
`MAPTILER_STYLE` from a generated `config.js` (template `frontend/config.example.js`): **engine**, per tenant.

Edge functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (set by the platform),
`RESEND_API_KEY`, `RESEND_FROM`, `PUBLIC_SITE_URL`, `ADMIN_REVIEW_EMAIL`, `FCM_SERVICE_ACCOUNT_JSON` are **engine**,
per tenant; `CONTRIBUTOR_REVIEW_SECRET` is **engine after change** (only needed if the application flow is on).

Test and script variables (`MAPV2_*`, `DESIGN_CAPTURE_PORT`, `TILES`, `THEME`, `SCHEME`, `REDUCED`, `DSF`) are
tooling, not runtime, and need no mark.

---

## 6. Pilot features that do not exist yet (for step E9)

| Feature                             | What exists that is close                                                                                                                                         | Gap                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offers with codes and attribution   | Nothing. "Offer" in the code means only wording. No table, no route                                                                                               | All of it: offer, code, who redeemed, which partner, reporting. No payments (ADR answer 5)                                                          |
| An event-owned live pin             | `user_locations` (a person shares their own location, with a clean-up job) and the live-location feature switch                                                   | A location owned by an event or partner, moving on the map for the event's duration, with its own rules                                             |
| The "heard on air" spotlight        | Nothing. No "spotlight" or "on air" anywhere                                                                                                                      | A time-boxed feature slot staff control, probably on the map and the home screen                                                                    |
| Short links                         | `/c/:slug`, `/e/:id`, `/p/:id` and the QR dialog (`map-v2-qr.jsx`); partner slugs                                                                                 | Short, sayable links that staff create and that count visits (an on-air call to action needs one)                                                   |
| Partner reporting                   | `contributor_analytics`, `/api/contributor/[handle]/analytics` and its CSV/XLSX export, the funder report PDF                                                     | Reports the tenant's staff send to partners (offer redemptions, spotlight reach), in the tenant's words                                             |
| Partner invitations by tenant staff | Staff (admins) create a listing for an email, and the owner confirms it (`listing_claims`, `admin_create_contributor_profile`, `listing-claim.jsx`); team invites | Staff-only partner creation as the only way in (no open application), staff roles separate from the Superuser, the invitation in the tenant's words |

---

## 7. Open questions found on the way

1. **Does a tenant get `/api/v1`?** If yes, it is a new API version with neutral names (section 2.3), and
   `api_keys` moves from Citizens-only to engine. If no, the routes are switched off in a tenant.
2. **Kingdom Projects in a tenant.** The ideas ladder is a Citizens concept tied to Citizens Impact. Marked
   "engine after change, off by default"; the founder may prefer to cut it.
3. **Two `kv_store_*` tables** exist in the live Citizens database outside the migration lineage and are used by no
   code here. They are Citizens-only for the engine either way; whether Citizens still needs them is a separate
   clean-up for the Citizens project, not engine work.
4. **`profiles` and `events` were created before the first migration** (no `create table` for them in
   `supabase/migrations`). E5's dump-at-a-pinned-head approach covers this, but a replay from the files alone
   would not.
5. **The live head order:** `202_lets_gatherings` was applied before `201_open_to_collaborate` (its version
   timestamp is earlier). The highest version is 201's. E5 should pin the head by file name, not by "highest
   version".
6. **Notification text lives in the database** (section 1.3). E3's configuration has to reach database
   functions, or those functions have to read the wording from a table.
7. **`contributor_claim_email` and the related claim columns** on `profiles` appear to serve both the Google-form
   intake (Citizens-only) and the staff-created listing (engine). E5 should confirm, keep the columns, and cut only
   the intake functions.
8. **Partner kinds.** `ministry` is the default kind in at least six places and an API value. A tenant's kinds (for the
   pilot: businesses, venues, causes) are configuration, but the API value is guaranteed (section 2.3).
9. **Packages not read** for framing: `packages/ui`, `packages/config`, `packages/frontend-build`, `packages/db`.
   E5 should read them before it calls the build neutral.
