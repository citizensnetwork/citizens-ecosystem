# Citizens Connect — Strategic Direction & Vision
### Produced from planning session · May 23, 2026
### For use as context in future AI sessions and planning conversations

---

> *"You are no longer strangers and foreigners, but fellow citizens."*
> — Ephesians 2:19

---

## HOW TO USE THIS DOCUMENT

Paste this at the start of any new planning or development session. It captures the strategic clarity reached in a deep questioning session on May 23, 2026 — covering who the platform is for, why it exists, the immediate launch opportunity, post-launch roadmap, ecosystem vision, and the honest assessments of likelihood and risk at each stage.

This is not a technical spec. For technical direction, see `.github/MASTER_DIRECTION.md`. This document answers the *why* and *who* behind every build decision.

---

## PART 1 — STRATEGIC CLARITY (what was resolved)

### 1.1 Who is the primary user?

**Any Christian wanting to engage in the Christian world.** This is an insider product. The target user already identifies as part of the Christian community and is looking to find events, organisations, places, and people within that world — a church run, a social gathering, an outreach, an educational course, something for their kids, a place to serve, a market, a community to belong to.

This means:
- The "Connecting the Kingdom" language, the Ephesians reference, the category naming — all of this is appropriate and does not need to be softened for a non-Christian landing.
- Non-Christians discovering the platform are a welcome secondary byproduct, not the design centre.
- The UX should assume familiarity with Christian community life, not explain it.

### 1.2 Who is the primary contributor (and why)?

**Organisations — specifically non-profits, ministries, NPOs/NGOs — that are unknown or under-visible.** The deeper motivation behind Citizens Connect is this: the Christian community in South Africa is scattered and divided. Thousands of organisations are doing meaningful work — equipping, serving, educating, caring — and most people never find them. The platform exists to change that.

Contributors are primary in the sense that **they create the content that makes the platform valuable**. Citizens are primary in the sense that **they are the reason contributors want to be on the platform**. These are not in conflict — the dynamic is genuinely bilateral. Each serves the other, which reflects the Kingdom principle that every part of the body needs and serves every other part.

The contributor value proposition (in priority order of immediate relevance):

1. **Visibility today** — A clean, professional public presence on a map. An org that currently exists only on a fragmented Facebook page and a WhatsApp group gets something real immediately, regardless of user count.
2. **A dedicated Christian community platform** — Unlike Instagram or Eventbrite, every user here is specifically looking to engage in Christian activity. The audience is pre-qualified.
3. **Communication tools** — Broadcast updates to RSVP'd attendees, one-way event feed, direct reach to people who said they're coming.
4. **The social proof loop** — Friend nudging (Consider/Convince), friend-attending notifications, social RSVP visibility. Over time, this drives organic attendance in a way no newsletter can.
5. **Ecosystem depth** — As Citizens Vision, Wear, and other channels launch, contributor data and profiles will surface across the ecosystem, deepening their reach and integration into the broader Kingdom community infrastructure.

### 1.3 The geography question

**Go deep in Pretoria first.** The platform's seeded data, the Whole City Initiative relationship, and the first org contacts are all Pretoria-centred. A map that feels alive and dense in one city is more compelling than thin national coverage. The goal for launch is: a Christian in Pretoria opens the app and feels like there is *a lot* happening near them.

Cape Town and Johannesburg follow once Pretoria has critical mass. The platform is architecturally national and the seeded data already includes Cape Town orgs (CRC, U-Turn) — but the content seeding strategy and contributor outreach should be Pretoria-first.

### 1.4 How Christian does it need to be?

Fully. This is not a general community events platform with Christian content. It is a Christian community platform. The language, categories, visual identity, and tone should all reflect that without apology. The slogan *Connecting the Kingdom* is the right framing.

The "open to seekers" dimension is real but secondary — it happens organically when a non-Christian is invited by a friend. It does not need to be designed for at the UX level at launch.

---

## PART 2 — THE WHOLE CITY INITIATIVE OPPORTUNITY

