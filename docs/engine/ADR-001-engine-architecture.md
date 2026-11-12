# ADR-001: Engine architecture

Status: proposed on 2026-11-11 (engine step E1). The founder's answers in section 2 are decided, including the
answers to the open items given in step E2 the same day (section 5). The other
choices are this session's recommendations; they become decided when this pull request is merged, and each one
stays reversible until the step that builds it.

Scope: decisions only. No code, no migration, no new database or hosting project, nothing applied.

This repository is public. This record names no tenant, no client and no agreed price. "The pilot tenant" is a
community radio station; its private details live in the founder's local session notes.

Plan this record belongs to: [`ENGINE_PLAN.md`](./ENGINE_PLAN.md).

---

## 1. Context

On 2026-11-11 the founder decided that the map product under Citizens Connect is a nameless engine. A tenant
rents the whole engine and runs it as its own world, with its own name, vocabulary, branding, users and partners.
Tenants are completely separate from Citizens: no shared accounts, no shared data, no funnel in either direction.
One Superuser, the engine owner, sits above all tenants.

Step E1 turns that into architecture: where each tenant's data lives, how its users sign in, what the Superuser
can and cannot do, where it is hosted, how one engine schema reaches many databases, what the map tiles cost, who
carries which duty under POPIA, and what it all costs per month.

Three words used throughout:

- **Tenant project:** the tenant's own Supabase project (database, sign-in, file storage).
- **Control plane:** a small separate Supabase project that only the engine owner uses. It lists the tenants and
  records what the engine owner does.
- **Launch gate:** the moment a tenant's world starts to hold real content. It is the earlier of two events: the
  tenant's staff begin entering real partners, or any real user signs in.

---

## 2. The founder's answers (2026-11-11)

Asked as the eight questions in section 7 of the plan, answered in the session by question cards.

| #   | Question                               | Answer                                                                                                                                         | What it settles                                                                                                                          |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A monthly database cost per tenant?    | **Free while building, paid at launch.** Build and test the pilot on a free project; move to paid before real users arrive.                    | Decision 1 and the launch gate. This was not the recommended option (paid from the start); section 3.1 deals with what it costs in risk. |
| 2   | Own domain or a sub-address?           | **The tenant's own domain** (or a sub-address of the tenant's existing site).                                                                  | Decisions 2 and 4. Nothing in a tenant's address points to the engine or to Citizens.                                                    |
| 3   | A store app per tenant?                | **A web app saved to the home screen is enough for the pilot.**                                                                                | No native shell, no store accounts. A store app is a later, separate step.                                                               |
| 4   | Who enters partners?                   | **Tenant staff add partners, and can invite a partner to manage its own profile and offers.** No open partner sign-up.                         | Decision 2 (partner accounts are invited, never self-registered).                                                                        |
| 5   | Does the engine take partner payments? | **No. The tenant bills its partners itself.** The engine owner invoices the tenant.                                                            | The engine handles no money and no card data. Offers are codes and attribution only.                                                     |
| 6   | Does a tenant's world show the engine? | **Only on the legal page**, as the service provider. Citizens is never mentioned.                                                              | Decision 7 and open item O1.                                                                                                             |
| 7   | The engine's name?                     | **The code name `engine` for now.** It is never shown to users. A real name can be chosen any time before the Superuser console is built (E6). | Package and project names use `engine`.                                                                                                  |
| 8   | A line for the engine in `VISION.md`?  | **Yes: the session drafts it, the founder approves it.** Nothing is added to `VISION.md` until the founder agrees to the wording.              | The draft is in Appendix A. `VISION.md` is not changed by this pull request.                                                             |

**Added by the founder later the same day**, after reading this record:

- **219 owns the engine, for now.** This answers open item O1 as far as the owner goes. 219 is the engine owner in
  every sentence below, the Superuser acts for 219, and 219 is the service provider a tenant's legal page names.
- **Paying clients come before launch.** The paid plans start when a client pays. Until then the aim is working
  test software that can be shown to possible clients, built on the free plans. Open item O3 still has to settle
  whether the free plans' terms allow that.
- **Yes to the free build project** (decision 1, step 1). It is created once its region is chosen (open item O4)
  and the engine organisation exists.
