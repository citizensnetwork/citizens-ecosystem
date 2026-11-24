# Composition layout: adaptable nav, Explore and Preview

Status: plan only, 2026-11-24. No code in this PR.
Companion to [`ENGINE_PLAN.md`](./ENGINE_PLAN.md), [`ADR-001`](./ADR-001-engine-architecture.md)
and [`packages/engine-config`](../../packages/engine-config/README.md).

This repository is public. This file names no real organisation and no commercial terms.

---

## 1. Why this exists

Citizens Connect’s map shell has landed a new composition (gold rail, pack Explore / Me,
preview conveyor). Tenants who rent the map engine will need the same surfaces to be
**adaptable**: add, hide, reorder and rename common pieces — without a free-form UI builder.

The founder’s brief (2026-11-24):

- **Wanted:** a customiseable *section* of the product — nav buttons; preview carousels;
  Explore’s large / small / block image sections — with rename, show/hide and reorder by
  priority.
- **Not wanted (yet):** a customiseable UI *creator* (drag-drop page builder, arbitrary
  widgets, arbitrary URLs as first-class screens).
- **Method:** segment Citizens’ own UI first; drive it from configuration; then offer the
  same levers to a tenant.

This plan names that work **Composition layout** (steps **C0–C6**). It is the constrained
composer that sits on top of the engine’s existing configuration contract.

---

## 2. Concept (one sentence)

> A world is assembled from a **fixed catalogue of section kinds and nav slots**; a
> configuration document says which ones show, in what order, under what labels and with
> which data source — Citizens is the first document; every tenant is another.

### 2.1 What a tenant (or Citizens admin) may change

| Surface | Allowed | Forbidden (this plan) |
| --- | --- | --- |
| **Main nav / gold rail** | Add / hide / reorder slots from the registry; rename via vocabulary | Invent a new screen type; paste arbitrary external URLs as nav items |
| **Preview panel** | Add / hide / reorder / rename carousels; choose each carousel’s source and density | Redesign preview chrome; invent new interaction models mid-flight |
| **Explore** | Compose from section kinds: hero, search, carousel, category tiles, callout, large-image row, small-image row, block-image grid | Free-form layout canvas; per-tenant CSS; custom React components |

### 2.2 Catalogue (working list — C0 freezes it)

**Nav slots** (extend today’s `layout.navigation` / component registry):

- Core / always available when the feature is on: `map`, `explore`, `me`, `discover` (alias
  while Explore settles), `messages`, `notifications`, `settings`
- Feature-gated: `gatherings`, `ideasBoard`, partner portal entry, admin entry
- Pilot option: an entitled `externalLink` slot. Support embedding where the provider allows it, with an external link available where feasible.

**Explore section kinds:**

| Kind | Renders as | Needs |
| --- | --- | --- |
| `hero` | Large cover + title + one line | copy keys (vocabulary) + optional image source |
| `search` | Search + area control | — |
| `carousel` | Horizontal cards | `source` + title key + optional limit |
| `grid` | Dense tile grid | `source` + title key |
| `categoryTiles` | Category / map-group tiles | categories already in configuration |
| `callout` | Short prompt + action chips | copy keys + chip intents |
| `largeImageRow` | Wide image cards | `source` |
| `smallImageRow` | Compact image cards | `source` |
| `blockImageGrid` | Square block images | `source` |

**Preview carousel kinds:** same `carousel` / `largeImageRow` / `smallImageRow` ideas, scoped
to the focused listing’s context (nearby, same group, hosted events, news, gallery).

**Data sources** (closed list; C0 freezes ids):

- `nearbyEvents`, `nearbyPlaces`, `nearbyPartners`
- `group:<mapGroupId>` (e.g. worship, community)
- `saved`, `following`, `happeningNow`
- Listing-scoped: `hostedEvents`, `gallery`, `news`, `sameGroupNearby`

No open-ended query language. A source the catalogue does not name is refused at validation.

### 2.3 Document shape (extends `@engine/config`)

Sketch only — C1 writes the real schema as a **minor** contract step:

```ts
layout: {
  components: [...],          // already exists
  navigation: [               // richer than today’s ComponentKey[]
    { id: 'me', visible: true },
    { id: 'explore', visible: true },
    { id: 'map', visible: true },
    { id: 'do', visible: true, children: ['gatherings', 'ideasBoard'] },
  ],
  controls: [...],            // already exists
  explore: {
    sections: [
      { kind: 'hero', id: 'explore-hero' },
      { kind: 'search', id: 'explore-search' },
      { kind: 'carousel', id: 'happening', source: 'nearbyEvents', titleKey: '…', limit: 12 },
      { kind: 'categoryTiles', id: 'categories' },
      { kind: 'callout', id: 'lets-prompt', chipIntents: ['worship', 'sports', 'coffee'] },
      { kind: 'carousel', id: 'group-worship', source: 'group:worship', titleKey: '…' },
      // …
    ],
  },
  preview: {
    carousels: [
      { id: 'nearby', source: 'sameGroupNearby', titleKey: '…', density: 'card' },
      { id: 'hosted', source: 'hostedEvents', titleKey: '…', density: 'card' },
      // …
    ],
  },
}
```

Rules that keep this safe:

1. **Catalogue only.** Unknown `kind`, `id` collision, or unknown `source` → validation fails.
2. **Entitlements cap the catalogue.** The engine owner can forbid section kinds or sources
   on a cheap plan (same pattern as feature switches / map tilt).
3. **Citizens parity.** The Citizens configuration must reproduce today’s rail + Explore +
   Preview exactly; e2e is the check (same bar as E7).
4. **No framing in renderers.** Section components take labels from vocabulary / title keys;
   never hard-code “Kingdom”, gold hexes or category lists (ENGINE_PLAN §5).

---

## 3. Relation to engine steps E0–E10

### 3.1 Recommendation: do **not** interrupt isolation work; **do** weave into E4 / E7

| Engine step | Interrupt? | Why |
| --- | --- | --- |
| E5 baseline schema / fan-out | **No** | Leak and migration risk; Fable track |
| E6 control plane (security + console) | **No** for security half; composition admin is a *later* console surface | Isolation and Superuser powers first |
| E8 provision + launch gate | **No** | Paid plans, backups, real domain — money and ops |
| E9 pilot features / E10 security review | **No** | Pilot product and sign-off stay on the critical path |
| E4 facelift | **Yes — compose here** | New surfaces must be sectioned as they are rebuilt, or hard-coding grows |
| E7 wire frontend to configuration | **Yes — extend here** | Composition is the same “read the world” job as vocabulary |

**Default order:** finish (or continue) E7 vocabulary wiring and the gold-rail facelift under
E4 **while** starting C0–C2 so the new shell is not re-hard-coded. Ship C3 on Citizens before
the pilot’s staff rely on Explore order. Ship C4 (tenant composition admin) **after** E8’s
empty world exists — or as a thin staff screen inside the tenant, not inside the Superuser
console. Do not hold E8–E10 for C4.

**When to interrupt deliberately:** only if a facelift PR is about to lock Explore / Preview /
rail structure for months *without* a section list. In that case the session stops, extracts
the section list into configuration (C1/C2), then continues the facelift against the document.

### 3.2 Citizens v1 still outranks

Contributor readiness, listing quality and the discovery loop stay ahead of composition polish
(ENGINE_PLAN: engine work runs beside Citizens priorities, not in front of them). Composition
on Citizens is justified when it (a) unlocks tenant rental or (b) lets the founder reorder
Explore by priority without a code change.

---

## 4. Steps to user-ready completion (C0–C6)

Models follow the engine convention: **Fable 5.2 high** when the contract or validation is
wrong in a way that leaks or locks tenants into a bad document; **Opus 5.5 high / xhigh** for
UI segmentation and admin screens. No Sonnet (standing founder rule).