### 2.1 What it is

The **Whole City Initiative (WCI)** is an operational coalition of non-profits and organisations in Pretoria with the explicit aim of uniting organisations that educate, equip, aid society, and attract funders. It has an active board and is currently in development. Its vision aligns almost word-for-word with Citizens Connect's contributor value proposition.

A product of the WCI is the **Whole City Talks** — a recurring gathering of NPO leaders for strategic networking and learning. The next session is:

- **Date:** Tuesday, 9 June 2026
- **Time:** 09:30 – 12:00
- **Location:** Apollo Building Floor 1, POPUP Tshwane Central, 210 Du Toit Street, Pretoria
- **Topic:** "Mastering ecosystem influence and volunteer mobilisation"
- **RSVP deadline:** Friday 29 May 2026
- **Contact:** jani.bravenboer@popup.co.za

Stephen has a personal relationship with **Emile Reubenheimer**, the director of POPUP and the WCI, who has already seen Citizens Connect and whose idea sparked Citizens Vision. This is not a cold room.

### 2.2 Why this matters strategically

The WCI is Citizens Connect's **beachhead**. It is:
- The exact audience the platform was built to serve (NPO and ministry leaders)
- Already organised around the same mission (cross-sector coordination, societal impact)
- Gathering in a room where Stephen may present the product
- Connected to organisations already seeded on the platform (POPUP is one of the 6 seeded orgs)

The session topic — "mastering ecosystem influence and volunteer mobilisation" — is not adjacent to Citizens Connect's value proposition. It *is* Citizens Connect's value proposition.

### 2.3 Target organisations for first onboarding

These are the first organisations to approach, in rough priority order:

| Organisation | Type | Why now |
|---|---|---|
| POPUP Skills Development Center | NPO / Education | Hosts the WCI, Emile relationship, already seeded |
| U-Turn Homeless Ministries | NPO / Care-Recovery | Already seeded, strong profile, recognisable Cape Town org |
| Ellel Ministries South Africa | Ministry / Healing | Already seeded, established presence |
| Every Nation Mooikloof | Church / Ministry | Already seeded, multiple EN campuses possible |
| Derek Prince Ministries SA | Ministry / Teaching | High-profile, national reach, adds credibility |
| Hope Recovered Library | NPO | Unique niche, story-driven, visual appeal on map |
| Basadi Ba Moshito Foundation | NPO / Community | Pretoria-based, community development sector |
| KingInMe Soccer Academy | NPO / Youth-Sports | Youth category, visible community activity |
| Rooted Market | Business / Market | Adds the markets-expos category, accessible entry point |

### 2.4 The two-sentence pitch for the WCI room

**For the NPO leader:** "Citizens Connect is the platform where every Christian organisation in Pretoria is visible on a map — so anyone in the city looking to serve, give, attend, or connect can find you, not just the people who already follow you on Instagram."

**For the WCI board specifically:** "We're building the infrastructure layer that lets organisations like yours coordinate publicly — events, updates, community engagement — so the WCI's vision of unified city transformation has a digital home."

---

## PART 3 — PLATFORM CURRENT STATE (May 23, 2026)

Citizens Connect is at **MVP+ level** — functionally complete across all core journeys. Below is an honest summary of what works and what doesn't on the deployed site.

### 3.1 What is fully working

- Full-screen map with event/place markers, progressive geo-clustering, temporal encoding
- 17 event categories, 10 place categories
- Quick-action popup (View, Join, Consider, Share, Visit)
- Event detail, place detail, organisation profile — all as right-side panels
- Contributor signup, application, admin approval flow (fixed in Batch 11/12)
- Organisation profiles at `/c/[slug]` with upcoming events, past events, gallery, follow button
- Organisation search (typo-tolerant via pg_trgm)
- RSVP (attending / considering), with friend attendance badges
- Consider → Convince mechanic (full implementation)
- Broadcast updates (contributor posting interface + citizen read feed + realtime)
- In-app notifications (bell, panel, preferences)
- Direct messaging
- Social following (people and places)
- Billing foundation (event counter, bill preview, trial period — PayFast deferred)
- Admin panel: applications, users, categories, tags, audit log
- Security: RLS throughout, rate limiting, CSP headers, 2FA (phone OTP), indemnity gates
- Glass-overlay calendar (replacing FullCalendar)
- Capacitor wrapper (iOS/Android scaffold)
- 703 tests passing, 0 TypeScript errors, lint clean, 0 Supabase security advisor errors