- **The paused Citizens project (Vision's old database) is no longer needed.** The founder will approve its
  removal when asked. It is not removed by this record.

**Added by the founder on 2026-11-11, step E2**, answering the open items of section 5 by question cards:

- **O1:** 219's registered legal name is left for the founder's attorney. It is needed before the launch gate.
- **O2:** the engine's code stays in this public repository for now; the founder decides before a second tenant.
- **O3:** **free plans until a client pays.** The founder judges that test software with test data, shown to
  possible clients before anyone pays, is within the free plans' non-commercial terms. This was not the
  recommended option (pay $20 + $30 a month from the first deployment a possible client sees). The paid plans
  start when a client pays, and in any case at the launch gate.
- **O4:** the pilot's project goes in **eu-central-1 (Frankfurt)**, the region Citizens already uses. Supabase
  offers 16 regions and none in Africa.
- **O4b:** the free build project is **created when step E5 starts**, not before. An idle free project pauses
  after a week, and nothing uses it before E5.
- **O5:** yes. The shared-database contract gets a one-line scope note (added in the E2 pull request).
- **O6:** break-glass defaults to **notify-and-show**. A tenant can still switch on "ask me first".
- **O7:** the founder will switch on second-factor sign-in for every account that holds the engine **before the
  engine organisation is created**.
- **O8:** the code name `engine` stays until step E6.
- **Appendix A:** `VISION.md` is left alone. The draft stays in this record only.
- **Vision's old database:** the founder removed the paused Citizens-Vision project in the Supabase dashboard on
  2026-11-11, after a check that no code, configuration or environment file pointed at it. The Citizens
  organisation now holds one project.

---

## 3. Decisions

### 3.1 Decision 1: isolation. One Supabase project per tenant, in an engine organisation

**Options**

| Option                                                        | Users                                               | What separates tenants                                             | Monthly cost per tenant (list price) | Leaving                            |
| ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ | ---------------------------------- |
| **A. One project per tenant, all in one engine organisation** | A separate sign-in system per tenant                | Structure: one tenant's database cannot be queried from another's  | About $10 after the first            | Transfer or delete one project     |
| B. One shared project, `tenant_id` on every row               | One pool of accounts for every tenant               | A row policy on every table; one wrong policy leaks across tenants | Lowest                               | Delete rows across about 80 tables |
| C. One shared project, a schema per tenant                    | Still one pool of accounts (sign-in is per project) | Schema grants plus policies                                        | Lowest                               | Drop a schema; accounts stay mixed |
| D. One project per tenant, in an organisation the tenant owns | Separate                                            | Structure, and the tenant can lock the engine owner out            | $25 each, billed to the tenant       | The tenant already holds it        |

**Choice: A.** For the pilot and by default.

**Why**

- The founder's decision is full separation. In Supabase, accounts belong to a project, so B and C cannot give a
  tenant its own users. They fail on the first requirement.
- A removes the leak instead of guarding against it. Connect's row policies stay what they are today: rules
  between one world's own users. No policy ever has to mention a tenant.
- It is the easiest model to explain to a tenant under POPIA: "your users are in your own database".
- D is stronger still, and stays available. Supabase lets an owner transfer a project to another organisation
  (same region only), so a tenant that later wants to hold its own project, or that leaves, can take it. D costs
  each tenant a full plan fee and puts tenant staff in a database console, so it is offered on request, not by
  default.

**The engine organisation is separate from the Citizens organisation.** Citizens stays where it is, on its own
free organisation, untouched. No tenant project and no control-plane project is ever created inside the Citizens
organisation.

**Prices and limits** (supabase.com/pricing and the billing, branching and project-transfer guides, fetched
2026-11-11; list prices in US dollars, before tax):

| Item                               | Free                                                                                                                  | Pro                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan fee                           | $0                                                                                                                    | From $25 a month per organisation                                                                                                                                       |
| Projects                           | 2 active per account, counted across every organisation the account owns or administers. Paused projects do not count | Each project pays for its own compute: Micro $10, Small $15, Medium $60 a month. The plan includes a $10 credit, which covers one Micro. Two Micro projects come to $35 |
| Pausing                            | Paused after 1 week without activity                                                                                  | Never paused                                                                                                                                                            |
| Backups                            | None                                                                                                                  | Daily, kept 7 days. Point-in-time recovery is an add-on: $100 a month per 7 days                                                                                        |
| Branching (a test copy per change) | Not available                                                                                                         | Billed by the hour, from $0.01344 an hour per Micro branch; the compute credit does not cover it                                                                        |
| Database size                      | 500 MB                                                                                                                | 8 GB disk per project, then $0.125 per GB                                                                                                                               |
| Monthly active users               | 50,000                                                                                                                | 100,000 across the organisation, then $0.00325 each                                                                                                                     |
| Egress                             | 5 GB                                                                                                                  | 250 GB across the organisation, then $0.09 per GB                                                                                                                       |
| File storage                       | 1 GB                                                                                                                  | 100 GB across the organisation, then about $0.021 per GB                                                                                                                |
| Logs kept                          | 1 day                                                                                                                 | 7 days                                                                                                                                                                  |
| Custom domain for the project      | Not available                                                                                                         | Add-on: $10 a month per project                                                                                                                                         |

Other facts that shape the design:

- Plans cannot be mixed inside one organisation. A free project and a paid project need two organisations.
- Pro quotas (users, egress, storage) are shared by all projects in the organisation, so tenants draw on one
  pool. The control plane's usage totals (decision 3) are how the engine owner sees who uses what.
- A project's region is chosen when it is created and a transfer cannot change it.
- The Team plan (from $599 a month) is the first plan with platform audit logs. On Pro there is no
  Supabase-side record of who opened a tenant's database in the dashboard. Decision 3 says what that means.

**What "free while building, paid at launch" means in practice** (answer 1)

Today the Citizens organisation is on the free plan with one active project and one paused project. So the
account has exactly **one free project slot left**.

1. **Build:** the pilot tenant's project takes that one slot. It is created in a new, free, engine organisation,
   only after the founder's explicit yes, which was given on 2026-11-11. It holds test data only.
2. **The control plane has no free slot.** Until launch its schema is built and proven in CI, on a throwaway
   Postgres container (GitHub's runners have Docker; the founder's PC does not). Its real project is created at
   the launch gate.
3. **Launch gate:** the engine organisation is upgraded to Pro. The pilot project stays where it is and gains
   daily backups and no pausing; nothing is moved. The control-plane project is then created beside it. Cost from
   that day: $25 + $10 = $35 a month for both.

What the free build phase cannot do, so nobody is surprised:

- **No backups.** Anything typed into the build project can be lost. This is why the launch gate is "before
  staff enter real partners", not "before listeners arrive".
- **It pauses** after a week without activity. Resuming is a click, but a demo to the tenant can find the world
  asleep.
- **No branching**, so there is no throwaway copy of the database to try a migration on. CI's build-from-empty
  proof (decision 5) stands in for it.
- **One slot only.** While the pilot project is active, no third free project can be made. (The paused Citizens
  project, Vision's old database, was removed by the founder on 2026-11-11.)
- Logs are kept for one day, and the database is capped at 500 MB.

Rejected: opening a second Supabase account to get more free projects. The limit is per person, and working
around it risks the account that also holds Citizens.

---

### 3.2 Decision 2: sign-in, per tenant

Each tenant project has its own accounts. Nothing below is shared with Citizens or with another tenant.

| Topic                 | Options                                                                                          | Choice                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in methods       | Email code only; email code plus Google; passwords                                               | **A 6-digit email code is the baseline for every tenant** (it is what Connect uses, and it needs no password storage). **Google is a switch per tenant**, off until the tenant has its own Google sign-in client. No passwords.      |
| Google sign-in client | One shared engine client; one per tenant owned by the engine; one per tenant owned by the tenant | **One per tenant, created in the tenant's own Google account.** The consent screen then shows the tenant's name, and the tenant holds it if it leaves. A shared client would show one name for every world, which breaks separation. |
| Email sender          | The engine's address for everyone; an address on each tenant's domain                            | **An address on the tenant's own domain** (for example `no-reply@` the tenant's domain), verified by DNS records the tenant adds.                                                                                                    |
| Email service account | Citizens' account; one engine account with a domain per tenant; an account per tenant            | **One engine account, separate from Citizens' account, with one domain and one sending key per tenant.** Free allows 3 domains, Pro 10, Scale 1,000 (resend.com/pricing, 2026-11-11).                                                |
| Who can sign up       | Open; invite only                                                                                | **Users (for the pilot, Listeners) sign up freely. Staff and partners are invited** (answer 4). A partner account is an ordinary tenant account that staff have linked to a partner profile.                                         |
| Tenant roles          | New role system; Connect's                                                                       | **Connect's existing model** (owner, admins, team members, profile owners), living in the tenant project.                                                                                                                            |
| Superuser accounts    | An account in each tenant; control plane only                                                    | **Control plane only.** A Superuser is never an account in any tenant, and signs in with a second factor.                                                                                                                            |

Three facts that the build steps must respect:

- **Custom email sending is not optional.** Supabase's built-in sender is limited to 2 messages an hour and only
  delivers to the project's own team (Supabase auth guide, 2026-11-11). Every tenant project needs its own SMTP
  settings before anyone outside the team can sign in.
- **Raise the email rate limit per tenant.** After custom SMTP is switched on, a project is limited to 30 emails
  an hour until the limit is raised. The pilot's first use case is an on-air call to open the app; dozens of
  sign-ins in a few minutes is the normal case, not the exception. The email plan matters for the same reason:
  the free email plan stops at 100 a day.
- **Cookies stay per tenant because each tenant has its own domain** (answer 2). If an engine sub-address is ever
  used for a build preview, sessions there must be host-only, and it must never be handed to real users.

Without the $10 custom-domain add-on, Google's consent screen shows the project's `supabase.co` address under the
tenant's name. That is acceptable for the pilot; the add-on is a per-tenant option.

---

### 3.3 Decision 3: the control plane, the Superuser and break-glass access

**What the control plane is:** one small Supabase project in the engine organisation. It has no public users and
no public API. A tenant's world never calls it while running, so if the control plane is down, every tenant keeps
working.

**Tables** (names are working names; E6 writes the schema)

| Table                   | Holds                                                                                                             | Never holds                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `tenants`               | One row per tenant: internal id, display name, status (`building`, `live`, `suspended`, `retired`), region, dates | Users, partners, messages      |
| `tenant_domains`        | The domains each tenant's world answers on                                                                        |                                |
| `tenant_infrastructure` | Identifiers only: which database project, hosting project, email domain and map key belong to the tenant          | Keys, passwords, tokens        |
| `tenant_entitlements`   | What the tenant's plan allows: which engine features may be switched on, and limits                               | The tenant's own configuration |
| `engine_releases`       | Engine versions and the schema head each one expects                                                              |                                |
| `tenant_schema_state`   | Per tenant: schema head applied, when, and the result of the last drift check                                     |                                |
| `provisioning_runs`     | The steps of creating or retiring a tenant, and where each run stopped                                            |                                |
| `usage_totals`          | Daily numbers per tenant: active users, listings, map requests, emails sent                                       | Anything about a named person  |
| `support_access_grants` | Break-glass grants (below)                                                                                        |                                |
| `audit_log`             | Every Superuser action: who, what, which tenant, why, when                                                        |                                |
| `superusers`            | Which control-plane accounts are Superusers or support operators                                                  |                                |

**Two layers of settings, in two places.** This refines section 3.3 of the plan.

- **Entitlements** belong to the engine owner and live in the control plane: what a tenant is allowed to switch
  on.
- **Configuration** belongs to the tenant and lives in the tenant's own project: its vocabulary, theme,
  categories, icons and which allowed features are on. It is the tenant's content, the tenant edits it in its own
  admin screens, and the world reads it from its own database. At provisioning the control plane seeds the first
  version; after that it records only which version is published.

A tenant's real configuration is never committed to this repository, because it would name the tenant. The
repository holds the Citizens configuration and one made-up sample tenant for tests.

**Who writes.** Only Superusers, through the console's server. Every table has row security on with no policy for
anonymous or ordinary signed-in roles, and the default table privileges Supabase grants to those roles are
revoked when each table is created. Changes go through functions that write the audit row in the same
transaction, so an unlogged change is not possible by design. `audit_log` is append-only: no update, no delete,
enforced by trigger and by grants.

**The Superuser's powers**

- Create, configure, suspend and retire tenants.
- Set entitlements.
- Ship engine versions to tenants (decision 5).
- See usage totals.
- Open break-glass support access.

**The Superuser's limits**

- No standing access to a tenant's users, messages or locations. Reading them needs a break-glass grant.
- Not an account in any tenant. Strong sign-in with a second factor.
- Every action is in the audit log. The log is the engine owner's evidence that the limits were kept.
- Suspending a tenant switches its world off for users; it does not delete anything. Retiring is a separate,
  logged step with an export or transfer offered first.

**An honest limit.** Whoever owns the engine organisation can open any tenant project in the Supabase dashboard.
On the Pro plan Supabase keeps no audit log of that. So the Superuser's limits are enforced by design inside the
engine, and by contract and discipline at the dashboard, not by cryptography. The operator agreement
(decision 7) should say that the engine owner reaches tenant data only through break-glass or logged maintenance.
A tenant that needs more than that can take option D of decision 1. Step E10 reviews this.

**Break-glass support access.** The precedent is the admin "sign in as" Phase 1 already built for one of the
Citizens apps: read-only, a required reason, a 30-minute time box, at most one active session, an audit row
written inside the same function that returns the data, a job every 5 minutes that closes abandoned sessions, and
a notice to the person afterwards. The engine uses the same shape, one level up:

1. A Superuser opens a grant in the control plane: tenant, reason (required), read-only, expiry at most 30
   minutes away. One active grant per tenant.
2. The grant is written into the tenant project as a support session. Support reads go only through reader
   functions that check the session is active and unexpired, and that log each read in the tenant project.
   Opening a private message thread needs its own reason.
3. Expiry fails closed: a reader refuses once the time has passed, whether or not the clean-up job has run. The
   job, every 5 minutes in the tenant project, closes abandoned sessions and guarantees the notice.
4. The tenant owner sees every support session and every read in their own admin screens, and gets a notice when
   one ends. The same entries are copied to the control-plane audit log.
5. No write-as-user. Phase 1 is read-only. Anything stronger needs its own decision record.
6. A tenant setting, "ask me first", makes a grant wait for the tenant owner's approval. For the pilot the
   default is notify-and-show. Which default the contract promises is the founder's and the tenant's to agree.

**Maintenance access** (applying an engine migration, repairing an incident) is a second, separate class. It is
done by the fan-out tool or by a named Superuser, and each use is logged in the control plane with the migration
or the reason. It is not a way to browse a tenant's data.

---

### 3.4 Decision 4: hosting. One Vercel project per tenant, in an engine team

**Options**

| Option                                                           | A tenant's secret keys live in           | A leaked key or a bad deploy affects | Ship a fix to all tenants |
| ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------- |
| **A. One Vercel project per tenant, same repository**            | That tenant's project only               | One tenant                           | One build per tenant      |
| B. One deployment for all tenants, tenant chosen from the domain | One place that holds every tenant's keys | Every tenant                         | One build                 |

**Choice: A**, for the pilot and until build fan-out becomes a real burden. Revisit at about ten tenants. B would
put every tenant's database service key in one runtime, so it should only be chosen together with a proper
secrets store, and that is its own decision record.

**Details**

- **A separate engine team on Vercel, not the Citizens team.** Citizens collaborators then never see tenant
  settings, and the engine's bill is its own.
- **The plan must be Pro.** Vercel's Hobby plan "is for personal, non-commercial use" (vercel.com/pricing,
  2026-11-11), and a tenant is a paying client. Pro is $20 a month per developer seat, includes $20 of usage
  credit, 10 million requests and 1 TB of transfer, with unlimited viewer seats. One seat serves every tenant
  project. Pro allows unlimited projects, 150 projects connected to one repository, and unlimited domains per
  project (vercel.com/docs/limits, page dated 2026-09-16). Whether the build phase may sit on a free plan is
  open item O3.
