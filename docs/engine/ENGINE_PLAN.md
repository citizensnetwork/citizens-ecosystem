# The Map Engine and its Tenants: plan

Status: plan only, 2026-11-11. No code, no migration, no new database project.
Step E1 is written: [`ADR-001-engine-architecture.md`](./ADR-001-engine-architecture.md) confirms section 3, records the
founder's answers to section 7, and changed steps E3, E5, E6, E8 and E9 in section 6.
Supersedes: the tenant schema sketch of 2026-10-18 (it was never in this repository). That sketch put tenants
inside the Citizens database and linked them to Citizens listings. The founder's decisions below replace that model,
so none of its stages (0, 1a, 1b, 2) will be built.

This repository is public. This file names no real organisation and no commercial terms. The pilot's private
details live in the founder's local session notes.

---

## 1. What the founder decided (2026-11-11)

1. **The product underneath Citizens is an engine.** The map, profiles, events, live locations, messaging,
   follow and save, custom icons and interactions, and links out to social networks are general features with no name of their own.
   "Citizens" is one way to frame them.
2. **A tenant rents the whole engine** and runs it as its own world: its own name for that world, its own
   vocabulary, branding, categories, icons, components and controls. Example: a radio station's world is
   "<Station> World", its organisations are "<Station> Partners", and its users are "Listeners".
3. **Full separation.** A tenant's users, partners and data are never part of the Citizens ecosystem, and
   Citizens data never appears in a tenant. No shared accounts, no "explore Citizens" funnel, and no Citizens
   listing linked into a tenant. (This replaces the 2026-10-17 idea of one Citizens identity everywhere.)
4. **One Superuser above all tenants:** the owner of the engine.

My view: this is the right model, and it is simpler than the October sketch. The October sketch had to protect
Citizens rows from tenants row by row. Full separation removes that problem instead of guarding against it.

---

## 2. The pilot's three use cases, against what exists today

The pilot tenant is a community radio station.

| Use case                                                                                                                                                                                                                                                           | What the engine needs                                                                                                                                           | Exists today (in Connect)                                           | New                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **On-air advert, then "find them on our app".** A paying partner (for example a car dealership) is advertised at 08:15; listeners find the partner's contact details, socials and offerings in the app, and an app-only offer applies to bookings made through it. | Partner profile (contact, socials, offerings, gallery), a booking or enquiry action, an offer with a redeemable code, a short spoken link and QR to the profile | Contributor profiles, socials, galleries, QR per listing, messaging | Offers with codes and attribution ("booked via the app"); a short memorable link; reporting to the partner |
| **Outside broadcast.** The station makes an event and tells listeners to find the broadcast van on the map.                                                                                                                                                        | An event whose pin follows a live device location for a time window                                                                                             | Events, live locations (with a 15-minute clean-up job), map bubbles | A live pin owned by an event instead of a person                                                           |
| **Discovery and recall.** A listener browses partner churches, NGOs and events and finds a partner the station trusts near home, which reminds them of the advert.                                                                                                 | Categories chosen by the tenant, a "trusted by" badge, a "heard on air" spotlight tied to the advert campaign                                                   | Map v2, Nearby, categories, prominence                              | Categories as data per tenant; spotlight scheduling; campaign link                                         |

Most of the work is making existing features configurable. Only a few features are new.

---

## 3. Recommended architecture (to confirm in step E1)

### 3.1 One codebase, many configurations

The engine is Connect's code made configurable. Citizens is the first configuration, and each tenant is another.
No fork: a fork means every fix is made twice. If engine code ever says "if tenant is X", that is a missing
configuration option.

### 3.2 Data: one database project per tenant (recommended)

|            | One project per tenant (recommended)                                                            | One shared engine project with `tenant_id` on every row            |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Users      | Separate sign-in per tenant (Supabase auth belongs to a project)                                | One pool of accounts for every tenant, separated only by policy    |
| Isolation  | Structural: one tenant cannot query another's database at all                                   | Row policies on every table; one wrong policy leaks across tenants |
| Leaving    | Hand over or delete one project                                                                 | Delete rows across many tables                                     |
| POPIA      | Each tenant's data sits in its own container, which is easy to explain to its responsible party | Harder to evidence                                                 |
| Cost       | One project fee per tenant (re-check current Supabase pricing before quoting a tenant)          | Cheapest                                                           |
| Operations | Every engine migration must be applied to every tenant project (needs tooling, step E5)         | One apply                                                          |

Decision 3 ("completely separate") points to one project per tenant. Citizens stays on its current project, and a
later move of Citizens onto the engine baseline is out of scope.

### 3.3 The control plane (where the Superuser lives)