### 3.2 Seeded data (live on deployed site)

- 6 real contributor organisations with profiles
- 30 events across those orgs
- 50+ places across Gauteng, Western Cape, Eastern Cape

### 3.3 Single most urgent fix before June 9

**T4 — MapTiler environment variables missing from Vercel.**

The map on the deployed site (`citizens-connect.vercel.app`) currently renders a generic OSM raster fallback instead of the custom branded "Kingdom Commons" style. This is a 10-minute fix.

**Steps:**
1. Go to Vercel dashboard → Project → Settings → Environment Variables
2. Add for Production, Preview, and Development:
   - `NEXT_PUBLIC_MAPTILER_KEY` = `vopPYlm4eVtmPRVUBjK8`
   - `NEXT_PUBLIC_MAPTILER_STYLE` = `019dba0f-b49b-73bb-bf6a-f9d820f43be8`
3. Redeploy

This single change transforms the visual impression of the platform completely. It is the highest-priority action before June 9.

### 3.4 Remaining audit items (not blocking the presentation)

The following security/quality audit surfaces are still pending but do not block the demo:

- **P3 place-create-edit-media** — length CHECKs, 6-month delete trigger, native-confirm → ConfirmModal
- **P4 messaging-dm** — `.maybeSingle()` parity, PATCH /read rate-limit, GET /messages limit NaN guard
- **P5 notifications** — bell revert on error, per-user realtime channel
- **P6 map-core** — LocationPicker AbortController + privacy disclosure

These can be batched and applied after June 9 in normal development rhythm.

---

## PART 4 — JUNE 9 PREPARATION PLAN

### 4.1 What is needed (and what is not)

**What must be done before June 9:**

| # | Action | Owner | Effort | Status |
|---|---|---|---|---|
| 1 | RSVP to Whole City Talks (deadline: May 29) | Stephen | 5 min | ⚠️ URGENT |
| 2 | Fix MapTiler env vars in Vercel (T4) | Stephen | 10 min | ⚠️ Urgent |
| 3 | Polish POPUP Skills Development profile on deployed site | Dev | 1–2 hrs | Pending |
| 4 | Verify all 6 seeded org profiles are clean and complete | Dev | 2–3 hrs | Pending |
| 5 | Rewrite landing page copy for NPO audience | Dev/Stephen | 3–4 hrs | Pending |
| 6 | Confirm contributor application → admin approval flow works end-to-end on deployed site | Stephen | 30 min | Verify |

**What must NOT be done before June 9:**

- Monorepo migration (high risk, zero presentation value — do it after June 9)
- Citizens Vision development (not demo-ready, describe it in words instead)
- Any new feature development (frozen except for demo polish)
- PayFast integration
- Wear planning

### 4.2 How to present Vision at the meeting

Vision is not demo-ready. Do not show it. Describe it in one confident sentence:

> "We're building a companion intelligence layer called Citizens Vision — so every organisation on the platform can see their community impact in real time: event attendance trends, community engagement, reach across the city."

This is more powerful than showing an unfinished dashboard. It lets the WCI audience imagine what it could be.

### 4.3 Landing page copy direction

Current landing page likely speaks generic event-discovery language. For the WCI audience, rewrite around these ideas:

- **For organisations:** "Your events. Your community. Visible to every Christian in Pretoria looking to serve." / "Stop being unknown. Every believer looking to engage should be able to find you."
- **For the city vision:** "Citizens Connect is the platform where Pretoria's Kingdom community makes itself visible — where what God is doing becomes discoverable, connectable, and participable."
- **The ask:** "Apply to be a Contributor — it's free for your first 3 months."