- **Each tenant project has its own environment**: its database address and keys, its email sending key, its map
  key, its domain, its job secret. The database service key and other secrets are stored as sensitive values, so
  they cannot be read back. They exist in that one project and nowhere else: not in the control plane, not in
  this repository, not in another tenant's project.
- **Tenant projects deploy from a release branch, not from `main`.** Citizens keeps deploying from `main`. A
  tenant receives an engine version when the Superuser promotes it, after the schema for that version has been
  applied to the tenant's database. Otherwise every ordinary Citizens merge would redeploy every tenant.
- **No preview deployments with production keys.** Today's previews talk to the live database. A tenant project
  gets production settings only; previews are off, or point at the sample tenant.
- **The tenant's domain** (answer 2) is added to its project; the tenant sets the DNS records. No fee.
- **The web app** (answer 3): each tenant's world serves its own app name, icons and colours for the home-screen
  install, taken from its configuration.

---

### 3.5 Decision 5: the engine baseline schema and how it reaches every tenant

**The problem.** Connect's schema is 204 migration files (head 202 on `main`; drafts 203 to 205 belong to
Citizens Central). They carry two other apps' schemas (34 files touch them), faith-specific seed data and years
of corrections. A tenant project must not replay that.

**Options for the baseline**

| Option                                                                                                              | Result                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A. Replay Connect's migrations into each tenant                                                                     | Brings Citizens-only tables, other apps' schemas and Citizens seed data into a tenant |
| B. Dump Connect's `public` schema and edit it by hand once                                                          | Quick, but nothing proves what was kept or cut, and it cannot be repeated             |
| **C. A curated baseline: a dump at a pinned head, cut by an explicit allow-list, reviewed, built from empty in CI** | Repeatable, reviewable, provable                                                      |

