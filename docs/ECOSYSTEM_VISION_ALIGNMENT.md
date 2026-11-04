# Ecosystem vision alignment: a draft (2026-11-04)

**Status: draft for the founder.** Nothing in here is decided except what the founder said in chat on 2026-11-04. The branch
`claude/citizens-vision-alignment-buqemr` holds the work this document describes; no pull request is open.

**Sources.** (1) The founder's website-revision conversation, exported 2026-11-04 (called "the conversation" below). (2) The
founder's screenshot of the new landing page ("the design"). (3) `apps/connect/VISION.md`. (4) The code: every claim about what
exists names where it was checked, and where something could not be checked it says so.

**The founder's two corrections** (they override anything in the conversation that says otherwise):

1. **Vision does not find needs.** It only serves the contributing organisations within the ecosystem.
2. **"Suggest a Need" is the Kingdom Projects feature Connect already has.** Its explanation belongs in explaining that feature.

---

## 0. The short version

**Done on the branch** (gates green; section 7 says what could not be run):

| What                                                                                                                                                                                                                | Where                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The 219.co.za/citizens front door rebuilt from your screenshot, with your conversation's copy: landing plus four content pages (ecosystem, how it works, our philosophy, get involved) and richer coming-soon pages | `apps/hub`                                                                                         |
| Kingdom Projects explained as "Suggest a need" inside Connect (header, button, composer, a short explainer, empty state, toasts)                                                                                    | `apps/connect/src/frontend/app/pages.jsx`, `store.jsx`                                             |
| VISION.md brought in line with your decisions (Learn replaces Equip, Move added, Vision's boundary, how Connect, Impact and Vision fit) and four plain errors fixed                                                 | `apps/connect/VISION.md`                                                                           |
| Your two corrections written down as **tests** that fail if the copy drifts                                                                                                                                         | `apps/hub/test/pages.test.tsx`, `apps/connect/src/__tests__/frontend/kingdomProjectsCopy.test.tsx` |

**Needs your eye first** (details in section 6): real photography for the front door; whether Learn keeps your 2026-11-01 wording or
takes the conversation's wider one; and whether the front door may go live on merge, since its wording is yours to review.

**The one idea worth keeping in mind:** the need → hero loop is the least-built half of Citizens (VISION.md's third pillar), and
Kingdom Projects already holds its first steps. The next gains come from _deepening that one feature_, not from building a second
one (section 4.2, KP-2).

---

## 1. The intent, as the code now has to carry it

Seven platforms, each a set of verbs, **three environments** doing the structural work:

| Environment | Role (the conversation, section 7)                                                                                   | In the code today                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connect** | Public discovery, community needs, suggestions, participation. Outward-facing.                                       | Built. Needs surface through **Kingdom Projects**.                                                                                                         |
| **Impact**  | Collaboration, resource mobilisation, coordinated community initiatives.                                             | Not built. Its first steps (Proposed, Agreed, Launched) already work inside Kingdom Projects; **Funded** is what Impact adds.                              |
| **Vision**  | Internal organisational management, monitoring, intelligence, impact measurement. Supports organisations throughout. | Built. Code has **no need-finding** (checked: the only "need" in its product code is an advisory "needs your attention" about an organisation's own data). |

Other points from the conversation that shape the work: the Citizens Central directory sits **inside Connect** (no new app); the site
should say plainly what is **operational, under development or planned**; non-financial contributions (equipment, expertise, manpower,
facilities, network access) count in Impact; the site should communicate that Citizens is a place of **sustainable mutual value**, not
only charity (the economic model itself is not built: M1 and A4 in the pipeline are parked).

---

## 2. Focus 1: our own vision alignment

### 2.1 An honest grade, using VISION.md's own self-prompt

Legend: ● strong, ◐ partial or not yet, ○ gap, `n/a` the question does not apply. "Not audited" means I did not read enough to grade.

| Self-prompt question                                      | Connect                                                                                                                                                                                                                            | Vision                                                                                         | Wear                                                                                                                 | Front door                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1. **Mutual discovery** (citizen finds org, org is found) | ● map, Kingdom Discovery, listing automation, Apply wizard, "Open to collaborate" (C41)                                                                                                                                            | `n/a` it serves organisations; adoption is unproven (**V4**: no real organisation linked yet)  | ◐ brands and Concepts; its Connect link runs on a **mock client in production** (journal 2026-11-03)                 | ● every platform findable in one place             |
| 2. **Connection to real need**                            | ◐ Kingdom Projects and Let's work; but a vote is the only way to help (see KP-2)                                                                                                                                                   | ◐ measures an organisation's response; **cannot yet be tied to a Kingdom Project** (see VIS-1) | ◐ Concepts (propose, claim, royalties) is the same pattern for clothing; no tie to community need                    | ● Impact page shows which steps work today         |
| 3. **The small are honoured**                             | ● `recompute_map_prominence` is a saturating log with a fairness floor and a newcomer boost (migration 119); Kingdom Discovery is deliberately unranked; small follower counts are hidden (P2-08); a _Small Volunteer_ tier exists | not audited                                                                                    | ● by design in `docs/VISION.md`: no like counts by default, chronological, no leaderboards (not re-verified in code) | ● no platform is made to look bigger than it is    |
| 4. **Kingdom-clear**                                      | ● slogan, crown, Scripture; vocabulary now says "Suggest a need" on the screen                                                                                                                                                     | ● login copy: "the intelligence layer for your organisation"; boundary holds in code           | ● "Kingdom Clothing. No Algs. No Fluff. No Exclusion."                                                               | ●                                                  |
| 5. **Excellence as stewardship**                          | ● 2,874 unit tests; ◐ performance advisor debt (S6), never run on a real phone (A8)                                                                                                                                                | ◐ `ADMIN_GUIDE.md` is out of date (V5); not otherwise audited                                  | ◐ no checkout (M1 parked)                                                                                            | ● 163 tests, AA contrast from the CSS, zero script |
| 6. **Intuitive service**                                  | ◐ Add-to-calendar **exists as an API route but no screen uses it**; no ecosystem links inside Connect (C50); "Join" on the front door lands on the map, not a sign-up                                                              | ◐                                                                                              | ◐                                                                                                                    | ◐ no photos yet; no share preview image            |

**What is plainly true:** the structure matches the vision well, and the small-are-honoured rule is built into the ranking maths, not
just stated. **The honest gap** is the _depth_ of the need → hero loop, and **reachability**: VISION.md promises that every platform
is reachable from inside every other, and today it is not (C50).

### 2.2 Gaps, ranked

1. **The need → hero loop stops at a vote.** People can say "I'd collaborate" but not _how_ (time, skills, a venue, equipment). That is
   exactly the non-financial contribution the conversation says Impact must recognise. (Section 4.2, KP-2.)
2. **The apps are not reachable from each other** (C50). One small shared "ecosystem" entry in each app's account menu closes it. (ECO-1.)
3. **Vision cannot show an organisation's response to a community need**, and has no real organisation yet (V4). (VIS-1, VIS-2.)
4. **Wear says "social platform" where the conversation says "collaborative marketplace",** and shows mock data in production. (WEAR-1, WEAR-4.)
5. **Cheap Connect wins:** a visible Add-to-calendar button, a Join deep link, a share preview image (C42). (CON-1 to CON-3.)
6. **Brand assets:** real community photography, an Open Graph image, the final crown file as one shared source. (Section 3.)

### 2.3 VISION.md: what changed, and what is still yours to decide

Changed (two separate commits, easy to revert): Matthew 25:25 corrected to **25:40**; "each each" and "Chrsitian" fixed; the second "5." of the
self-prompt is now "6."; the ecosystem list now has Learn (first called Equip) and Move, Vision's boundary in your words, Impact's
growth out of Kingdom Projects, and a short "How Connect, Impact and Vision fit" paragraph; the third pillar now names Kingdom Projects.

Left for you:

- **Ephesians 2:19-21 or 2:19-22?** VISION.md quotes verses 19 to 21; the conversation's copy and RESUME_HERE say 19 to 22. The site quotes the
  VISION.md text verbatim and cites "2:19-21" under the quote, and uses "2:19–22" only in the conversation's own sentence. Pick one.
- **The Learn scope** (section 6, decision 2).

---

## 3. Focus 2: the 219.co.za/citizens website

### 3.1 What was built, against the conversation

| Conversation                  | Where it is                                                                                                                                                                           | Notes                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.0 Hero and what Citizens is | Landing hero (headline, "Discover. Participate. Belong.", two calls to action) and the three-line introduction                                                                        | Layout from the design                                                                                                                          |
| 5.1 The ecosystem             | The seven angled tiles on the landing; `/citizens/ecosystem` (one section per platform)                                                                                               | Tile verbs are the design's pairs; the page has the conversation's triples and descriptions                                                     |
| 5.2 How it works              | `/citizens/how-it-works` (five steps, "Who does what", Kingdom Projects)                                                                                                              | Platform chips link on                                                                                                                          |
| 5.3 Our philosophy            | `/citizens/philosophy` (beliefs, foundation, Scripture, "Stronger together", words we use)                                                                                            |                                                                                                                                                 |
| 5.4 Get involved              | `/citizens/get-involved` (five audiences, each with doors that exist today)                                                                                                           | Every door is checked against Connect's route table                                                                                             |
| 5.5 Closing                   | The closing strip on the landing; the closing block on the philosophy page                                                                                                            |                                                                                                                                                 |
| 6 Design direction            | 60/30/10 ✓, minimal ✓, hover or focus on a tile reveals the platform's purpose (wide screens with a pointer) ✓, animated connection lines in the diagram (off under reduced motion) ✓ | **Not done:** real community photography (yours to supply); the rotating hero words (the static line is kept; a CSS-only rotation is an option) |
| 6 Navigation                  | The design's three menus plus search and Join carry the conversation's six destinations                                                                                               | Explore, Get involved, About                                                                                                                    |
| 7 Architecture                | "Who does what" and the Kingdom Projects explainer                                                                                                                                    | Vision's row says nothing about needs                                                                                                           |

**Honesty built in.** Every platform is labelled; the four unbuilt ones say "Coming soon" in words. "What you can do today" lists only
what the code does (checked; for example Wear is **not** described as a shop, because it has no cart or checkout). The Impact page
shows **Proposed, Agreed, Launched** as working in Kingdom Projects and **Funded** as "Comes with Impact".

**The diagram has six nodes and no eye** (as in your design). That is now deliberate and documented: Vision is internal and supports
organisations throughout, so it is not one of the "parts to play". Tell me if you wanted it shown.

### 3.2 What is still needed before it should go live

1. **Your read of the wording.** All of it is in one file, `apps/hub/src/lib/content.ts`, with each block's source named. The site is
   live, so a merge changes 219.co.za/citizens straight away.
2. **Photography.** The design shows real people. Send licensed or consented photos (hero plus one per platform if you like) and the
   slots are ready (`HERO_PHOTO`, `photo` on a platform): a one-line change each. I did not use the AI-generated photos in the
   screenshot; they are not ours to ship and the people in them are not real.
3. **An Open Graph share image** (so a WhatsApp link to 219.co.za shows a picture) and the **final crown file** as a single shared source
   (today it is a byte-identical copy in three places; `packages/ui/CrownMark.tsx` calls itself a placeholder).
4. After merge: open `/citizens`, `/citizens/ecosystem`, `/citizens/impact`, and one proxied path such as `/citizens/connect` to confirm the
   hub's rewrites are untouched (they were not edited).

---

## 4. Focus 3: Connect, explanation and visual representation

### 4.1 Done: Kingdom Projects as "Suggest a need"

The screen keeps its name (the page title, the Let's link and the e2e depend on it) and now explains itself: _See a need in your community?
Suggest it and let others rally around it. People vote to collaborate until the goal is reached (larger ideas reviewed by an admin first).
It becomes a Kingdom Project, everyone who voted is told, whoever suggested it leads it, picks the kickoff date, and the voters are
connected._ Every claim is checked against migrations 130 and 132 by a test.

### 4.2 Proposals, in the order I would do them

| ID        | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why (vision link)                                                                                                                                | Size            | Needs your yes                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| **KP-2**  | **Deepen Kingdom Projects instead of building a second "needs" feature.** (a) The composer sends a **location** (the table and read function already carry optional latitude and longitude; the form never sets them) and **photos** (a place to look at, evidence of the need). (b) A vote becomes a **pledge with a type**: time, skills, venue, equipment, network, funds (the conversation's non-financial contributions). (c) "Where to serve" (C40) opens Kingdom Projects. | The need → hero loop (VISION.md pillar 3); the conversation's "Suggest a Need" thought, in the feature that already exists; the bridge to Impact | M–L             | **Yes: a migration** (pledge type, photos). Reshapes **C46** from "a new needs table" to this |
| **ECO-1** | An "ecosystem" entry in each app's account menu: the hub, Connect, Vision, Wear, from `@citizens/ecosystem`                                                                                                                                                                                                                                                                                                                                                                       | VISION.md: "reachable from inside every other application" (C50)                                                                                 | S per app       | No                                                                                            |
| **CON-1** | Show **Add to calendar** on an event (the iCal route exists; nothing calls it)                                                                                                                                                                                                                                                                                                                                                                                                    | The conversation's "calendar integration"                                                                                                        | XS              | No                                                                                            |
| **CON-2** | A **Join** deep link from the front door that opens sign-up, not the map                                                                                                                                                                                                                                                                                                                                                                                                          | Intuitive service                                                                                                                                | XS              | No                                                                                            |
| **CON-3** | Per-listing **share preview** (C42; the app is one static page, so a link probably shows a generic card: check with a share debugger first)                                                                                                                                                                                                                                                                                                                                       | "Shareable invitation packages"                                                                                                                  | S–M             | No                                                                                            |
| **CON-4** | One **vocabulary**: _Kingdom Project_ (the thing), _Suggest a need_ (the verb), _Let's…_ (gatherings), _Contributor_; retire "Impact Idea" from screens (it can stay in code)                                                                                                                                                                                                                                                                                                     | Kingdom-clear                                                                                                                                    | XS              | No                                                                                            |
| **CON-5** | The design's visual language (slanted slabs, the verbs, the crown) on Connect's first-run and Explore, **map first** as ever                                                                                                                                                                                                                                                                                                                                                      | One coherent environment, not seven apps                                                                                                         | M, design first | No                                                                                            |

### 4.3 What the conversation lists as "established" Connect vision, and what exists

Interactive map ✓, category-coloured markers ✓, search and filters ✓, event details, photos and contributor profiles ✓, following ✓,
announcements (broadcasts and Moments) ✓, attendance and consideration (Connect or Consider) ✓, notifications ✓, **calendar** ◐ (route, no
button), **Q&A on events** ○ (nothing found in the code), **comments** ◐ (a comment count feeds the prominence score, so some exist; not audited), **shareable invitation
packages** ◐ (sharing exists; preview is C42), **commitment and payment** ○ (future; Members Only events C56 is the nearest).

---

## 5. Focus 4: Vision and Wear

### 5.1 Vision (serves the contributing organisations; does not find needs)

**Explanation.** Say it the conversation's way on its login and empty states: _Understand. Coordinate. Measure._ The private workspace of
the organisations contributing to the Kingdom. (Today's login line, "the intelligence layer for your organisation", is already on-side.)
**Guard it:** the hub's tests now fail if Vision copy says it finds, discovers or identifies needs.

**Visual.** Use the crown and the verbs; make Vision's own principle visible, the five-layer law (conclusion first, then contributions, evidence,
charts, raw data), because it is what makes it different from a dashboard.

| ID        | Feature suggestion                                                                                                                                                                    | How it respects the boundary                                                                                                                                                       | Size |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **VIS-1** | **Respond to a Kingdom Project.** An organisation links a Vision project to a Kingdom Project and measures its own outcome                                                            | Vision never _finds_ the need: the community surfaced it in Connect; Vision only tracks the organisation's response. Cross-app data goes through Connect's `/api/v1` (contract R2) | M    |
| **VIS-2** | **Adoption path.** After a Contributor listing is approved in Connect, offer "Open your Vision workspace" (V4, C10)                                                                   | Serves organisations that are already in the ecosystem                                                                                                                             | S–M  |
| **VIS-3** | **Honest empty states**: an organisation with no data sees what it will see, never invented insight                                                                                   | Truth in labelling                                                                                                                                                                 | S    |
| **VIS-4** | Exports for funders (V3, parked). Connect already has a **funder-facing PDF** (it includes the Kingdom Projects a Contributor leads): the hand-off between Connect, Vision and Impact | The conversation's "reporting"                                                                                                                                                     | M    |

### 5.2 Wear

**Explanation.** The conversation's Wear is a **collaborative marketplace** (brands, designers, customers; brands collaborate and support
community initiatives). The README and tagline say "Christian clothing social platform". Move the framing, keep the anti-vanity promise.
What the code supports today: follow brands, posts and stories, brand applications, the **Concepts** flow (propose, claim, royalties). **Not
built:** checkout (M1), brand-to-brand collaboration, community-project and upliftment recognition.

| ID         | Suggestion                                                                                                                                                                                  | Size  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **WEAR-1** | Reword Wear's landing, sign-in and README to the "collaborative marketplace" language (no claim of shopping)                                                                                | XS    |
| **WEAR-2** | **A Concept attached to a Kingdom Project** (for example merchandise that funds a clean-up): reuses the Concepts engine and Kingdom Projects; it is where Wear touches community upliftment | M     |
| **WEAR-3** | **Co-drops** between brands, reusing Connect's co-host pattern (P2-09)                                                                                                                      | M     |
| **WEAR-4** | **Fix the mock-data gap before promoting Wear** (it runs on its mock Connect client in production; A3, A15). The front door's Wear tile says "Open", so this matters                        | S     |
| **WEAR-5** | A **contribution badge** for brands that deliver Impact steps (needs Impact first)                                                                                                          | later |

### 5.3 One pattern, three faces

Kingdom Projects (propose, rally, launch), Wear Concepts (propose, claim, reward) and the coming Impact (proposed, agreed, funded, launched)
are one idea: **someone proposes, others rally or claim, it launches.** Keep the vocabulary and the visual language of the three aligned now;
decide later whether they share a component or a data model. Not before Impact is designed.

---

## 6. Decisions I need from you

1. **Front door: may it go live on merge?** Its wording is in `content.ts`; the file's own rule is that you review it. I did not open a pull request.
2. **Learn.** Your 2026-11-01 decision: "Christian courses, teachers and all learning material". The conversation widens it (practical skills,
   training, mentorship, career preparation). The registry line (courses, teachers, material) stays on the page; the conversation's text sits
   beside it. Keep both, or replace the registry line?
3. **Impact wording.** The conversation's Impact copy says "identify challenges". If needs must only _originate_ in Connect, say
   "respond to the needs Connect surfaces". Leave as written, or change?
4. **Ephesians 2:19-21 or 19-22** (section 2.3).
5. **Photography:** who supplies it, and may I use illustrations meanwhile?
6. **KP-2** (location, photos, typed pledges): yes to a migration proposal, and does it replace C46?
7. **Vision in the diagram:** keep it out (as designed), or show it as the ring around the other six?
8. **The rotating hero words** (Discover, Participate, Contribute, Collaborate, Belong): worth adding?

## 7. Verification, and what could not be run

Ran and green: the hub (format, lint, typecheck, 163 tests including mutation checks that prove the copy guards can fail, production
build of 11 pages, and a real-browser check of the menus, hover and focus states, phone and desktop, with no CSP errors); Connect
(typecheck, lint with **0 warnings** after removing one dead local, the frontend build compiling all 54 screens, **2,874 unit tests**, plus the
new Kingdom Projects test and its mutation checks).

**Could not run here:** Connect's **e2e suite**. Its React, Babel and Tailwind come from public CDNs that this sandbox blocks (even
untouched tests fail the same way). The existing `/community` and Let's e2e tests are for CI. No test was added that I could not run.
The hub is not deployed from this branch, so no live URL was checked. No migration was written or applied; no Vercel, DNS or Supabase setting
was changed.