### 4.4 Demo flow (if presenting live)

1. Open `citizens-connect.vercel.app` on a device (ideally a phone or large screen)
2. Show the map of Pretoria with live event and place markers
3. Tap POPUP's marker → show the quick-action popup → tap View → show POPUP's event detail
4. Tap POPUP's organiser name → show POPUP's organisation profile (upcoming events, gallery, follow)
5. Show the "Where to Serve" concept (either built or described as coming) — filter that finds volunteer opportunities
6. Open the search bar → switch to Organisations tab → search "POPUP" → show typo tolerance
7. If time: show the contributor dashboard (event posting, broadcast update, bill preview)

---

## PART 5 — POST-JUNE 9 ROADMAP

### 5.1 Immediate post-WCI priorities (June–July 2026)

Assuming the WCI presentation generates interest from 3–5 organisations wanting to join:

1. **Onboard WCI orgs** — Work with interested organisations to create their contributor profiles, seed their events and places. Do this manually and personally. The first 10 contributors are too important to leave to self-serve.
2. **Complete remaining audit surfaces** — P3, P4, P5, P6 from the audit queue. These are the quality and security polish needed before real public users arrive.
3. **Push notification delivery (Phase 22)** — FCM/APNs credentials needed. Infrastructure is built; this is just credential wiring. Essential once real users are RSVPing to real events.
4. **"Where to Serve" filter** — Add a dedicated filter that surfaces contributor events and locations with a volunteer/service angle. This is one of the clearest differentiators from generic event apps and speaks directly to the Kingdom-serving instinct.
5. **Landing page for real** — The WCI presentation will expose what the landing page needs to say. Rewrite it based on the feedback from that room.

### 5.2 Content seeding strategy (Pretoria-first)

The goal for Pretoria: density. Enough events and places on the map that any Christian in Pretoria who opens the app on a given weekend sees multiple things happening near them.

**Phase 1 target (Pretoria):** 15–20 active contributor organisations, 50+ events per month, 100+ places.

Approach for each new contributor:
- Personal outreach (not a sign-up form) — call or meet the director/pastor/manager
- Walk them through creating their profile together
- Help them post their first 3 events
- Follow up 2 weeks later to see what's working

**Potential ChurchSuite integration:** Doxa Deo and other large churches already manage events on ChurchSuite. Citizens Connect is not a competitor to ChurchSuite (which is internal admin software). Positioning Citizens Connect as the public-facing discovery layer that complements tools orgs already use removes an objection before it's raised. A future integration that pulls public ChurchSuite events onto the Citizens Connect map would dramatically accelerate content seeding in new cities.

### 5.3 Geography expansion (July–September 2026)

Once Pretoria has critical mass:
- **Cape Town** — CRC and U-Turn are already seeded. Stephen has contacts. Launch with 10 Cape Town contributors targeted through personal outreach.
- **Johannesburg** — Similar approach, starting with EN Joburg and WCI-adjacent organisations.

The goal is not thin national coverage. It's one city at a time feeling genuinely alive.

### 5.4 Monetisation activation (Q3 2026)

The billing foundation is built. The first 3 months are free for every contributor. This means:
- Orgs onboarded in June 2026 → billing starts September 2026
- PayFast integration needs to be wired before September

Pricing tiers (already in the DB):
- Individual / Small Brand: R30 per event
- Medium Organisation (50–500 members): R150 per event
- Large Ministry / Corporate (500+): R250 per event

At 20 active Pretoria contributors averaging 4 events/month at R30–R150 each, monthly recurring revenue in the R2,400–R12,000 range is achievable within 6 months of launch. This is modest but covers operational costs and proves the model.

### 5.5 Mobile app launch (Q4 2026)

The Capacitor scaffold (iOS/Android) exists. Once the web platform has real active users and content, the mobile app becomes the priority. App store submission requires:
- Apple Developer Program enrollment (R1,950/year)
- App Store Connect setup
- Final Capacitor build and submission review