**Choice: C.**

1. **Pin the head** (202, or whatever `main` has when E5 starts) and dump the structure of `public`.
2. **Cut it with an allow-list** that comes from the boundary inventory (step E2): each table, function, policy,
   scheduled job, storage bucket and edge function is marked engine or Citizens-only. Out by default: the other
   apps' schemas, the cross-app bridges (shared profile columns, content labels, `/api/v1` keys for sibling
   apps), Central, billing, AI search, intake from Citizens' forms, and all Citizens seed data.
3. **Squash** what remains into a short, ordered set of baseline files: extensions, types, tables, functions,
   policies, grants, scheduled jobs, storage. Categories arrive empty; they are data a tenant fills (step E3).
4. **Prove it**: CI builds the baseline from an empty Postgres, runs the security checks and the rollback-only
   probes, and fails if anything Citizens-only got through.

**Internal names stay as they are.** The baseline keeps Connect's table and column names, including names such as
`contributor_*`. They are never shown to a user, and one codebase must run against both Citizens' database and a
tenant's. Renaming them only for tenants would fork the code. "Nameless" is delivered where people can see it:
on-screen words, web addresses, emails and anything a tenant's partner reads, all through the configuration
(step E3). Renaming the internals for everyone would be a Citizens migration and is out of scope.