This is a small, separate project the engine owner runs. It holds the tenant registry (name, status, plan, domains, the database
project each tenant uses), each tenant's configuration versions, provisioning state, usage totals and an audit
log. It never holds a tenant's users or partners.

### 3.4 Hosting

Pilot: one Vercel project per tenant, each with its own environment and its own database keys, so one tenant's
leaked key exposes nothing else. Later, at a handful of tenants, consider one deployment that resolves the tenant
from the domain. Step E1 decides this.

### 3.5 The engine baseline schema

A tenant project cannot replay Citizens' 200-plus migrations, which carry Vision, Wear and faith-specific
history. The engine needs its own nameless baseline: the tables, functions and policies the engine features use,
created from empty, then its own migration line (step E5).

---

## 4. The Superuser: yes, and with limits

It makes sense, and the engine needs one. Roles from the top:

| Role                                      | Lives in       | Can                                                                                   |
| ----------------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| **Engine Superuser** (the engine owner)   | Control plane  | Create, configure, suspend and retire tenants; ship engine versions; see usage totals |
| Engine support operator (optional, later) | Control plane  | Read tenant status; open time-limited support access                                  |
| **Tenant owner**                          | Tenant project | Everything inside their world: configuration, partners, events, admins                |
| Tenant admin or editor                    | Tenant project | What the owner grants                                                                 |
| Tenant user (e.g. a Listener)             | Tenant project | Use the world                                                                         |

Limits I recommend:

- **The Superuser does not read a tenant's users or messages as a matter of course.** Support access is
  break-glass: time-limited, logged in the control plane, and visible to the tenant owner. Connect's
  impersonation (phase 1, with automatic expiry) is the precedent.
- Superuser accounts are not accounts in any tenant, and they use strong sign-in.
- Under POPIA the tenant is likely the responsible party for its users and the engine owner its operator, which
  calls for a written operator agreement (section 21). This is a pointer, not legal advice.

---

## 5. What this means for the facelift: keep going, with one rule

The facelift does not stop. It is where the engine's components get their final shape. One rule applies from now on:

> **No new hard-coded framing.** A facelift change never adds a literal "Kingdom", "Citizen", "Contributor",
> a colour value, a category list or an icon choice inside a component. Use the design tokens and, once
> step E3 exists, the vocabulary lookup.

Today Connect's frontend has the word "Kingdom" on 57 lines in 19 files, "Citizen(s)" on 91 lines in 57 files and
"Contributor(s)" on 172 lines in 42 files (counted on `main` at `16298c6`). Step E7 replaces them. The rule only
stops the count from growing.

---

## 6. Steps, each with its model

Models: **Claude Fable 5.2 at high effort** for work where a mistake means a data leak, a second migration or a
contract everything else depends on. **Claude Opus 5.5 at high effort** (xhigh for large multi-file builds) for
everything else. No Sonnet (founder, 2026-11-11). Opus 5.5 defaults to medium effort, so set high explicitly when
the session starts.