| Step | What | Model | Needs first | Output / “done” |
| --- | --- | --- | --- | --- |
| **C0** | **Inventory and freeze the catalogue.** List every rail item, Explore block and Preview carousel on `main` after the pack/rail facelift; name section kinds and sources; mark which are Citizens-only. | Opus 5.5 high | Current shell on `main` | `docs/engine/COMPOSITION_INVENTORY.md`; catalogue frozen for C1 |
| **C1** | **Contract extension (minor).** Add `layout.explore`, `layout.preview`, richer `layout.navigation` to `@engine/config`; Citizens + sample configs; parity tests that encode today’s UI. | **Fable 5.2 high** | C0; E3 package exists | Package + tests green; README “Not in the contract yet” updated |
| **C2** | **Segment Connect renderers.** Rail, Explore, Preview become “map over `WORLD.layout.*`”; delete hard-coded section order from JSX. Pixel-identical to pre-C2 (e2e). | Opus 5.5 xhigh | C1 | One PR per surface (rail → Explore → Preview), each with e2e |
| **C3** | **Citizens-first use.** Only the founder can reorder Explore / Preview / nav by editing the Citizens configuration (file or internal tool) and redeploying / publishing. Proves priority swapping without a tenant UI. | Opus 5.5 high | C2 | Runbook: “change Explore order”; one real reorder verified on production or preview |
| **C4** | **Tenant composition admin (staff UI).** Inside the tenant’s admin: lists to show/hide, drag-reorder, rename (vocabulary keys or override strings). No canvas. Validates through the same schema. | Opus 5.5 high | C3; tenant project exists (after E8 for the pilot) | Staff can change composition without a deploy, with pilot Preview editing restricted to tenant owners; audit or revision bump |
| **C5** | **Entitlements and limits.** Caps: max nav items, max Explore sections, which kinds/sources a plan may use; Superuser sets entitlements in the control plane. | Fable 5.2 high (validation) then Opus for any console fields | C1; E6 entitlements tables | Cheap plan cannot enable every source |
| **C6** | **Pilot-ready check.** Sample tenant config differs from Citizens on purpose (flat Explore, fewer carousels, renamed nav); e2e against sample; short staff guide. | Opus 5.5 high | C4 or at least C3 + hand-edited config | Pilot staff guide; no Citizens framing in the sample world |

**User-ready for Citizens** = end of **C3**.  
**User-ready for a renting tenant** = end of **C4** (with C5 before a second paid tenant).

### 4.1 Out of scope until a later plan

- Visual page builder / WYSIWYG canvas
- Per-tenant custom React or CSS upload
- Arbitrary nav URLs as a default (optional entitled `externalLink` for the pilot)
- Composition of Vision, Wear or Central
- Paying for composition as its own SKU (pricing stays on the engine plan)

---

## 5. Agent creativity, intuition and initiative

These rules apply to every session that touches composition, the gold rail, Explore, Preview
or `@engine/config` layout fields. They sit beside ENGINE_PLAN §5 and the standing
instructions; they do not replace VISION.md.

**Founder intent (2026-11-24):** agents are not limited to what the prompt already named.
They are expected to notice better options, propose and (when §5.3 allows) ship improvements
that speed delivery, refine UX, strengthen security, cut waste, and move Citizens and the
rentable engine toward adaptable composition — even when the founder did not think of that
move first. Record non-obvious choices in the session journal.

### 5.1 Standing goals agents must serve

1. **Citizens first as the reference world.** Any composition change must keep Citizens’
   current UX reproducible from configuration (or improve it deliberately and say so).
2. **Tenant worlds stay nameless of Citizens.** No Kingdom / Citizen / Contributor copy in
   shared renderers; vocabulary and title keys only.
3. **Catalogue over canvas.** Prefer a new *kind* or *source* in the closed lists over a
   one-off JSX branch for one screen.
4. **Priority is data.** “More important” content higher means section order and source
   choice first; invent a ranking algorithm only when manual order is clearly not enough,
   and say why in the PR.
5. **End goal over prompt literalism.** If a path the founder did not name clearly serves
   adaptable UI for Citizens and tenants (faster, safer, clearer, cheaper to operate), the
   agent should take it or propose it — not wait for a second ask.

### 5.2 Permission granted (do without waiting)

Agents **may and should** take initiative to:

- **Innovate inside the goal:** suggest and implement catalogue kinds, sources, defaults,
  empty states, staff copy, Explore priority orders, and small UX refinements that were not
  in the prompt, when they make composition more useful or Citizens discovery stronger.
- **Speed the path:** extract hard-coded rail / Explore / Preview blocks into the catalogue
  when touching those files; wire facelift UI to `WORLD` / layout in the same PR when cheap
  (E4 ∩ C2); batch obvious follow-ons instead of opening a second session for glue.
- **Refine and improve:** tighten labels, density, accessibility, mobile hit targets, and
  section defaults; remove dead hard-coding; extend parity / e2e when order or labels would
  otherwise drift.