**A second migration line.** `supabase/` at the repository root remains the one lineage for the Citizens project.
The engine baseline and its later migrations live in a separate directory beside it (working name
`supabase-engine/`, fixed in E5), with their own numbering. Nothing in it is ever applied to the Citizens
project, and nothing from `supabase/` is ever applied to a tenant.

**Drift between the two lines.** Citizens will keep migrating. From E5 on, a Citizens migration that touches an
engine-covered object must either come with a twin in the engine line or be declared Citizens-only in the
allow-list. A CI check compares the engine-covered objects of both lines, built from empty, and fails on a
difference that is not declared. This is the standing cost of leaving Citizens on its own schema history. Moving
Citizens onto the baseline would end it, and stays out of scope.

**Provisioning is more than SQL.** A new tenant project also needs: the edge functions (Connect has 13), the
scheduled jobs (including live-location clean-up and support-session expiry), the storage buckets and their
rules, the sign-in settings of decision 2, and the function secrets. The E5 tool covers all of it, and
`provisioning_runs` records each step.

**Fan-out: one engine migration, every tenant**

- Order: CI build-from-empty first, then the sample or pilot project, then each live tenant in turn. Stop at the
  first failure; never continue on its own.
- Per tenant: record the head before, apply in one transaction, run the security advisor (0 errors, 0 new
  findings), run the rollback-only probes, record the head after. This is the discipline the Citizens lineage
  already follows, repeated per tenant.
- Drift report: a hash of each tenant's engine schema compared with the hash expected for its engine version,
  stored in `tenant_schema_state`.
- App and schema move together: a tenant's hosting project is promoted to an engine version only after that
  version's schema is in its database.
- On Pro, a branch (billed by the hour) can rehearse a risky migration on a copy of one tenant. No standing
  staging project until there are three or more tenants.