| Step    | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Model              | Needs first                                                                                                                                            | Output                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E0      | Decisions and this plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Opus 5.5 high      | none                                                                                                                                                   | This file (done)                                                                                                                                             |
| **E1**  | **Engine architecture decision record:** isolation model, auth per tenant, control plane, hosting, migration fan-out, measured costs, POPIA roles, the Superuser's powers. Settles section 7.                                                                                                                                                                                                                                                                                                                   | **Fable 5.2 high** | Founder answers to section 7                                                                                                                           | [`ADR-001-engine-architecture.md`](./ADR-001-engine-architecture.md) (written 2026-11-11); no code                                                           |
| E2      | **Boundary inventory:** every framing word, colour, category, icon and Citizens-only feature in Connect, and every cross-app tie (Vision, Wear, Central, `/api/v1`) an engine copy must cut                                                                                                                                                                                                                                                                                                                     | Opus 5.5 high      | none (can run beside E1)                                                                                                                               | `docs/engine/BOUNDARY_INVENTORY.md`                                                                                                                          |
| **E3**  | **Tenant configuration contract:** vocabulary dictionary (on-screen words and the words in web addresses), theme tokens, categories as data, feature switches, component and control registry, the home-screen app details, the legal-page operator field, validation, versioning. Two layers (ADR-001, decision 3): entitlements the engine owner sets, and configuration the tenant owns and stores in its own project. Citizens' configuration is the first instance and must reproduce today's app exactly. | **Fable 5.2 high** | E1, E2                                                                                                                                                 | A `packages/` config package with schema, the Citizens configuration, one made-up sample tenant and tests. No real tenant's configuration in this repository |
| E4      | **Facelift continues** surface by surface on the contract (section 5's rule)                                                                                                                                                                                                                                                                                                                                                                                                                                    | Opus 5.5 xhigh     | E3 for the vocabulary lookup; tokens now                                                                                                               | One PR per surface, as agreed                                                                                                                                |
| **E5**  | **Engine baseline schema and migration fan-out:** a baseline cut from Connect's schema by E2's allow-list, keeping internal names, in its own migration line beside `supabase/`; built from empty in CI; row policies, rollback-only probes; provisioning of functions, scheduled jobs, storage and sign-in settings as well as SQL; a tool that applies one migration to every tenant project and reports drift; a CI check for drift between the Citizens line and the engine line                            | **Fable 5.2 high** | E1, E2; one free project in a new engine organisation (the account's last free slot; the founder said yes on 2026-11-11), and its region (ADR-001, O4) | Baseline migrations, provisioning and fan-out tool, probes, drift check                                                                                      |
| E6      | **Control plane and Superuser:** schema, policies, audit log and break-glass access (**Fable 5.2 high**); the Superuser console screens (Opus 5.5 high). Built and tested in CI on a throwaway database; no free project slot is left for it                                                                                                                                                                                                                                                                    | Fable, then Opus   | E1, E5; the engine's real name (ADR-001, O8) before the console                                                                                        | Control-plane schema and console, ready to create at the launch gate                                                                                         |
| E7      | **Wire the frontend to the configuration:** replace the words, colours and categories found in E2; the Citizens configuration must stay pixel-identical (the e2e suite is the check)                                                                                                                                                                                                                                                                                                                            | Opus 5.5 xhigh     | E2, E3                                                                                                                                                 | Configurable frontend                                                                                                                                        |
| E8      | **Provision the pilot tenant:** project, configuration, the tenant's own domain, email sender, map key, owner account, from a runbook. Ends with the **launch gate** (ADR-001, decision 1): upgrade the engine organisation to a paid plan, create the control-plane project, move hosting, map and email to paid plans. Staff enter real partners only after the gate                                                                                                                                          | Opus 5.5 high      | E5, E6, E7; the founder's yes to the paid plans (about $105 a month at list price); ADR-001 open items O1, O3, O7                                      | The pilot world, empty, backed up and never paused                                                                                                           |
| E9      | **Pilot features:** partner offers with codes and attribution (no payments: the tenant bills its partners itself), the event-owned live pin, the "heard on air" spotlight and short links, partner reporting, partner invitations by tenant staff                                                                                                                                                                                                                                                               | Opus 5.5 xhigh     | E8                                                                                                                                                     | Features behind configuration switches                                                                                                                       |
| **E10** | **Security review before real users:** cross-tenant isolation tests, Superuser and break-glass paths, per-tenant secrets                                                                                                                                                                                                                                                                                                                                                                                        | **Fable 5.2 high** | E9                                                                                                                                                     | Review, fixes, sign-off                                                                                                                                      |

Fable is used in five places: E1, E3, E5, the security half of E6, and E10. Between those sessions Fable can be
reset or parked. E2 and E4 never wait for Fable.

Order: E1 and E2 can run together. Then E3. E4 runs throughout. E5 follows E1 and E2, and E6 follows E5. E7
follows E3. Then E8, E9 and E10 in turn. Citizens' own v1 priorities (Contributor readiness before recruiting) keep their place. Engine
work runs beside them, not in front of them.

---

## 7. Open questions for the founder (answered 2026-11-11)

Answers, in order: (1) free while building, paid at launch; (2) the tenant's own domain; (3) a web app saved to
the home screen for the pilot; (4) tenant staff add partners and can invite them to manage their own profile;
(5) the tenant bills its partners itself; (6) only on the legal page; (7) the code name `engine` for now;
(8) yes, drafted for the founder's approval. Detail and consequences are in section 2 of
[`ADR-001-engine-architecture.md`](./ADR-001-engine-architecture.md). The questions as asked:

1. **One database project per tenant:** do you accept a monthly project cost per tenant, built into the tenant's price?
2. **Domain:** does each tenant get its own domain, or a sub-address of an engine domain?
3. **Phone apps:** does a tenant need its own app-store app? (A separate store app per tenant is a large extra
   step: a native shell per tenant, store accounts, reviews.) Or is a web app saved to the home screen enough for
   the pilot?
4. **Who enters partners:** tenant staff only, or can partners sign up and manage their own profile inside the
   tenant's world?
5. **Money:** does the engine take partner payments for the tenant, or does the tenant bill its partners itself?
6. **"Powered by":** does a tenant's world show the engine's name anywhere?
7. **The engine's name:** needed for the control plane, the Superuser console and package names.
8. **Vision:** add the engine to the ecosystem list in `VISION.md`? Every session reads that file first, and it
   currently describes only Citizens' own channels. Without a line there, engine sessions will stop to ask how
   the work ties to the vision.
