# Citizens Wear — Roles, Concepts Marketplace & Royalty Model
**Status:** Confirmed direction — ready to inform build planning
**Last updated:** July 13, 2026

---

## 1. Role Model

Citizens Wear uses a single evolving account type rather than separate profile schemas per tier. Elevation is achieved through badges and permission states layered onto one underlying user object — this avoids onboarding forks, account-type migrations, and duplicated permission logic.

| Tier | How it's reached | Core capabilities |
|---|---|---|
| **Citizen** | Default on signup | Browse feeds, save to boards, follow, comment, purchase |
| **Creator** | Opt-in / auto-unlocked | Everything above + submit Concepts, build a public design portfolio, earn badges |
| **Brand** | Elevated *state* of Creator — not a separate account type | Everything above + propose on Concepts, claim/produce, post apparel status & release updates, appear in "active Brand" community surfaces |
| **Admin** | Granted manually | Moderation, Brand verification approval, dispute resolution on claims |

**Brand qualification** is a combination of:
- **Track record** — Concepts successfully claimed *and fulfilled* (not just claimed)
- **Verification** — a lightweight business/production-partner verification step, since Brand status carries the ability to make public release-date and status claims that Citizens may purchase against

This two-part gate (delivery record + verification) is intentional: raw claim/upvote counts measure design popularity, not production trustworthiness. Brand status is fundamentally a trust and fulfillment claim, so it needs a trust-oriented gate, not a popularity-oriented one.

---

## 2. The Concepts Marketplace

Concepts are public, browsable, upvotable designs submitted by Citizens/Creators. Only **Brands** may propose on and claim Concepts, reflecting their unique capacity to produce and deliver reliably.

### 2.1 Two-stage claim process

Claiming is split into two distinct actions to avoid multiple Brands wasting real production effort competing for the same win:

1. **Propose** (many Brands can do this) — a low-cost pitch: mockup/rendering using the Concept artwork, material/fabric choice, estimated unit price, MOQ, estimated turnaround, and a short note on the Brand's specialty or capability.
2. **Award/Claim** (exclusive, one Brand) — the Concept's originating Citizen/Creator reviews proposals and selects a winner. This is when exclusivity begins and production formally starts.

**Visibility rule:** Brand names are shown publicly as tags on a Concept ("3 Brands have proposed"), but full proposal details (pricing, materials, timelines) remain private to the Creator during the bidding window. This protects Brands from having competitors copy strong pitches, while keeping competitive pressure alive publicly.

### 2.2 Status lifecycle

Once claimed, status updates become a Brand-authored, append-only log — the same pattern as package tracking or a kanban board:

`Proposed → Claimed → In Production → Sample Review → Released → Sold Out`

- Each stage maps to a distinct color token in the design system.
- Only the Brand holding the active claim can advance stages after "Claimed."
- The log is append-only (not a single mutable field), which gives a free audit trail, a renderable timeline/stepper component, and a natural trigger point for notifications.
- This log is the technical mechanism that enforces the existing platform rule that only Brands may post official apparel status/release information.

### 2.3 Automatic "Completed Concepts" posting

When a claim's status is updated to **Released**, that update is automatically converted into a post in the Brand's **Completed Concepts** profile section. No separate manual posting step is required. The post carries:
- The design artwork
- The originating Citizen/Creator's username (tagged)
- The Brand's username

This section doubles as the Brand's public trust portfolio — the same surface that reflects their track record for future Concept awards.

---

## 3. Royalty & Reward Model

### 3.1 Structure: milestone-based, not ongoing percentage

Because payments are processed off-platform, an ongoing royalty stream is difficult to verify or enforce. A milestone-based reward is preferred as the starting model, since it requires one attestation rather than continuous auditing:

- **10% royalty on the first 100 units sold**, committed to by the Brand at the point of claim.
- The obligation ends **only when the 100-unit threshold is met** — not on a calendar date. No time limit applies unless separately stipulated for a given claim.
- The Brand must **submit proof of the 100th sale** to close out the incentive obligation. This proof requirement, combined with the public visibility of status/sales milestones, creates social and reputational accountability in the absence of in-platform payment processing.
- Honest, timely reporting should feed into the Brand's public trust/reputation signal (the same surface as Completed Concepts), giving Brands a self-interested reason to comply rather than relying on goodwill alone.

### 3.2 Permanent Catalogue conversion (opt-in exception)

Drop culture is the platform default — most Christian apparel designs are not repeat-purchased, and drops encourage activity, urgency, and product/cashflow movement. However, a small number of designs may warrant longer-term life:

- A Brand may propose converting a released drop design into their **permanent catalogue**.
- This requires a **two-party handshake**: the Creator must accept, since they are trading public on-garment attribution for a longer-term, lower royalty. This action is logged the same way status updates are.
- On conversion: the public username tag is removed from the design, and a **lifetime 5% royalty** to the Creator is committed in its place.
- **Data integrity note:** removing the public attribution tag must never remove the underlying link between the item and its originating `Concept`. The internal relationship persists permanently — only the public-facing tag is affected — since the lifetime royalty obligation depends on that link continuing to exist.

### 3.3 Reward summary

| Party | Reward |
|---|---|
| **Creator** | Money (milestone royalty, or lifetime 5% if converted to permanent catalogue) + physical attribution (username on garment, placement within Brand-set constraints) + digital attribution (tagged appearance in Brand's Completed Concepts) |
| **Brand** | Retained majority margin + reputation (visible track record, upvotes on shipped work, public trust signal that feeds future proposal competitiveness) |

---

## 4. Attribution Requirement

Brands are required to represent the originating Creator's username somewhere on the physical apparel, in a placement of the Brand's choosing, alongside the Brand's own branding.

---

## 5. Proposed Future Feature — Brand Workspace (not yet scoped)

A dedicated Brand workspace has been proposed and should be scoped in detail in a future conversation. Noted here for awareness only:

- Inventory view across all Brand items, with the ability to prioritize items for feed placement
- Stories creation and management
- Order viewing/management, separate from marketing-post management
- Drop scheduling and status management
- A separate marketing tools page: News, Testimonies, Blog posts, etc.
- Access to the Completed Concepts → Permanent Catalogue conversion action, across all relevant workspace functions

This is flagged as a feature to define requirements for on arrival, not to be planned within this document.

---

## Open Items for Future Decisions
- Whether Brand verification for elevation includes formal business/KYC documentation or a lighter internal review process
- Full detail and scope of the Brand Workspace (Section 5)
- Whether Admin-side dispute resolution tooling is needed for milestone/royalty disputes between Creators and Brands

---

## 6. Role progression & content-permission model — **RATIFIED 2026-07-15**

Design session (founder ↔ Claude) that turned §1's tiers into a concrete, lazily-progressing
capability model and a two-surface content split. This section is normative for Wear; it is
mirrored in [`apps/connect/docs/ECOSYSTEM_PROFILE_LEVELS.md`](../apps/connect/docs/ECOSYSTEM_PROFILE_LEVELS.md)
§3.2 (the ecosystem capability contract) and enforced at the DB by **migration 160**.

### 6.1 The four rungs (lazy role progression)

| Tier | How reached | Adds |
|---|---|---|
| **Citizen** | default | browse, save to boards, purchase, follow, comment, **submit Concepts**, post **Stories** |
| **Creator** | **auto-badge** at **>10 Concepts posted** (derived, no application) | the Concepts-page **stories bar** ("concept-statuses") |
| **Brand** | **verified state layered on a Creator** — *not a separate signup* | create **Posts** (Home apparel feed); once verified, **propose / claim / produce** Concepts |
| **Admin** | granted manually | moderation, verification approval, dispute resolution, sign-in-as (impersonation) |

- **Roles are lazy/derived.** Creator badge and Brand *eligibility* are computed from activity;
  only the Brand grant itself is stored (it required a human approval).
- **Brand genesis is assigned, never self-created.** A Brand row is minted by an admin —
  either directly (launch/partner brands, the bootstrap that lets the first Concepts be
  claimed) or by approving a citizen's **Become-a-Brand application**.
- **Brand eligibility gates** (what unlocks the *Become-a-Brand* button in settings):
  **≈20 Concepts posted + 10 Concepts claimed** + a customer-support **email** and **contact
  number** + **no sustained history of being reported**. The application form collects: Brand
  Name\*, bio, socials, email\*, contact number\*, delivery options\* (+ more), and agreement to
  the Ts&Cs, the Citizens Code of Conduct, and the note on monthly platform fees.
- **Bootstrap grace:** the first 100 Wear Concepts (platform-wide) are all promoted to
  concept-statuses regardless of their creator's badge, to seed the community surface at launch.
- Progression can never be the *genesis* of Brand on its own (it is circular — claiming
  requires an already-verified Brand); it gates the **invitation to apply**, and an admin
  makes the grant. This preserves §1's trust-oriented (not popularity-oriented) gate.

### 6.2 Two content surfaces

- **Home feed** — **Brands' Posts + Stories** (apparel). Per-post **Share** (Instagram-style)
  is a planned add. *[Stories currently act as brand-page redirects, not full-screen — fix planned.]*
- **Concepts page** — the **community's own creations**: Concepts + a **concept-stories bar** +
  **like / comment / share** on Concepts. This attention is what draws Brands to a design, so
  it is where a Creator's value accrues. *(✅ SHIPPED 2026-07-16, **migration 161**:
  `wear.concept_comments` (threaded), `wear.concept_shares` (distinct-sharer social proof),
  `wear.concept_statuses` + views (the bar — trigger-promoted, no client write path), and
  engagement notifications. "Like" rides the existing upvote storage, re-skinned. The Creator
  badge derives lazily (>10 Concepts) exactly as §6.1 specifies; the first-100 bootstrap grace
  is a self-terminating status counter.)*