**Where fan-out runs.** Not in this repository's GitHub Actions: the repository is public, so its workflow logs
are public, and they would show tenant identifiers. For the pilot, with one tenant, the Superuser runs it from a
local session, as Citizens migrations are run today. From about three tenants it moves to a private operations
repository, with an approval step and an access token limited to the engine organisation. The tenant list always
comes from the control plane, never from a file in this repository.

---

### 3.6 Decision 6: map tiles

Connect draws its map with MapLibre and loads tiles from MapTiler with a browser key. Measured cost of a visit:
about 17 tile requests on a flat map, about 27 at the current 45 degree tilt (`docs/audit/map-tiles.md`,
`docs/MAP_UX_TRACKER.md`).

MapTiler plans (maptiler.com/cloud/pricing, 2026-11-11):

| Plan   | Price       | Included a month                  | Over the limit                                     | Terms that matter                                   |
| ------ | ----------- | --------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| Free   | $0          | 5,000 sessions, 100,000 requests  | The service pauses until next month                | Non-commercial use, MapTiler logo on the map, 1 key |
| Flex   | $30 a month | 25,000 sessions, 500,000 requests | $2.50 per 1,000 sessions, $0.15 per 1,000 requests | Commercial use, 1,000 keys, 3 team members          |
| Custom | By contract | By contract                       | By contract                                        |                                                     |

**Options**

| Option                                                                   | Cost                        | Separation                                                        |
| ------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------- |
| One Citizens key shared with tenants                                     | $0                          | None. A busy tenant would switch Citizens' map off                |
| **One engine account on Flex, one key per tenant, locked to its domain** | $30 a month for all tenants | Usage is visible per key; a tenant's key works only on its domain |
| One MapTiler account per tenant                                          | $30 a month each            | Full, and the tenant can hold the bill                            |

**Choice: one engine account on Flex, separate from Citizens' account, with one key per tenant restricted to
that tenant's domain.** The free plan is not an option for a live tenant: it is for non-commercial use, and it
pauses the map at the limit. A tenant that wants its own map bill can have its own account; the design is the
same, only the key changes.

**What it means in visits.** At 27 requests a visit, Flex's 500,000 requests cover about 18,500 map visits a
month across all tenants. Each further 1,000 visits costs about $4 (27,000 requests at $0.15 per 1,000). The
audit could not tell whether MapTiler counts a MapLibre client in sessions, in requests, or in both; the first
month of real use settles it.

**This is the cost that grows with success.** A radio audience can be large and arrives in bursts. Three levers,
in order:

1. Make the map tilt a tenant setting. A flat map is 17 requests a visit, not 27.
2. Report tile use per tenant in `usage_totals`, so the tenant's price can follow it.
3. Above roughly 100,000 visits a month in total, compare self-hosted tiles or another provider. That is a
   separate decision record; the map-tiles audit already lists two alternatives.

The same key also serves address look-ups when listings are created, which count as requests.

During the build phase a free key keeps the cost at $0 only if MapTiler's non-commercial term allows it. That
question is already open for Citizens' own account (D12 in the map tracker), and the founder decides it for the
engine too (open item O3).

---

### 3.7 Decision 7: POPIA roles (a pointer, not legal advice)

This section points at the parts of the Protection of Personal Information Act that the design touches, so the
founder knows what to ask an attorney. It is not legal advice.

| Party                                                    | Likely role                        | For which information                                                                |
| -------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| The tenant                                               | Responsible party                  | Its users, its staff, its partners' contact people: everything in its tenant project |
| The engine owner                                         | Operator, acting for the tenant    | The same information, which it hosts and maintains                                   |
| The engine owner                                         | Responsible party                  | Its own control-plane records: tenant contacts, Superuser accounts, the audit log    |
| Supabase, Vercel, the email, map and rate-limit services | Further operators (sub-processors) | Whatever passes through them                                                         |

Points for the attorney:

- **A written operator agreement between each tenant and the engine owner** (sections 20 and 21): the operator
  processes only with the tenant's authorisation, keeps the information confidential, maintains the security
  measures of section 19, and tells the tenant at once if it suspects a breach, so the tenant can meet its duty
  to notify under section 22. Break-glass (decision 3) should be written into it as the only way the operator
  reads tenant data.
- **Information stored outside South Africa** (section 72). Tenant projects are hosted in a cloud region chosen
  at creation, and the other services are abroad too. The tenant's privacy notice must say so, and the region
  cannot be changed later.
- **The legal page** (answer 6): the tenant's privacy notice and terms name the engine owner as its service
  provider. The owner is 219 for now; open item O1 covers its registered name.
- **Location is personal information.** Live location and "near me" need a clear purpose and consent in the
  tenant's own wording. The engine's clean-up of live locations supports keeping them no longer than needed.
- **Marketing messages** from a tenant to its users (push, email) fall under section 69's consent rules, and they
  are the tenant's messages, sent from the tenant's own sender.
- **Each tenant is its own responsible party with its own Information Officer.** The engine owner's registration
  does not cover a tenant.
- **Leaving:** the agreement should say what happens to the tenant's project at the end (transfer or deletion,
  and by when). Decision 1 makes both simple.

Because the engine handles no payments (answer 5), no card data or bank details enter the engine.

---

### 3.8 Decision 8: costs per month