The mobile app is not blocking the WCI presentation or early web launch. Do not rush it before the platform has users.

---

## PART 6 — CITIZENS ECOSYSTEM VISION

### 6.1 What Citizens is

Citizens is not just an app. It is an ecosystem of connected platforms serving different dimensions of Kingdom community life, all sharing a single identity infrastructure (profiles, auth, Supabase) and design system.

**The vision:** every dimension of Christian community life — discovering events, tracking impact, learning, fashion expression, community change projects, social connections — served by a dedicated platform, all unified under the Citizens identity.

**The principle:** every part of the Body of Christ needs representation and serving — and can serve other parts through their participation. Each channel is built for a specific sector of the Kingdom but contributes to the whole.

### 6.2 The channels (current and planned)

| Channel | Status | Purpose |
|---|---|---|
| **Citizens Connect** | MVP+ shipped, pre-launch | Map-first community discovery — events, places, organisations |
| **Citizens Vision** | Early development (30 commits) | Intelligence and impact tracking for contributor organisations |
| **Citizens Wear** | Planned (was the original demand) | Fashion platform for Kingdom-aligned brands and individuals |
| **Citizens Learn** | Planned | Education directory — courses, equipping, skills development |
| **Citizens Impact** | Planned | Community change projects — ideas, crowdfunding, implementation |
| **Citizens Social** | Planned (Phase 6) | Relationship building and deeper community connection |
| **Citizens Play** | Planned (Phase 4) | Event tools and community activities |

### 6.3 Connect + Vision as the launch pair

The plan is to launch Citizens Connect and Citizens Vision simultaneously, or at minimum to announce them together at the WCI. The reason: large organisations and funders need to see that joining the platform comes with intelligence and accountability infrastructure, not just a listing. Vision is the answer to the question "what do I get back from being on this platform?"

Vision's core value proposition to contributors:
- Event attendance trends over time
- Community engagement metrics (follows, RSVPs, considers, broadcast reach)
- Geographic reach across the city
- Comparison to sector averages (how does your engagement compare to similar organisations?)
- Funder-facing reports: evidence of community impact

Vision is not demo-ready for June 9. But it should be described clearly in the presentation as the intelligence layer that makes Connect's data valuable.

### 6.4 Why Wear was the original demand

Citizens Wear was the original catalyst that brought Stephen to this vision — a fashion platform for Kingdom-aligned brands (Christian clothing labels, ethical fashion, community-rooted designers). It will eventually be the most commercially active channel in the ecosystem.

The sequencing reason for building Connect first: Connect is the community infrastructure that all other channels depend on. Shared auth, shared profiles, shared map, shared org directory. Wear needs a community of real users and organisations before it can function as a marketplace. Connect must come first.

Wear should begin its dedicated planning session after the WCI presentation and the first wave of Pretoria contributor onboarding — likely August/September 2026.

### 6.5 The monorepo (do not do before June 9)

The three repos (citizens-connect, citizens-vision, citizens-wear) need to migrate to a single Turborepo monorepo before Wear is built. The plan exists (`docs/MONOREPO_PLAN.md`). Do not execute it before June 9. Execute it in clean conditions after the WCI presentation, as the first engineering step before Wear begins.

Target monorepo structure:
```
citizens/
├── apps/
│   ├── connect/
│   ├── vision/
│   └── wear/       ← starts fresh here
├── packages/
│   ├── ui/         ← shared design system
│   ├── auth/       ← shared Supabase auth
│   ├── database/   ← shared TypeScript types
│   ├── config/     ← shared ESLint/TS/Tailwind
│   └── utils/      ← shared helpers
└── turbo.json
```

### 6.6 The community change / Ideas feature (Citizens Impact layer)

One important future feature was described in this session: a mechanism for any user to "throw an idea into the air" — publicly proposing a community need or change project with an estimated agreement/participation range. Other users can support and vote for it, and if it gains traction, it can be turned into a real project with crowdfunding, CitizensPBO funding, or channelling to Citizens Impact members.