- **Secure more:** refuse open URL / unvalidated sources; keep entitlements as the ceiling;
  flag RLS, secret, or cross-tenant risks in composition admin paths; prefer structural
  isolation already decided in ADR-001 over new shared tables.
- **Be more effective:** collapse duplicate JSX into one kind with parameters; rewrite a
  page-builder-shaped request as catalogue + document in the PR; reorder the sample tenant
  to prove differentiation (never invent a real tenant’s branding in-repo).
- **Surprise with options:** when several approaches fit, pick the one that best serves
  adaptable composition *and* leave a short note (PR or journal) naming the alternatives
  considered — so the founder can reverse a call without re-deriving it.

### 5.3 Ask first (hard gates only)

Agents **must stop and ask the founder** before:

- Adding `externalLink` or any open URL field to nav
- Removing a core nav slot from Citizens’ default
- Introducing a section kind that needs a **new table, RPC or migration**
- Changing entitlements defaults for the pilot
- Building a drag-drop canvas or third-party page-builder dependency
- Storing a real tenant’s composition document in this public repository
- Anything that spends money, changes production auth, or applies a live migration

Everything else that stays inside the catalogue + Citizens parity bar is **go**, including
ideas the prompt never listed.

### 5.4 Intuition cues

- Translate vague UX wishes into kinds, order and sources — then ship that document.
- Two carousels that differ only by source or density → one kind with parameters.
- Different copy for Citizens vs a tenant → vocabulary / title key, not a forked component.
- E5 / E6 security / E8–E10 in flight elsewhere → prefer C0 inventory or C2 against the
  current contract; do not collide on schema unless the founder prioritises C1. Start C0 only when the founder is ready.
- If an unprompted improvement is small and reversible, ship it with the note; if it is
  large or irreversible, propose it in chat with one recommended option and one fallback.

### 5.5 Creativity budget

**In bounds:** new catalogue entries, better defaults, discovery-oriented Explore order
(nearby and happening before static), staff empty states, security hardening of the admin
path, performance of section renderers, tests that lock parity.

**Out of bounds:** a general site builder; silent product pivots away from map-first
discovery; inventing commercial terms or naming a real tenant in-repo.

---

## 6. Founder decisions

1. **Connect navigation.** Keep Let’s and Ideas grouped under the Do menu in Connect.
2. **Citizens editing at C3.** Only the founder can edit the shared Citizens layout for now. The UI can still adapt to each viewer’s most frequent activity.
3. **Pilot Preview.** Only tenant owners can configure the Preview layout for their audience.
4. **Pilot navigation.** Allow external links where feasible, including a radio tenant’s Listen Live link. Support embedding where the provider allows it.
5. **Explore order in v1.** Reuse the existing map prominence code as a signal for ordering Explore sections.

C0 is deferred until the founder is ready to start.

---

## 7. Acceptance bar (user-ready)

**Citizens (C3):**

- Changing one section’s order in the Citizens configuration changes Explore (or Preview /
  rail) without editing JSX.
- e2e: Discover / Explore / rail / preview flows still pass; no Citizens framing regressions
  in shared renderers.

**Tenant (C4 + C6):**

- Tenant staff can show/hide, reorder and rename within the catalogue. In the pilot, only tenant owners can make these changes to Preview.
- Sample (or pilot) world differs from Citizens in nav labels and Explore order; no Citizens
  product name on those surfaces.
- Validation refuses unknown kinds/sources; entitlements can hide kinds the plan does not
  allow.

---

## 8. Index for other sessions

| Need | Open |
| --- | --- |
| Engine isolation and rental model | [`ENGINE_PLAN.md`](./ENGINE_PLAN.md), [`ADR-001`](./ADR-001-engine-architecture.md) |
| What is already configurable | [`packages/engine-config/README.md`](../../packages/engine-config/README.md) |
| Framing to strip from shared UI | [`BOUNDARY_INVENTORY.md`](./BOUNDARY_INVENTORY.md) |
| This composition track | This file; next write `COMPOSITION_INVENTORY.md` at C0 |

**Next step when the founder starts C0:** run **C0** on current `main` (rail + pack
Explore + Preview), then schedule **C1** on Fable beside remaining E7 work — without
blocking E8–E10.