List prices in US dollars on 2026-11-11, before tax and before any exchange-rate effect. These are the engine
owner's costs, not prices agreed with anyone.

**Fixed costs**

| Service                       | Build phase (pilot, test data only)                  | Pilot live (1 tenant)                                                              | 5 tenants live                                             |
| ----------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Supabase                      | $0 (the last free project slot; control plane in CI) | $35 (Pro $25, covering one project, + $10 for the second: control plane and pilot) | $75 (Pro $25 + 5 further projects at $10)                  |
| Vercel                        | $0 to $20 (open item O3)                             | $20 (Pro, one developer seat)                                                      | $20                                                        |
| MapTiler                      | $0 to $30 (open item O3)                             | $30 (Flex, shared)                                                                 | $30, plus usage above 500,000 requests                     |
| Email (Resend)                | $0 (free: 3,000 a month, 100 a day)                  | $20 (Pro: 50,000 a month, 10 domains)                                              | $20                                                        |
| Rate limiting (Upstash Redis) | $0 (free: 1 database, 500,000 commands a month)      | $0                                                                                 | About $1 to $5 (pay as you go, $0.20 per 100,000 commands) |
| Tenant's domain               | Paid by the tenant                                   | Paid by the tenant                                                                 | Paid by the tenant                                         |
| **Total**                     | **$0 to $50**                                        | **$105**                                                                           | **About $150**                                             |
| **Per tenant**                |                                                      | **$105**                                                                           | **About $30**                                              |

Each tenant after the first adds about $10 a month in fixed cost (its database project), plus its usage. The
first tenant carries the fixed base: the control plane, the hosting seat, the map plan and the email plan.

**Costs that grow with use**

| What grows              | Included                                | After that                                 | Example                                             |
| ----------------------- | --------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| Map visits              | About 18,500 a month across tenants     | About $4 per 1,000 visits                  | 50,000 visits a month: about $128 on top of the $30 |
| Active users (Supabase) | 100,000 a month across the organisation | $0.00325 each                              | 120,000 users: $65                                  |
| Emails (sign-in codes)  | 50,000 a month                          | $0.90 per 1,000                            | 60,000 emails: $9                                   |
| Database size           | 8 GB per project                        | $0.125 per GB                              |                                                     |
| Hosting traffic         | 10 million requests, 1 TB a month       | From $2 per million requests, $0.15 per GB |                                                     |

**Optional, per tenant:** a custom domain for the database project ($10 a month, only useful to brand Google
sign-in); point-in-time recovery ($100 a month per 7 days); a larger database (Small $15, Medium $60 a month
instead of Micro $10); a rehearsal branch (about $0.32 a day while open). A store app would add store fees and a
native build; those prices were not checked in this session.

The price a tenant pays is the founder's to set. A sound floor is the tenant's share of the fixed base, its own
$10, and its measured usage.

---

## 4. Consequences

**Easier**

- No cross-tenant leak to guard against in row policies. Connect's security model carries over unchanged.
- A tenant can leave with its whole world: one project to transfer or delete.
- One tenant's incident, bad deploy or leaked key stays inside that tenant.
- The engine handles no money.

**Harder, and accepted**

- Two migration lines to keep in step (decision 5) until Citizens itself moves onto the baseline.
- Every engine change is applied once per tenant, and the app must wait for the schema.
- A fixed base of about $105 a month from the launch gate, whatever the pilot's traffic.
- The build phase has no backups and can pause. Real content must wait for the launch gate.
- The limit on the Superuser at the database dashboard rests on contract and discipline, not on technology.

**Things this record does not change**

- The Citizens project, its organisation, its `supabase/` lineage and its apps.
- The rules of `apps/connect/docs/SHARED_DB_CONTRACT.md`. Its rules R1.1 (a new ecosystem app gets a schema, not
  a project) and R6.1 (one identity) are about ecosystem apps. A tenant is not an ecosystem app, so those rules do
  not reach it. The founder approved a one-line scope note saying so (open item O5, 2026-11-11); it was added in
  step E2's pull request and changes no rule.
- `VISION.md`. The founder chose to leave it alone (Appendix A stays a draft).
- The facelift (pull requests 348 to 351) and Central.

---

## 5. Open items

Asked in step E2 on 2026-11-11 and answered by the founder (section 2 has the dated note). What is still open is
marked.