This feature sits at the heart of the long-term vision — decreasing division in the Christian community, enabling collaboration across sectors, and providing spaces where ideas can be heard, agreed upon, and acted upon.

**This is NOT a Citizens Connect feature at launch.** It belongs to Citizens Impact (a later channel) and possibly Citizens Social. Building it into Connect before Connect has proven its simpler discovery value would be premature. Note it for the Citizens Impact planning session.

---

## PART 7 — PROJECTIONS AND LIKELIHOOD ASSESSMENTS

These are honest estimates, not promises.

### 7.1 The WCI presentation (June 9, 2026)

**Likelihood of presenting:** High, given personal relationship with Emile and direct alignment with the session topic. RSVP by May 29 is the gating action.

**Likelihood of onboarding 3+ WCI-connected orgs within 30 days of presenting:** Moderate-High (60–70%). The value proposition is clear, the product is functional, and the audience is pre-qualified. The main risk is organisational inertia — "we'll do it later" is the most common outcome of presentations to busy NPO leaders.

**Mitigation:** Don't leave the room without booking a follow-up session with at least 2 organisations. Ideally, onboard POPUP live in the room or within 48 hours.

### 7.2 Pretoria reaching critical mass (15+ active contributors)

**Likelihood by end of Q3 2026 (September):** Moderate (50–60%), conditional on personal outreach effort. The platform does not grow passively — it requires Stephen to personally contact, pitch, and assist the first 15–20 organisations.

**The single biggest risk:** Building features instead of selling the product. The platform is functionally complete. Every week spent on new development is a week not spent in rooms with directors of NPOs and pastors. The next phase of growth is not technical — it is relational.

### 7.3 Citizens Vision being demo-ready (Q3 2026)

**Likelihood of a functional Vision dashboard by September 2026:** Moderate (50%), assuming sustained development focus. Vision is at ~30 commits. It needs: a real dashboard UI, data connections to Connect's Supabase project, contribution analytics (event counts, RSVP trends, reach), and a clean visual design.

The risk is scope creep — trying to build too much too early. Vision's MVP is a single dashboard showing 5 key metrics for one contributor organisation. That is achievable in 4–6 weeks of focused work.

### 7.4 PayFast billing activation (Q3 2026)

**Likelihood of billing active before September 2026:** Moderate-High (65%), contingent on completing PayFast merchant registration (T5 in MASTER_DIRECTION). The billing infrastructure is fully built — this is purely a credentials and integration task.

### 7.5 Mobile app live in app stores (Q4 2026)

**Likelihood by December 2026:** Moderate (55%), conditional on having real active users who are asking for the mobile experience. Do not rush the app store submission — it is better to launch with 50 active users than to submit an app with no community behind it.

### 7.6 Citizens Wear launch (2027)

**Likelihood of a functional Wear platform in 2027:** High (75%), assuming the monorepo migration happens cleanly and a dedicated planning session shapes the feature set. Wear has real demand behind it (it was the original catalyst). The risk is that Connect's growth consumes all available development time. Wear needs its own protected development sprint.

---

## PART 8 — KEY DECISIONS (LOCKED)

These decisions were confirmed or first reached in this session and should not be revisited without good cause.

| # | Decision | Reasoning |
|---|---|---|
| S1 | **Primary user = practicing Christian seeking engagement** | Insider product, not a seeker tool. Language and UX should reflect this. |
| S2 | **Primary contributor = unknown NPOs / NGOs / ministries** | The mission is making the invisible Kingdom visible. Orgs are the supply side. |
| S3 | **Geography = Pretoria-first, depth over breadth** | Critical mass in one city beats thin national coverage |
| S4 | **WCI = beachhead, June 9 = first real deadline** | The most concrete market signal we have. Do not miss this window. |
| S5 | **Vision = describe at WCI, don't demo** | Not ready. One sentence beats an unfinished dashboard. |
| S6 | **Monorepo = after June 9, not before** | High-risk migration should not happen before the most important presentation. |
| S7 | **First 10 contributors = personal outreach, not self-serve** | Too important to leave to a form. Onboard them manually and personally. |
| S8 | **Connect must prove discovery value before carrying coordination vision** | The community change / ideas feature belongs to Citizens Impact, not Connect at launch. |
| S9 | **Wear begins after monorepo migration** | Shared packages (ui, auth, database) must exist before Wear starts to avoid rebuilding what Connect already solved. |
| S10 | **ChurchSuite is complementary, not competitive** | Position Connect as the public discovery layer; ChurchSuite is internal admin. Potential future data integration worth exploring. |