### 6.3 Content-permission rules (what mig 160 enforces now)

- **Posts are Brand-tier:** a Post must be authored by a user who **owns the attributed brand**
  and that brand must be **`verified`**. `brand_id` is mandatory — base-Citizen "self-posts"
  are retired. Enforced in the UI (Create screen), the API (`POST /api/posts`), **and** RLS
  (`wear.posts` insert `WITH CHECK`).
- **Brand creation is admin-only:** the self-serve *Create Brand* tile is removed and
  `wear.brands` INSERT is restricted to `wear.is_admin()` at RLS (service-role seeding bypasses
  RLS). Brand owners keep UPDATE/DELETE of their own row; `verified` stays admin-managed
  (mig 157 column guard).
- **Base Citizens keep Concepts + Stories** (no capability removed mid-flight); the
  bifurcation of Stories into Brand-Home-stories vs Creator-concept-stories lands with the
  concept-stories build.

### 6.4 Deferred (designed here, built later)

~~Creator-badge derivation + concept-stories/comments/shares~~ ✅ **SHIPPED (mig 161,
2026-07-16)** — badge surfaced on `/api/me` + profiles, statuses bar + engagement live.
~~Per-post Share; full-screen Home stories~~ ✅ **SHIPPED (same session)** — share sheet +
`?post=`/`?concept=` deep links; the Home tray now plays stories in a full-screen viewer.
Still deferred: the **Become-a-Brand application** form + eligibility derivation + admin
approval → mint flow (the `POST /api/brands` `ownerId` + `brands_admin_insert` mint path is
ready); **share-to-DM** (the `dm` channel value is reserved); **admin sign-in-as**
(impersonation — a security-sensitive surface, own design).