| #   | Question                                                                                       | Answer (2026-11-11)                                                                                                                                                                                                    | Still open                                                                                                                                                                                           | Needed by                      |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| O1  | Which legal entity owns the engine and signs operator agreements?                              | **219 owns the engine, for now.** Its registered legal name is left for the founder's attorney.                                                                                                                        | 219's registered name (what a tenant's legal page shows, answer 6), that it signs the operator agreements, and how renting software sits with its status: questions for the attorney and accountant. | Before the launch gate         |
| O2  | Should the engine's code stay in a public repository once tenants pay?                         | **Public for now.** The founder decides before a second tenant.                                                                                                                                                        | The decision itself; separately, a private operations repository for fan-out at about three tenants.                                                                                                 | Before a second tenant         |
| O3  | The build phase on free plans (Vercel's and MapTiler's free plans are for non-commercial use). | **Free plans until a client pays**, by the founder's judgement that an unpaid trial on test data is within the terms. Not the recommended option ($20 + $30 a month from the first deployment a possible client sees). | None. The paid plans start when a client pays, and at the launch gate at the latest. MapTiler's free plan pauses the map at 100,000 requests a month and shows its logo.                             | Step E8                        |
| O4  | Which cloud region for the pilot's project?                                                    | **eu-central-1 (Frankfurt)**, where Citizens runs. Supabase offers 16 regions, none in Africa. The project is created when step E5 starts.                                                                             | None. The tenant's privacy notice must say its data is stored in the EU (decision 7).                                                                                                                | Step E5                        |
| O5  | A one-line scope note in the shared-database contract.                                         | **Yes.** Added in step E2's pull request.                                                                                                                                                                              | None.                                                                                                                                                                                                | Done                           |
| O6  | Break-glass default in the contract.                                                           | **Notify-and-show.** A tenant can switch on "ask me first".                                                                                                                                                            | Wording in the operator agreement.                                                                                                                                                                   | Operator agreement             |
| O7  | Second-factor sign-in on the accounts that hold the engine.                                    | **Yes**, switched on by the founder before the engine organisation is created.                                                                                                                                         | None in this record.                                                                                                                                                                                 | Before the engine organisation |
| O8  | The engine's real name.                                                                        | **Keep the code name `engine`** until step E6.                                                                                                                                                                         | The name.                                                                                                                                                                                            | Before E6's console            |

---

## 6. What this changes in the plan

Section 6 of [`ENGINE_PLAN.md`](./ENGINE_PLAN.md) is updated in the same pull request:

- **E3** designs two layers (entitlements in the control plane, configuration in the tenant project), plus the
  home-screen app details, the legal-page operator field and the words used in web addresses. Real tenant
  configurations never enter this repository.
- **E5** now also needs E2, because the baseline is cut by E2's allow-list. It covers functions, jobs, storage
  and sign-in settings as well as SQL, proves the baseline in CI, and uses the one free project slot.
- **E6** is built and tested in CI. The real control-plane project is created at the launch gate.
- **E8** ends with the launch gate: upgrade the engine organisation, create the control plane, move hosting, map
  and email to paid plans, and only then let staff enter real partners.
- **E9**'s offers are codes and attribution only. No payments.

---

## Appendix A: draft line for `VISION.md` (not applied: the founder chose on 2026-11-11 to leave `VISION.md` alone)

Proposed as a short section after "The ecosystem (one north star, many channels)":

> ## The engine (technology, not a channel)
>
> The map, profiles, events and connection features under Citizens Connect are built as a general engine. Other
> organisations may rent that engine and run their own separate world on it, with their own name, users, partners
> and data. Those worlds are not part of the Citizens ecosystem: no Citizens data goes to them, and none of
> theirs comes to Citizens.
>
> Engine work serves this vision in one way: every improvement to the engine is an improvement to Citizens
> Connect. When a session works on the engine, run the alignment self-prompt on excellence as stewardship, and on
> what the change does for Citizens Connect.

One sentence was left out on purpose, because the founder has not said it: that renting the engine helps sustain
Citizens. If that is the intent, it belongs in the second paragraph.

---

## Appendix B: sources

All fetched on 2026-11-11 unless a date is given.

| Source                                                                | Used for                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| https://supabase.com/pricing                                          | Plans, compute prices, quotas, backups, add-ons, free-plan limits    |
| https://supabase.com/docs/guides/platform/billing-on-supabase         | Billing per organisation, the two-project free limit, shared quotas  |
| https://supabase.com/docs/guides/platform/manage-your-usage/branching | Branch pricing                                                       |
| https://supabase.com/docs/guides/platform/project-transfer            | Moving a project between organisations                               |
| https://supabase.com/docs/guides/auth/auth-smtp                       | Built-in email limits, custom SMTP per project, the 30 an hour limit |
| https://vercel.com/pricing                                            | Plans, the non-commercial term, Pro's seat price and included usage  |
| https://vercel.com/docs/limits (page dated 2026-09-16)                | Projects, projects per repository, domains per project               |
| https://www.maptiler.com/cloud/pricing/                               | Map plans, limits, overage, the non-commercial term                  |
| https://resend.com/pricing                                            | Email plans, daily limit, domains per plan                           |
| https://upstash.com/pricing/redis                                     | Rate-limit store plans                                               |
| The Citizens Supabase organisation, read through its management tools | Current plan (free), one active and one paused project               |
| `docs/audit/map-tiles.md`, `docs/MAP_UX_TRACKER.md`                   | Tile requests per visit (17 flat, 27 tilted)                         |
| `supabase/migrations/` at `main`                                      | Migration count, head 202, the "sign in as" Phase 1 precedent        |

Not confirmed in this session: which Vercel plan the Citizens team is on; whether MapTiler meters a MapLibre
client in sessions or requests; store-app fees; that an email sending key can be limited to one domain (to check
in E8). The Supabase regions on offer were confirmed in step E2 from the Supabase management tools' project
creation options (16 regions, none in Africa).