---

## PART 9 — OPEN QUESTIONS (not yet resolved)

These were not conclusively settled in this session and should be revisited:

1. **"Where to Serve" filter** — Confirmed as a good addition, not yet specced or scheduled. Should be added to the feature backlog and built before or shortly after the WCI presentation. This is a clear differentiator that speaks directly to the Kingdom-serving instinct.

2. **ChurchSuite data integration** — The idea of pulling existing event/place data from ChurchSuite (used by Doxa Deo and others) was raised as a cold-start accelerator. Requires exploration: does ChurchSuite have a public API? Would Doxa Deo consent to data sharing? What are the legal/quality implications?

3. **Contributor Agreement** — The faith-aligned content standard that contributors agree to at signup (T9 in MASTER_DIRECTION) was not written. This needs to be drafted before real contributor onboarding begins — it is a brief, plain-language document that sets the tone for what belongs on the platform.

4. **Citizens Vision MVP scope** — Vision needs a dedicated planning session (similar to this one) before significant development begins. The core questions: What are the 5 metrics that matter most to an NPO director? What does the dashboard look like? How does it pull data from Connect?

5. **Wear feature spec** — Wear was the original demand. Its feature set, user profile, and design vision need their own planning session before the monorepo migration begins.

6. **Funder strategy** — The Citizens PBO structure suggests intent to attract philanthropic funding. This was mentioned but not explored. Who are the target funders? What does the pitch to a funder look like vs. the pitch to a contributor?

---

## PART 10 — TECHNICAL IMMEDIATE ACTION LIST

For the next development session (pick up from here):

### Before June 9 (in order of priority)

1. **RSVP to Whole City Talks** — jani.bravenboer@popup.co.za — deadline May 29 [STEPHEN, not dev]
2. **Fix Vercel env vars (T4)** — Add `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` to Vercel dashboard for Production + Preview + Development. Redeploy.
3. **Polish POPUP Skills Development profile** — This is the hosting org. Their profile on the deployed site needs to be the most complete: logo, cover image, description, upcoming events, social links, location.
4. **Verify all 6 seeded org profiles** — Walk through each profile on `citizens-connect.vercel.app` and confirm they look presentable. Fix any visual gaps.
5. **Rewrite landing page** — Replace generic event-discovery copy with language aimed at NPO leaders: visibility, community engagement, Kingdom infrastructure. Lead with the contributor value proposition.
6. **End-to-end demo walkthrough** — Stephen should walk through the full demo flow (map → event → org profile → search → contributor application → admin approval) and note anything that breaks or looks wrong.

### After June 9 (normal batch cadence from RESUME_HERE)

Resume from the next pending audit surface (`place-create-edit-media` is P3) and continue the batch execution order in `.github/MASTER_DIRECTION.md` Part 10.

The next queued batches after the audit surfaces are complete:
- **PayFast wire-up** — activate billing before September
- **"Where to Serve" filter spec + build**
- **Push notifications via FCM/APNs** — credentials needed from Stephen
- **Monorepo migration** — before Wear begins
- **Citizens Vision planning session** — before Wear begins
- **Citizens Wear planning session**

---

*Document version: 1.0 · Produced May 23, 2026*
*Source: Strategic planning conversation with Claude (Cowork mode)*
*Owner: Citizens Network PBO · Stephen*
*Next review: After the Whole City Talks (June 9, 2026)*
