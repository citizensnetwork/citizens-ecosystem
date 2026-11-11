# Central feed: mechanism and build guide

> **Who this is for.** Any person or model that builds, reviews or extends Central. It stands
> alone: you do not need the conversation that produced it. Read sections 1 and 2 for the idea,
> then the section for the part you are touching, then section 11 (build steps) and section 12
> (what is built, what is waiting, what is open).
>
> **Why it lives here.** `docs/` at the repo root holds the documents that span more than one
> app (`ARCHITECTURE.md`, `DESIGN_SYSTEM.md`). Central is drawn from every app and shown in two
> of them (the hub's Citizens landing page and the Central screen inside Connect), so its guide
> sits in `docs/central/`, not inside one app's folder.
>
> **Rules that outrank this guide:** the root `CLAUDE.md`, `apps/connect/VISION.md` and
> `apps/connect/docs/SHARED_DB_CONTRACT.md`. If this guide ever disagrees with them, they win
> and this guide is wrong.

---

## 1. What Central is, and is not

**In plain words.** Central is one calm, familiar stream of cards that shows everything the
Citizens ecosystem offers, together: a gathering this weekend from Connect, a small-batch drop
from Wear, a course from Learn, a song, a book, a need someone can meet. It is the Body seeing
itself. It appears in two places with the same cards and the same rules:

1. on the **Citizens landing page** (the hub app, `/citizens`), and
2. as the **Central screen inside Connect**.

**How it ties to the Vision** (`apps/connect/VISION.md`):

| Vision idea                    | What it means for Central                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Body seeing itself         | Every ecosystem app can place its public content in the one stream. No app is the "main" one.                                                                                       |
| Collection before mobilisation | Central collects and shows. It does not push, rank by popularity, or campaign.                                                                                                      |
| Experience over explanation    | Cards show real things to go to, read, hear or join. There are no "what is this app" cards inside the feed. Explanations live behind the Crown (section 4.4).                       |
| The small are honoured         | Nothing in the ranking knows how big or popular a contributor is. Among equally near and equally timely items the order is a daily shuffle, so nobody is permanently at the bottom. |
| Desire, not dependence         | The feed is finite. It ends. It tells you so, and it does not try to bring you back.                                                                                                |

**Guardrails. Each one is a rule a reviewer can check. A change that breaks one is rejected.**

| #   | Rule                                                                                                                                                              | How to check                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| G1  | **Finite daily edition.** One edition per day and place, with a hard cap on its size (`EDITION_MAX_ITEMS`).                                                       | The API never returns more than the cap across all pages of one edition.                                   |
| G2  | **It ends in "You're all caught up".** After the last page the API says `caughtUp: true` and the screen shows that line. No "load more", no loop back to the top. | Scroll to the end at 390px and 1280px.                                                                     |
| G3  | **Nearness before recency.** Sort key 1 is distance band, key 2 is time relevance. Publication time is never a sort key.                                          | Unit tests in `packages/central/test/edition.test.ts`.                                                     |
| G4  | **No engagement counters.** No likes, views, "N going" badges added by Central, no unread dots, no "new since you left".                                          | Search the diff for counters. The item contract has no field for them.                                     |
| G5  | **No streaks, no rewards, no notifications that pull people back to the feed.**                                                                                   | Review.                                                                                                    |
| G6  | **No autoplay.** No video or audio starts by itself. No auto-advancing carousels.                                                                                 | Review.                                                                                                    |
| G7  | **Calm pause cards.** The edition carries "A slower moment / Time to Rest" cards at a fixed rhythm (section 5.5).                                                 | Edition tests.                                                                                             |
| G8  | **No per-person tracking.** The edition is a function of the day and a coarse place, not of the person. Nothing about what someone saw or tapped is stored.       | No table, cookie or log holds a viewer id next to feed content.                                            |
| G9  | **Nothing hard-coded.** A card is a template filled by a feed item. An app is a row in the registry. A new app needs no change to the feed's code.                | Search for app names in the feed component and the API: there must be none outside fixtures and seed data. |
| G10 | **Platform-first kickers.** Every card's first line is the source app's name, then a short line: `Connect · Happening this weekend`.                              | Render check.                                                                                              |

**Central is not:** a social network, a news feed ordered by time, an infinite scroll, an
advertising surface, or a second copy of each app's data. It holds a small public summary of
each item and a link back to the app that owns it.

---

## 2. How it works, end to end

```
  ecosystem apps                    Connect /api/v1 (the only door, contract R2)
 ┌───────────────┐   adapter    ┌──────────────────────────────┐
 │ Connect       │─────────────▶│ central_publish_items()      │
 │ events/places │  feed items  │   validates, upserts         │
 └───────────────┘              │                              │      ┌──────────────────────┐
 ┌───────────────┐  POST        │ POST /api/v1/central/items   │─────▶│ central.feed_items   │
 │ Wear, Learn,  │─────────────▶│   API key bound to ONE app   │      │ central.apps (registry)
 │ future apps   │  feed items  └──────────────────────────────┘      └──────────┬───────────┘
 └───────────────┘                                                               │ candidates
                                ┌──────────────────────────────┐                 │
   screen                       │ GET /api/v1/central/feed     │◀────────────────┘
 ┌───────────────┐   page of    │  1. sourcing  (near, timely) │
 │ card templates│◀─────────────│  2. ranking   (band, time,   │
 │      ▲        │   items +    │               variety)       │
 │ layout engine │   caughtUp   │  3. today's edition (finite, │
 │ (2 or 4 cols) │              │     seeded by day + place)   │
 └───────────────┘              │  4. cursor page              │
                                └──────────────────────────────┘
```

Step by step:

1. **App content.** Each app owns its own tables. Central never reads them.
2. **App hook (adapter).** A small piece of code _inside the owning app_ turns that app's public
   content into **feed items** (section 3) and publishes them (section 4).
3. **Normalised feed item.** One shape for every app. Stored in `central.feed_items`.
4. **Sourcing and ranking.** The feed API asks the database for candidates near the viewer's
   coarse place and inside the time horizon, then ranks them in pure TypeScript (section 5).
5. **Today's edition.** A deterministic, finite, ordered list for one day and one coarse place.
6. **Layout engine.** A pure function that turns the ordered items, their measured heights and a column count into
   placements in staggered columns (section 6).
7. **Card templates.** A template is chosen by what data the item carries (image, icon, list,
   pause), never by which app it came from (section 7).
8. **Screen.** The hub landing and Connect's Central render the same component.

Where the code is:

| Piece                             | Location                                        |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Layout engine                     | `packages/central/src/layout.ts`                |
| Feed item + registry contracts    | `packages/central/src/contract.ts`              |
| Edition (ranking, finite, cursor) | built                                           | `packages/central/src/edition.ts`; not yet called by any route |
| Connect adapter                   | `packages/central/src/adapters/connect.ts`      |
| Fixtures (sample content only)    | `packages/central/src/fixtures.ts`              |
| Migrations (drafted)              | `supabase/migrations/203_*.sql` to `205_*.sql`  |
| Feed API                          | `apps/connect/src/app/api/v1/central/`          |
| Visual reference page             | `docs/central/reference/central-reference.html` |

`@citizens/central` is a new workspace package shaped like `@citizens/utils`: TypeScript source,
no build step, **no dependencies**, framework-free. The hub and Connect can both import it. It
was not added to `@citizens/ecosystem` because that package is plain CommonJS that
`next.config` files `require()` directly, and it must stay that way.

---

## 3. The feed item contract

One normalised shape. Every app produces it; Central stores and serves it. The TypeScript type
and its validator are in `packages/central/src/contract.ts` (`FeedItem`, `validateFeedItem`).
Validation is hand-written, like `apps/connect/src/lib/validation.ts`: the repo's server code
does not use a schema library, and this keeps the package dependency-free.

| Field        | Type                                 | Rules                                                                                                                                                   |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`        | string                               | The source app's slug. Must be a row in the registry (`central.apps`). The server sets it from the API key; a caller cannot choose it.                  |
| `kind`       | string                               | One of the kinds that app registered (`event`, `place`, `contributor`, `pause`, `encouragement`, later `track`, `book`, `initiative`, `update`).        |
| `sourceId`   | string, 1 to 80 chars                | The item's id inside the source app. `(app, kind, sourceId)` is unique: publishing again **updates** the same card.                                     |
| `title`      | string, 1 to 120                     | The card's heading.                                                                                                                                     |
| `kicker`     | string, 1 to 60                      | The short line shown after the app name: `Happening this weekend`. It must not repeat the app name and must not explain the app.                        |
| `summary`    | string, up to 140, optional          | The small line under the title: `Sat 21 Nov · Community Park`.                                                                                          |
| `image`      | `{ url, alt }` or null               | `url` is `https:` only, up to 500 chars. `alt` up to 160 (may be empty for decorative images).                                                          |
| `icon`       | string, optional                     | A key from the shared icon set (section 7.6). Used by the text template when there is no image.                                                         |
| `list`       | string[], up to 5 lines of up to 60  | Optional short list (a track list, a reading list). Chooses the list template.                                                                          |
| `shape`      | `"square"` or `"landscape"`          | A **hint**. Square takes one column, landscape two. The layout engine may show a landscape as a square, or the reverse, to avoid a hole (section 6).    |
| `place`      | `{ label, lat, lng }` or null        | Coarse location of a **public venue** only. `lat`/`lng` are rounded to 2 decimals (about 1.1 km) before storage. `label` is a suburb or town, up to 60. |
| `region`     | string, optional                     | A coarse region code (for example a province) for items with no venue.                                                                                  |
| `startsAt`   | ISO 8601 string, optional            | Start of the item's time window.                                                                                                                        |
| `endsAt`     | ISO 8601 string, optional            | End of the window. An item whose `endsAt` has passed leaves the feed by itself.                                                                         |
| `href`       | string                               | Where a tap goes: an `https:` URL, or a site path starting with `/citizens/`. Nothing else (`javascript:`, `data:`, other schemes) is accepted.         |
| `visibility` | `"public"`                           | The only value v1 accepts. A non-public item is rejected, not stored hidden.                                                                            |
| `payload`    | object, up to 2 KB as JSON, optional | Kind-specific extras for the owning app's own deep link or a later template. Central never renders it as HTML.                                          |

Derived, never supplied by the caller: `id` (`app:kind:sourceId`), `publishedAt`, `updatedAt`.

**There is deliberately no field for** counts, likes, views, popularity, author follower
numbers, or "trending". G4 is enforced by the contract.

**Text is plain text.** Every string is rendered as text, never as HTML. The validator rejects
control characters and trims whitespace.

---

## 4. The app hook contract

### 4.1 What an app must do to join

1. **Be in the registry.** One row in `central.apps` and one row per content kind in
   `central.app_kinds` (section 4.4). Added by a migration or by an admin action, with the
   founder's yes.
2. **Write an adapter.** A pure function inside the app that maps its own public content to
   `FeedItem`s. Connect's is the model: `packages/central/src/adapters/connect.ts` with tests
   and fixtures.
3. **Publish through the trusted path.** Call `POST /api/v1/central/items` with its API key
   whenever content is created, changed or removed (or on a schedule). Connect, which owns the
   API, calls the same database function in-process.
4. **Publish only what is already public** in the app, and only the summary fields. Central is
   a shop window, not a copy of the stock room.

An app never needs to change Central's code, and Central never reads the app's tables.

### 4.2 The designs that were compared

| Question            | A. Normalised items table, apps push through a trusted server path (**chosen**)                             | B. Fan-out: Central calls every app's API on each request                                    | C. Database views that union the apps' tables                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cost at scale       | One indexed read per page, cacheable per place and day. Cost does not grow with the number of apps.         | N network calls per page. Slowest app sets the speed. Ranking across apps needs all of them. | One query, but it scans every app's tables and cannot be indexed across them.                                                      |
| Security surface    | One write function, one table, service_role only. Each app's key can write only its own app's rows.         | Central holds a credential for every app, and every app exposes a list endpoint.             | Central's reader needs SELECT on sibling schemas. One wrong view leaks private rows.                                               |
| Contract R2 / R1.2  | Kept. Apps come to `/api/v1`; nobody reads a sibling's tables.                                              | Kept only if every app builds an API first. Wear and Vision have none for this today.        | **Broken.** A view over `wear.*` or `vision.*` is a direct cross-schema read (and welds the schemas together, contract section 8). |
| A brand-new app     | Registry row, API key, adapter. No Central change.                                                          | Central must learn a new API and its paging and errors.                                      | A migration that rewrites the view, and the app's table shape becomes Central's problem.                                           |
| Edits and removals  | The app publishes again (upsert) or calls remove. `endsAt` and `expiresAt` clear stale items by themselves. | Always fresh.                                                                                | Always fresh.                                                                                                                      |
| When an app is down | Its last published cards stay. The feed is whole.                                                           | The feed has a hole or fails.                                                                | Not applicable.                                                                                                                    |
| Weakness            | Items can be stale until the app republishes. Mitigated by a default expiry (30 days) and the sync job.     | Latency, fragility, cost.                                                                    | Coupling and leak risk.                                                                                                            |

**Choice: A.** It is the only one that keeps the shared-database contract, costs the same with
three apps or thirty, and lets a new app plug in without touching Central.

### 4.3 The write path

```
adapter (in the app)  ──▶  POST /api/v1/central/items        (sibling apps; API key)
                           or central publish helper          (Connect itself, in-process)
                      ──▶  validateFeedItem() for every item  (TypeScript, section 3)
                      ──▶  public.central_publish_items(app, items)   (service_role only)
                      ──▶  central.feed_items  (upsert on app + kind + source_id)
```

- The **app is taken from the key**, never from the request body: `central.app_publishers`
  binds one API key id to one app slug. A Wear key cannot publish a card that says Connect.
- At most **100 items per call**, a per-app **daily quota** (`central.apps.daily_item_quota`,
  default 500 writes a day), and the existing v1 rate limit on top.
- Removal: `DELETE /api/v1/central/items` with a list of `{ kind, sourceId }` sets the row's
  status to `removed`. Rows are soft-removed so a later audit can see what was shown.
- `central.apps.publish_enabled` is a kill switch per app. Turning it off stops new writes;
  setting the app's status to `paused` also hides its existing cards from the feed.

### 4.4 The app registry

One row per ecosystem app, so the card kickers and the Crown's roll-out panels are data.

| Column             | Meaning                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`             | `connect`, `wear`, `learn` ... The same slugs as `@citizens/ecosystem` (`APP_SLUGS`, `COMING_SOON`).                                                                                                     |
| `name`             | Short name for the kicker: `Connect`.                                                                                                                                                                    |
| `label`            | Full name: `Citizens Connect`.                                                                                                                                                                           |
| `accent`           | The app's accent colour (section 7.2). Shown as the 8px dot in the kicker.                                                                                                                               |
| `icon`             | Icon key for the Crown's roll-out links.                                                                                                                                                                 |
| `explanation`      | The plain-words explanation shown when a Crown panel is tapped. Source copy: the hub's "How it works" and "The ecosystem" pages (`apps/hub/src/lib/content.ts`, `COMING_SOON` in `@citizens/ecosystem`). |
| `visit_url`        | Where the "visit" pill goes.                                                                                                                                                                             |
| `status`           | `live`, `coming_soon` or `paused`.                                                                                                                                                                       |
| `sort_order`       | Order of the Crown's panels.                                                                                                                                                                             |
| `publish_enabled`  | Whether the app may publish feed items.                                                                                                                                                                  |
| `daily_item_quota` | Write cap per day.                                                                                                                                                                                       |

`central.app_kinds (app_slug, kind, label, default_shape)` lists what each app may publish. An
item whose `(app, kind)` is not registered is rejected.

The registry is served by `GET /api/v1/central/apps`. The TypeScript type is `CentralApp` in
`packages/central/src/contract.ts`. **There is no app list in the feed's code.** Sample
registry rows exist only in `packages/central/src/fixtures.ts` (tests and the reference page)
and in the seed of migration 203.

---

## 5. Sourcing and ranking

All of this is pure TypeScript in `packages/central/src/edition.ts`, so it is unit-tested
without a database. The database only hands over a bounded set of candidates.

### 5.1 What the client sends, and location privacy

- The client sends **one optional value**: `near=<lat>,<lng>`, each **rounded to 1 decimal
  place on the device before it is sent** (a cell of about 11 km). Example: `near=-25.7,28.2`.
- The server rounds again (never trusts the client), uses the cell to rank, and **does not
  store or log it**. The feed route must not write the query string to any log or table.
- No precise position ever leaves the device. Central never asks for the browser's location by
  itself: it uses a cell only if the person has already shared location in the app, or chose a
  town.
- Feed items carry the location of a **public venue**, rounded to 2 decimals. A contributor
  with no fixed public address has no `place` (only an optional `region`).

**A signed-out visitor, or anyone without a location,** gets the edition for "no place": the
same items ranked by time relevance and variety only. Nothing is asked of them.

### 5.2 Sourcing (which items are candidates)

`public.central_feed_candidates(lat, lng, cutoff, limit)` returns at most 300 rows where:

- `status = 'live'` and the app's status is `live`,
- `visibility = 'public'`,
- not ended (`ends_at` is null or in the future) and not expired,
- starts within the next 21 days, or has no time window,
- `published_at` is before the edition's **cutoff** (section 5.4),

ordered by squared distance between the viewer's cell and the item's cell (items with no place
last), then by id.

### 5.3 Ranking (the order inside the edition)

Each candidate gets a sort key of three parts, compared in this order:

1. **Nearness band** (0 is best): within 10 km, 25 km, 60 km, 150 km, then everything else and
   items with no place. Bands, not raw distance, so that two things in the same part of town
   are equals. With no viewer cell, every item is in the same band.
2. **Time bucket** (0 is best): happening today, within 3 days, within 7 days, _timeless_
   (places, contributors: no window), within 21 days.
3. **Daily shuffle**: a hash of `day | cell | item id` (FNV-1a, 32-bit). This is what makes the
   edition stable all day and different tomorrow, and what keeps the small from being buried:
   among equals nobody is always last.

Publication time, popularity and the size of the contributor are not in the key (G3, G4).

Then a **variety pass**: walking the sorted list, the next card is the first of the next 6
candidates whose `(app, kind)` differs from the card just placed; if none differs, the first.
This spreads apps and kinds without letting any item jump more than 5 places.

### 5.4 Today's edition: deterministic and finite

- **Edition key** = `day | cell`, where `day` is the calendar date in `Africa/Johannesburg`
  after a 04:00 turnover (so the edition changes while most people sleep) and `cell` is the
  1-decimal cell or `none`.
- **Cutoff** = the moment the edition day began. Items published after it wait for tomorrow's
  edition. This is what keeps today's order from shifting under someone who is scrolling.
- **Finite**: the ranked list is cut at `EDITION_MAX_ITEMS` (48). Pause cards are added on top
  of that.
- **Stateless**: the server rebuilds the same edition from the same inputs on every request and
  slices the page out. No per-person state exists (G8). The response is cacheable by
  `cell + cursor`.
- **Cursor**: an opaque string that encodes `version | day | cell | offset`. A cursor from
  yesterday's edition gets `409 edition_changed`, and the client starts again from the top.
- **"All caught up"**: the page that contains the last item returns `caughtUp: true`,
  `nextCursor: null` and `nextEditionAt` (the next 04:00). New items appear in the next edition.
- If an item is removed during the day it disappears from later pages. The client de-duplicates
  by `id`, so a one-item shift cannot show a card twice.

### 5.5 Fixed editorial slots

The approved reference has three, and all three are data:

| Slot                               | Where                                   | Source                                                                                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today's Encouragement**          | Lead block above the feed, left         | A feed item of kind `encouragement` from the app `central`, valid for the day (`startsAt`/`endsAt`). Returned as `lead.encouragement`, never placed in the grid.                                                                         |
| **This hour around you**           | Lead block above the feed, right        | Drawn by the client: the local time, the date, the place label. The reference's weather line is marked "(sample)" and has no data source: **OPEN** (section 12).                                                                         |
| **A slower moment / Time to Rest** | Inside the grid, as a square pause card | Feed items of kind `pause` from the app `central`. The edition inserts one after the 4th card and then after every 12 cards more (after cards 4, 16, 28 ...), cycling through the available pause items. No pause items, no pause cards. |

---

## 6. Layout logic

### 6.1 The rule (the founder's)

- **2 columns on phones, 4 on desktop.**
- A **landscape** card spans **two** columns. A **square** card spans **one**.
- **Staggered columns, not rows.** Cards keep their own heights, so the columns do not line up
  across, exactly as in the approved design check. (The first draft of this guide packed cards
  into equal-height rows. The founder corrected it on 2026-11-11: "I meant columns, and not rows".)
- **No holes**: inside a column there is never an empty space with a card below it.

The column count comes from the **width of the feed container**, not the window: 4 columns at
1000px and wider, otherwise 2 (the 1000px step is the reference's). The reference also had a
3-column step between 680px and 1000px; the founder's rule names only 2 and 4, so 3 is
**OPEN** (section 12). The engine works for any column count of 2 or more.

### 6.2 The algorithm, exactly

`layoutBatch(state, items, measure, { final })` in `packages/central/src/layout.ts`. The
engine does only arithmetic. The caller passes `measure(item, span)`, which returns the height
in pixels of that item's card when it is drawn `span` columns wide (section 6.5 says how).

Each column remembers its **bottom** (where its next card starts: the last card's bottom plus
one 12px gap) and its **tail** (its lowest card).

```
for each item, in rank order:

  SQUARE     put it in the shortest column (the leftmost one on a tie).

  LANDSCAPE  look at every pair of neighbouring columns. A pair QUALIFIES when
               - its two columns are level, or
               - the shorter one ends in a one-column card (that card can grow).
             Take the qualifying pair whose taller column is lowest (leftmost on a tie).
             If the two columns are not level, GROW the shorter column's last card until
             they are. Put the landscape card on both columns at that height.

             If no pair qualifies:
               - the next item is a square: place that square first, then look again;
                 if a pair qualifies now, place the landscape; if not, draw it as a square;
               - the next item is a landscape, or this is the end: draw it as a square;
               - the next item is not known yet (more pages to come): keep the landscape
                 in state.held until the next batch arrives.
```

A pair does not qualify when its shorter column is empty or ends in a two-column card: neither
can grow without leaving a hole or covering a neighbour.

Guarantees (each is a property test in `packages/central/test/layout.test.ts`):

1. **Every item is placed exactly once** (after the final batch).
2. **No holes, no overlaps.** In every column the cards follow each other from the top with
   exactly one gap between them.
3. **A landscape card sits on two neighbouring columns at one height.**
4. **Rank order is kept**, except that one square may be placed in front of one landscape.
5. **A placed card never moves.** Its column and top never change. Only its **height** may grow,
   when it is the card that closes the gap under a landscape card; the engine reports these in
   `extended`.
6. **Same input, same output**, however the stream is split into batches.

The columns end at different heights at the very end of the feed, as in the design check. That
is not a hole: nothing comes below. The "all caught up" line sits under the tallest column.

### 6.3 Worked example, 2 columns

Gap 12. Ranked items and their measured heights: `a` square 200, `b` square 260, `c` landscape
180, `d` square 220, `e` landscape 180, `f` square 240, `g` square 200.

| Step | What happens                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a    | column 0, top 0. Column 0's bottom is 212.                                                                                                                                                     |
| b    | column 1 (the shortest), top 0. Its bottom is 272.                                                                                                                                             |
| c    | landscape. Column 0 is shorter (212 against 272) and ends in `a`, a one-column card: the pair qualifies. `a` grows from 200 to **260**. `c` sits at top **272** on both columns. Bottoms: 464. |
| d    | columns are level, so column 0, top 464. Its bottom is 696.                                                                                                                                    |
| e    | landscape. Column 1 is shorter (464) but ends in `c`, a two-column card: no pair qualifies. The next item `f` is a square, so `f` goes first.                                                  |
| f    | column 1 (the shortest), top 464. Its bottom is 716.                                                                                                                                           |
| e    | again. Column 0 is shorter (696 against 716) and ends in `d`: qualifies. `d` grows from 220 to **240**. `e` sits at top **716**. Bottoms: 908.                                                 |
| g    | column 0, top 908. The feed is 1108 tall.                                                                                                                                                      |

Order on the page: `a b c d f e g`. Only `e` and `f` changed places.

### 6.4 Worked example, 4 columns

Gap 12. `a` landscape 180, `b` square 200, `c` square 260, `d` square 220, `e` landscape 180.

| Step | What happens                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a    | all columns are level: the leftmost pair. Columns 0 and 1, top 0. Their bottoms are 192.                                                                                                                          |
| b    | column 2 (empty), top 0. Bottom 212.                                                                                                                                                                              |
| c    | column 3 (empty), top 0. Bottom 272.                                                                                                                                                                              |
| d    | columns 0 and 1 are the shortest (192): column 0, top 192. Bottom 424.                                                                                                                                            |
| e    | landscape. Pairs 0+1 and 1+2 do not qualify (their shorter column, column 1, ends in the two-column card `a`). Pair 2+3 qualifies: `b` grows from 200 to **260**, and `e` sits on columns 2 and 3 at top **272**. |

### 6.5 How it maps to the page

The feed is a positioned box and every card is placed by the numbers the engine returns.

```css
.feed {
  position: relative;
} /* height: set from result.height */
.fc {
  position: absolute;
  display: flex;
  flex-direction: column;
}
```

For each page of items:

1. Work out `cols = columnsForWidth(feedWidth)` and `colWidth = columnWidth(feedWidth, cols)`.
2. Call `layoutBatch(state, items, measure, { final })`. Your `measure(item, span)` must: build
   the card, set its width to `cardWidth(colWidth, span)`, add it to the feed **hidden**
   (`visibility: hidden`), and return its height. Keep that element: it is the card.
3. For every placement set `left = cardLeft(col, colWidth)`, `top`, `height`, and show the card.
   A card is drawn two columns wide when the placement's `span` is 2, **not** when the item's
   `shape` says landscape: the engine may have drawn a landscape as a square.
4. For every entry in `extended`, set that earlier card's new `height`. Nothing else changes.
5. Set the feed's height to `result.height`, and keep `result.state` for the next page.

A card's height must not depend on a file that has not loaded yet: the image area gets its
proportion from CSS (section 7.5), never from the picture itself. When the feed's width changes,
start again from an empty layout and lay out everything that is on screen.

A grown card is taller than its content: its image area takes the extra height (`flex: 1`); on
a card without an image the extra is empty space under the text.

`docs/central/reference/central-reference.html` does exactly this in about 40 lines of plain
script. Copy its approach, not its code style.

### 6.6 What changed from the reference, and why

The reference page is the approved **look**, staggered columns included. Only these parts of its
demo script are replaced:

| In the reference (demo)                                                   | Replaced by                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Every card one column wide                                                | A landscape card spans two columns (the founder's rule) |
| Per-item image heights in pixels inside the sample data (170 to 300px)    | Proportion by span (section 7.5)                        |
| 12 sample cards repeated for 6 rounds, then a note that the preview stops | The real, finite edition and "You're all caught up"     |
| 2, 3 or 4 columns by container width                                      | 2 or 4 (3 is OPEN)                                      |
| App names and colours in a script constant                                | The registry                                            |

What stays exactly as the demo did it: a one-column card goes to the shortest column.

---

## 7. Design direction

**The rule: match the reference. Never substitute your own styling.** The values below are
quoted from the approved design check (its Central block). Where the reference says nothing,
this guide says **OPEN** and section 12 lists the question. Do not fill an OPEN with a guess.

Other models cannot open the original design check (it is not in the repository). Use
`docs/central/reference/central-reference.html`: it shows only Central, built from these same
values, driven by the real layout engine with sample content.

### 7.1 Tokens

| Token                | Light                                                       | Dark                                          |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Gold (`--gold`)      | `#f2bd22` (locked by the founder)                           | same                                          |
| Gold text on paper   | `#836100`                                                   | not defined for Central: OPEN                 |
| Page (`--bg`)        | `#f7f6f1`                                                   | `#1b1c18`                                     |
| Text (`--tx`)        | `#272a25`                                                   | `#f7f6f1`                                     |
| Quiet text (`--tx2`) | `#272a25a6`                                                 | `#f7f6f1b3`                                   |
| Hairline (`--hr`)    | `#272a2514`                                                 | `#f7f6f11f`                                   |
| Card (`--card`)      | `linear-gradient(125deg,#f7f6f1e8,#f7f6f1a6 70%,#f7f6f170)` | `linear-gradient(125deg,#23251ff2,#2a2c26d8)` |
| Card edge (`--edge`) | `#ffffffb8`                                                 | `#ffffff1a`                                   |
| Card shadow (`--sh`) | `0 12px 35px #272a2509`                                     | `0 12px 35px #00000059`                       |
| Raised (`--raised`)  | `#fffdf8`                                                   | `#23251f`                                     |

Page background: `radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--gold) 7%, transparent), transparent 50%), var(--bg)`.
Theme change: `transition: background .28s, color .28s`.

**Type: system sans only**, `ui-sans-serif, system-ui, sans-serif`, base `16px/1.6`,
`-webkit-font-smoothing: antialiased`. No web fonts.

**Kicker** (the small capital label, used in the hero and lead blocks): `11px`, weight `600`,
`letter-spacing .17em`, uppercase.

### 7.2 App accents (the kicker dot)

Connect uses the gold. The others, from the reference: Vision `#718ba9`, Move `#718b78`, Wear
`#a8685a`, Learn `#4f8a8b`, Play `#94708c`, Impact `#b4535a`. Central's own cards have **no
dot**. These live in the registry (`central.apps.accent`), not in code.

### 7.3 Around the feed

| Part                | Values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inner padding       | `0 clamp(12px, 4cqw, 40px) 60px` (container query units; the Central wrapper is `container-type: inline-size`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Hero                | padding `clamp(30px,6cqw,70px) 4px clamp(18px,3cqw,34px)`, max-width `860px`. Kicker `Citizens · Connecting the Kingdom`. `h1` "A little closer, every day.": `clamp(36px,6.3cqw,63px)`, weight `500`, `letter-spacing -.055em`, `line-height 1.04`, margin `14px 0 14px`. Paragraph `16px`, `line-height 1.75`, max `60ch`, quiet text.                                                                                                                                                                                                                                             |
| Lead row            | grid, 1 column, gap `12px`, margin-bottom `12px`; at container width 760px and wider `grid-template-columns: 1.7fr 1fr`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Encouragement block | radius `28px`, padding `22px 24px`, card background, 1px edge, card shadow, `backdrop-filter: blur(22px)`. Text `clamp(18px,2.3cqw,23px)`, weight `500`, `letter-spacing -.03em`, `line-height 1.3`, margin `10px 0 10px`. Reference line under it `12px`, quiet text.                                                                                                                                                                                                                                                                                                               |
| This-hour block     | radius `28px`, padding `20px 22px`, `min-height 190px`, 1px edge, card shadow, grid with `align-content: space-between`. Light: text `#272a25` on `linear-gradient(160deg,#dfe5e8,#c9d2d6 55%,#b9c3c4)`. Dark: text `#f7f6f1` on `linear-gradient(160deg,#2b3236,#23292b 55%,#1d2221)`. Time `54px`, weight `400`, `letter-spacing -.05em`, `line-height 1`. Small text `12.5px`, opacity `.75`. Icon top right (`right 18px; top 16px; width 58px`), `#6f8793` light, `#a9bcc6` dark. Kicker `Central · This hour around you`, `max-width calc(100% - 72px)`, margin-bottom `10px`. |
| Inside Connect      | the inner block gets `padding-top 86px; padding-bottom 190px` on phones (room for Connect's bars), `padding-left 112px; padding-bottom 60px` on desktop; hero `padding-top 6px`; `h1` `clamp(30px,5cqw,48px)`.                                                                                                                                                                                                                                                                                                                                                                       |

**Sticky navigation and the Crown: OPEN in detail.** The founder decided _what_ they are, and
the reference does not draw them (it still shows a search button and a "Join" pill):

- Citizens landing: a sticky bar with "C" + "entral", a profile icon for login (in place of
  search), and the Citizens Crown on a theme-inverted round panel (in place of Join). The Crown
  rolls out one panel per ecosystem app; tapping a panel shows its explanation; a "visit" pill
  on the right opens the app.
- Inside Connect on phones: a sticky bar with a back arrow on the left, "Citizens Central"
  centred, and the Crown on the right on theme-inverted soft glass, rolling out icon + name
  links to each app.

What the reference does define for the bar: `position: sticky; top: 0; z-index: 5`, flex, gap
`14px`, padding `12px clamp(16px,4cqw,40px)`, card background, `backdrop-filter: blur(22px)`,
1px bottom edge. The "C" mark: `42px`, weight `500`, `letter-spacing -.04em`, `line-height 1`.
Round button: `40px` circle, 1px edge, card background, padding `10px`. Everything else about
the roll-out panels (size, motion, the panel's layout) is OPEN and belongs to the Citizens
landing surface. The data for them is ready: the registry.

### 7.4 Card anatomy

Every card (`.fc`): `border-radius 24px`, `overflow hidden`, card background, `1px` edge, card
shadow, text colour `--tx`, text left, no padding on the card itself, enter animation `.35s
ease-out` (the reference's `usher`; honour `prefers-reduced-motion`). The whole card is one
button or link. Gap between cards: `12px` both ways.

Text block (`.tx`): padding `13px 15px 16px`, grid, gap `6px`. In reading order:

1. **Kicker line** (`.pl`): flex, wrap, gap `6px`, `11.5px`, quiet text. First the app name in
   bold: text colour, weight `600`, underlined with `text-decoration-color: var(--hr)` and
   `text-underline-offset: 3px`, preceded by an `8px` round dot in the app's accent. Then `· `
   and the item's `kicker`. Central's own cards have no dot.
2. **Icon** (text template only, optional): `22px` wide, text colour, 24-unit line icon,
   `stroke-width 2`, round caps and joins.
3. **Title** (`h3`): `18px`, weight `600`, `letter-spacing -.03em`, `line-height 1.15`, margin 0.
4. **Summary** (`small`): `12px`, quiet text. Or, for the list template, the list.

Templates, chosen by the data present (never by app):

| Template  | When                    | Anatomy                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **image** | the item has an `image` | image on top (block, full width, `object-fit: cover`), then the text block without an icon                                                                                                                                                                                                                                                                                   |
| **text**  | no image, no list       | text block: kicker, icon (if any), title, summary                                                                                                                                                                                                                                                                                                                            |
| **list**  | the item has a `list`   | kicker, title, then the list: no bullets, margin `4px 0 0`, grid gap `6px`, `13px`; each line is flex, gap `8px`, `padding-top 6px`, 1px hairline on top, with a `16px` icon in front                                                                                                                                                                                        |
| **pause** | kind `pause`            | no kicker line. `min-height 230px`, content at the bottom (`align-content: end`). Light `linear-gradient(170deg,#e9e3d3,#d9d6c8)`, text `#272a25`, edge `#ffffffb8`. Dark `linear-gradient(170deg,#2a2a22,#1f211b)`, text `#f7f6f1`, edge `#ffffff1a`. Small line first (the `summary`, "A slower moment"), then the title (`26px`, weight `500`, `letter-spacing -.045em`). |

### 7.5 Card proportion

The reference gave each sample image a pixel height. Real data has none, so the image area's
proportion follows the card's span: `1 / 1` on a one-column card, `2 / 1` on a two-column
card. That is the image's **least** height: when a card grows to close the gap under a landscape
card (section 6.2), its image area takes the extra height.

This proportion is this guide's reading, listed as an open question with this default (section
12, O3).

### 7.6 States

| State                 | Reference                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **More is arriving**  | A centred line under the feed: "More is arriving…", padding `22px 0 8px`, `12.5px`, quiet text. Shown while the next page loads.   |
| **All caught up**     | The founder's words: "You're all caught up". Same line style. Anything more (an icon, the time of the next edition) is OPEN.       |
| **Empty / not ready** | Not in the reference: OPEN. Until then show the same quiet line with "Nothing to show here yet." and no cards. Never sample cards. |
| **Error**             | Not in the reference: OPEN. Same quiet line; never a red banner inside the feed.                                                   |

Icons: 24-unit outline icons, `fill: none; stroke: currentColor; stroke-width: 2;
stroke-linecap: round; stroke-linejoin: round`. The reference page carries the set used by the
sample cards. An item names its icon by key; an unknown key shows no icon.

---

## 8. Database design (drafted, NOT applied)

Three migration files in the one lineage, `supabase/migrations/`. **None is applied.** The
founder reviews and applies them (pre-apply git tag, `apply_migration`, security advisor: 0
ERROR and no unexpected finding). If another migration takes a number first, renumber these.

**Schema: a new `central` schema**, by contract rule R1.1 (a new ecosystem app gets a new
schema) and R1.3 (keeps a later split cheap). It is **not exposed through PostgREST** and no
end-user role has any privilege in it (rule R3.2, the same pattern as `vision`'s snapshot
tables). The only way in is three functions in `public`, executable by `service_role` only,
called from Connect's server code.

### 8.1 `203_central_schema_and_registry.sql`

- `central.apps`: `slug` (pk; lower-case letters, digits, hyphen), `name`, `label`, `accent`
  (6-digit hex), `icon`, `explanation`, `visit_url`, `status` (`live` / `coming_soon` /
  `paused`), `sort_order`, `publish_enabled` (default false), `daily_item_quota` (default 500),
  `created_at`, `updated_at`.
- `central.app_kinds`: `(app_slug, kind)` pk, `label`, `default_shape`.
- `central.app_publishers`: `api_key_id` (pk) to `app_slug`. Binds one API key to one app. No
  foreign key into `public.api_keys` (no cross-schema FK, contract section 8); the id is checked
  in code.
- Seed: the registry rows for the apps that exist or are announced, with copy taken from what
  the hub already publishes, and Central's own kinds (`pause`, `encouragement`).
- RLS enabled on all three, **no policies**. `revoke all ... from anon, authenticated, public`
  on the schema and on every table (Supabase otherwise gives `anon` and `authenticated` every
  privilege on a new table, and RLS does not stop `TRUNCATE`). `grant` to `service_role` only.
- Rollback: `drop schema central cascade;` (nothing else depends on it).

### 8.2 `204_central_feed_items.sql`

- `central.feed_items`: `id` (identity pk), `app_slug`, `kind` (fk to `app_kinds`),
  `source_id`, `title`, `kicker`, `summary`, `image_url`, `image_alt`, `icon`, `list` (jsonb),
  `shape`, `place_label`, `geo_lat numeric(5,2)`, `geo_lng numeric(6,2)` (the type itself
  rounds to 2 decimals: a precise position cannot be stored), `region`, `starts_at`, `ends_at`,
  `href`, `visibility` (check: only `public`), `payload` (jsonb, size check), `status` (`live`
  / `hidden` / `removed`), `published_at`, `updated_at`, `expires_at` (default 30 days).
- `unique (app_slug, kind, source_id)`: the upsert key.
- Length checks on every text column that mirror section 3, so the database refuses what the
  validator refuses.
- Indexes: partial btree on `(geo_lat, geo_lng) where status = 'live'`; partial on
  `(starts_at) where status = 'live'`; `(app_slug, updated_at)` for the quota count.
- `central.publish_log (app_slug, day, writes)`: the daily quota counter.
- RLS on, no policies, all revoked, `service_role` only.
- Rollback: `drop table central.publish_log; drop table central.feed_items;`.

### 8.3 `205_central_functions.sql`

All three: `language plpgsql` or `sql`, **`security invoker`** (they run as the caller, and the
only caller allowed is `service_role`, which already holds the table grants, so no definer
function is needed and the advisor gets no new SECURITY DEFINER finding), `set search_path =
''`, `revoke execute ... from public, anon, authenticated`, `grant execute ... to
service_role`.

- `public.central_publish_items(p_app text, p_items jsonb) returns jsonb`: checks the app
  exists, is enabled and under quota; at most 100 items; upserts; returns `{ accepted,
rejected: [{ index, reason }] }`.
- `public.central_remove_items(p_app text, p_keys jsonb) returns integer`: soft-removes.
- `public.central_feed_candidates(p_lat numeric, p_lng numeric, p_cutoff timestamptz, p_limit
integer)`: section 5.2. Returns item columns plus nothing about who asked.
- `public.central_apps()`: the registry rows with status `live` or `coming_soon`.
- Rollback: `drop function` for each.

Before applying, prove them with a rolled-back probe (one `do` block that ends in `raise
exception`), as the repo's other migrations were: `anon` and `authenticated` get `42501` on
every table and function; `service_role` can publish, read candidates and remove; a publish
for an unregistered kind, a non-public item, an over-long title and an over-quota app are each
refused.

---

## 9. Security review

**service_role uses (each one is a surface):**

| Where                                   | Why it needs service_role                               | What limits it                                                                                   |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/v1/central/feed`              | not started                                             | build step 2; every piece it needs is built and tested                                           |
| `GET /api/v1/central/apps`              | not started                                             | build step 2                                                                                     |
| `POST` / `DELETE /api/v1/central/items` | The publish and remove functions are service_role only. | API key required, bound to one app; validation; quota; rate limit.                               |
| Connect's own publisher (sync job)      | Same function, called in-process.                       | Runs only behind the existing cron secret; publishes only rows the public v1 API already serves. |

The service-role client must be created only in server files, never imported by anything under
`src/frontend`.

**Write paths:** exactly one, `central_publish_items` (plus soft-remove). No end-user role can
write. There is no policy to get wrong because there are no policies.

**Abuse cases:**

| Case                                       | Defence                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A rogue or compromised app floods the feed | 100 items per call, daily quota per app, v1 rate limit per key. The variety pass stops one app filling a screen. `publish_enabled = false` stops it; `status = 'paused'` hides it.               |
| An app publishes as another app            | The app comes from the key binding, never from the body.                                                                                                                                         |
| Private content leaks into the public feed | `visibility` must be `public` (validator and a table check). Adapters start from the app's already-public API shape, not from its tables. The contract has no field for a person's private data. |
| Stored script or markup in a title         | All strings are rendered as text. Validator rejects control characters. `href` accepts only `https:` or `/citizens/...`; image `url` only `https:`.                                              |
| A hostile link target                      | Same `href` rule. Recommended follow-up: per-app allowed link hosts in the registry (O7).                                                                                                        |
| Location privacy (viewer)                  | Only a 1-decimal cell is sent; rounded again on the server; never stored or logged; the edition is not per-person.                                                                               |
| Location privacy (content)                 | Only public venues, rounded to 2 decimals by the column type.                                                                                                                                    |
| Scraping or load                           | The v1 gate's anonymous IP limit. Responses are cacheable per cell and cursor. Page size is capped at 24, the edition at 48 items.                                                               |
| Cursor tampering                           | The cursor carries no authority: day, cell and offset are validated and bounded; a bad cursor is a `400`.                                                                                        |
| Oversized bodies                           | `POST` body capped at 256 KB; payload 2 KB; every string has a length limit in the validator and in the table.                                                                                   |

**Not changed by this work:** authentication, the API key system, existing RLS, any existing
table.

---

## 10. API

All under Connect's `/api/v1` (contract R2), behind the existing `gateV1`. When these ship
they must be added to `apps/connect/docs/api-v1.md` in the same change (R2.3).

### `GET /api/v1/central/feed`

| Query    | Meaning                                                                             |
| -------- | ----------------------------------------------------------------------------------- |
| `near`   | optional `lat,lng`, 1 decimal each. Anything else is ignored (treated as no place). |
| `cursor` | optional, from the previous page's `nextCursor`.                                    |
| `limit`  | 1 to 24, default 12.                                                                |

```json
{
  "data": {
    "edition": { "day": "2026-11-21", "cell": "-25.7,28.2", "size": 31 },
    "lead": { "encouragement": { "...": "a FeedItem or null" } },
    "items": [{ "...": "FeedItem" }],
    "nextCursor": "v1~2026-11-21~-25.7,28.2~12",
    "caughtUp": false,
    "nextEditionAt": "2026-11-22T02:00:00.000Z"
  },
  "meta": { "status": "ok" }
}
```

- `meta.status` is `ok`, or `not_ready` while the migrations are not applied: `items: []`,
  `caughtUp: true`, HTTP 200. **No sample content is ever served.**
- Errors: `400 invalid_cursor`, `409 edition_changed` (start again without a cursor), `429`
  from the gate, `503 feed_unavailable` if the database call fails for any other reason.
- Caching: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Safe because the
  response depends only on day, cell, cursor and limit.

### `GET /api/v1/central/apps`

`{ "data": CentralApp[], "meta": { "status": "ok" | "not_ready" } }`. Cache one hour.

### `POST /api/v1/central/items` and `DELETE /api/v1/central/items`

API key required (`401` without, `403` if the key is not bound to an app). Body `{ "items":
FeedItemInput[] }` (no `app` field), at most 100. Response `{ "accepted": n, "rejected": [{
"index": 3, "reason": "title_too_long" }] }`. `DELETE` body `{ "keys": [{ "kind", "sourceId"
}] }`. `429` on rate limit or quota.

---

## 11. Build steps for other models

Do them in order. Each is one small pull request. For every step: run `pnpm lint && pnpm
typecheck && pnpm test && pnpm build` from the repo root, stage explicit paths only, and never
apply a migration or merge without the founder's yes.

**How to verify a visual step.** Open `docs/central/reference/central-reference.html` and your
build side by side at **390px** and **1280px**, in **light** and **dark**. Do not judge by eye
alone: measure. With the browser's inspector (or a throwaway Playwright spec that reads
`getComputedStyle` and `getBoundingClientRect`), compare for at least one card of each
template: border radius, padding of the text block, font size / weight / letter-spacing of the
kicker, title and summary, the gap between cards, the column count, and the background and text
colours in both themes. They must equal the values in section 7. Then check: columns are staggered (card edges do not line up across columns), no column has an empty space with a card below it, wide cards cover exactly two columns, the feed ends in "You're all caught up", and no card changes position when the next page arrives.

| #   | Task                                                                                                                                                                                                                                                                    | Files                                                                                   | Done when                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Founder reviews the three drafted migrations; apply them one at a time                                                                                                                                                                                                  | `supabase/migrations/203` to `205`                                                      | Rolled-back probe passes (section 8); advisor 0 ERROR, no unexpected finding; `SHARED_DB_CONTRACT.md` section 1 and 9 gain the `central` schema in the same change |
| 2   | Build `GET /api/v1/central/feed` and `/apps` (section 10): `gateV1`, the service-role client, `central_feed_candidates`, then `buildEdition` and `pageOfEdition` from `@citizens/central`. Return `not_ready` (HTTP 200, no items) when the functions do not exist yet  | `apps/connect/src/app/api/v1/central/`                                                  | `meta.status` is `ok` on a preview; `api-v1.md` documents both                                                                                                     |
| 3   | Publish endpoint                                                                                                                                                                                                                                                        | `apps/connect/src/app/api/v1/central/items/route.ts` + tests                            | A bound key can publish and remove; an unbound key gets 403; over-quota gets 429; tests cover each rejection reason                                                |
| 4   | Connect's publisher: read Connect's own public events, places and contributors, map with `connectToFeedItems` (pass Connect's real share-link builders as `links` and the founder-approved kicker lines as `kickers`), publish; run on a schedule and after create/edit | `apps/connect/src/lib/central/publish.ts`, a cron route beside the existing one         | Real Connect content appears in the feed; a cancelled event disappears within one run                                                                              |
| 5   | The feed component (shared by both surfaces): fetch pages, `layoutBatch`, templates, states. Columns from a `ResizeObserver` on the feed container                                                                                                                      | hub: `apps/hub/src/components/central/`; styles in `apps/hub/src/styles/`               | Measured equal to the reference at 390 / 1280, light / dark; property "nothing moves on append" holds in a Playwright check                                        |
| 6   | Citizens landing: place the component under the hero and lead row; sticky bar and Crown **after** the founder answers O1                                                                                                                                                | `apps/hub/src/pages/citizens/index.tsx`                                                 | Hub tests pass; page works with `meta.status: not_ready` (quiet empty line, no errors)                                                                             |
| 7   | Central inside Connect, behind the look switch chosen for the facelift                                                                                                                                                                                                  | Connect's frontend, on the facelift branch that owns the shell                          | Same measurements; Connect's Playwright suite passes                                                                                                               |
| 8   | A second source app (Wear is the first candidate): adapter + key + registry `publish_enabled`                                                                                                                                                                           | inside that app                                                                         | Its cards appear with its accent, with no change to Central's code                                                                                                 |
| 9   | New kinds the founder named: music, books, community initiatives, business updates                                                                                                                                                                                      | registry rows + adapters; a new template only if the four existing ones cannot carry it | Founder has said which app owns each (O6)                                                                                                                          |

**Common ways to get this wrong**

1. **Putting cards in rows.** An earlier draft did (CSS grid, equal-height rows). The founder
   corrected it: Central is **staggered columns**. Do not use `display: grid` rows for the feed.
2. **Letting the item's `shape` decide the width.** The placement's `span` decides. The engine
   may have drawn a landscape as a square.
3. **Laying everything out again when a page arrives.** Keep the returned `state` and pass only
   the new items. A placed card never moves; only the heights listed in `extended` change.
4. **Measuring wrongly.** Measure the card at the width it will be drawn, with its content in,
   and with the image height coming from CSS. If a card's height changes after layout (a late
   image, a late font), cards overlap or gaps open.
5. **Inventing styling for an OPEN item** (the Crown's panels, the empty state, tablet columns).
   Ask the founder.
6. **Using `#d4af37`** or any gold other than `#f2bd22`. Loading a web font. Using a serif.
7. **Hard-coding an app** (a name, a colour, an `if (app === 'connect')`) in the component or
   the API. Apps are registry rows; templates are chosen by data.
8. **Sorting by `publishedAt`**, or adding a "new" badge, a count, a like. See the guardrails.
9. **Sending or storing a precise location.** One decimal from the client, two decimals for a
   venue. Never log the `near` value.
10. **Infinite loading.** When `caughtUp` is true, stop. Do not fetch again until the next
    edition.
11. **Reading another app's tables** to fill the feed (even "just for now"). The owning app
    publishes through `/api/v1`.
12. **Serving sample content** when the feed is empty or not ready.
13. **Granting anything in `central` to `anon` or `authenticated`**, or leaving the default
    grants on a new table.
14. **A `position: fixed` or blurred full-page layer over the feed.** Large `backdrop-filter`
    areas were measured as expensive in this repo; the reference blurs only the bar and the
    encouragement block.

---

## 12. Status and open questions

### Status

See the table at the end of this file's pull request description for the state at hand-over;
this table is updated by every change that moves a row.

| Piece                                           | State       | Notes                                                                                                                                            |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| This guide                                      | built       |                                                                                                                                                  |
| Layout engine + property tests                  | built       | `packages/central/src/layout.ts`; staggered columns (revised from rows on the founder's correction); seeded property tests of all six guarantees |
| Reference page (Central only)                   | built       | `docs/central/reference/central-reference.html`; measured at 390px and 1280px, light and dark                                                    |
| Feed item + registry contracts, validators      | built       | `packages/central/src/contract.ts`                                                                                                               |
| Edition (ranking, finite, cursor)               | not started | `packages/central/src/edition.ts`                                                                                                                |
| Connect adapter + fixtures                      | built       | `packages/central/src/adapters/connect.ts`; pure mapping, not yet scheduled (build step 4)                                                       |
| Migrations 203 to 205                           | drafted     | files exist; **never executed anywhere**; the founder reviews, probes and applies (build step 1)                                                 |
| `GET /api/v1/central/feed`                      | not started |                                                                                                                                                  |
| `GET /api/v1/central/apps`                      | not started |                                                                                                                                                  |
| `POST` / `DELETE /api/v1/central/items`         | not started | build step 3                                                                                                                                     |
| Connect publisher (sync job)                    | not started | build step 4                                                                                                                                     |
| Feed component (hub)                            | not started | build step 5                                                                                                                                     |
| Citizens landing integration, sticky bar, Crown | not started | build step 6; needs O1                                                                                                                           |
| Central inside Connect                          | not started | build step 7                                                                                                                                     |

### Open questions for the founder

| #   | Question                                                                                                                                                              | Recommended default                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | The Crown's roll-out panels and both sticky bars are decided in words but not drawn. May a design check be made for them first?                                       | Yes: one small design check for the bar and the Crown, approved before code, as was done for the feed.                                   |
| O2  | Tablet widths (680 to 1000px): 2 columns, or the reference's 3?                                                                                                       | 2 columns below 1000px, 4 from 1000px: exactly the rule as written.                                                                      |
| O3  | Image proportion: at least square on a one-column card, at least 2:1 on a two-column card. The design check used hand-set photo heights that real data does not have. | Accept.                                                                                                                                  |
| O4  | When a landscape card arrives, the card above it in the shorter column grows (its photo, or empty space under its text) so that no gap is left.                       | Accept. The alternative is a visible gap or dropping the two-column card.                                                                |
| O5  | "This hour around you" shows weather in the reference, marked as sample. Is there to be a weather source?                                                             | Leave weather out for now; show time, date and place.                                                                                    |
| O6  | Who writes Today's Encouragement and the pause cards, and which apps will own music, books, community initiatives, business updates?                                  | Encouragement and pause cards: entered by an admin as Central's own items. The four content types wait until their app is named.         |
| O7  | Should each app have a list of allowed link hosts for its cards?                                                                                                      | Yes, add it when the second app joins.                                                                                                   |
| O8  | Edition size (48 cards a day) and the 04:00 turnover.                                                                                                                 | Keep both; review after two weeks of real use.                                                                                           |
| O9  | Which apps does the Crown list: only live ones, or also the announced ones, faded?                                                                                    | Live ones first, announced ones faded with "coming soon", matching the Do panel decision.                                                |
| O10 | Gold text in dark mode on Central (the reference defines `#836100` for light paper only).                                                                             | Do not use gold text on Central until decided.                                                                                           |
| O11 | The short line after "Connect" on its cards (for example "Happening this week", "A place near you", "People serving nearby") is public copy. Who approves it?         | The founder approves one line per kind before Connect's publisher is switched on; the adapter takes them as options, so no code changes. |
| O12 | An item published during the day waits for the next edition (04:00), so that the order does not shift under someone scrolling. Is a wait of up to a day acceptable?   | Yes. It is what makes "all caught up" true. Revisit if contributors ask for same-day cards.                                              |
