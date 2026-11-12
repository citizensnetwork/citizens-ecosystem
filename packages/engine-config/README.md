# @engine/config: the tenant configuration contract

Engine step E3. Read with [`docs/engine/ENGINE_PLAN.md`](../../docs/engine/ENGINE_PLAN.md),
[`ADR-001`](../../docs/engine/ADR-001-engine-architecture.md) (decisions 3 and 5) and
[`BOUNDARY_INVENTORY.md`](../../docs/engine/BOUNDARY_INVENTORY.md).

The map engine is one codebase. What makes it "Citizens Connect" or a tenant's own world is a
document: the **configuration**. This package says what that document may contain, checks it, and
holds two of them: the Citizens configuration and one made-up sample tenant.

Nothing here is wired into an app yet, and nothing is stored anywhere. Step E7 wires the frontend
to it; step E5 decides where the document lives in a tenant's database.

This repository is public. No real tenant's configuration is ever committed here.

## The two layers

| Layer             | Who writes it    | Where it lives           | What it says                                                                                                                               |
| ----------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Entitlements**  | The engine owner | The control plane        | Which features a world may switch on, its limits (steepest map tilt, longest category list), and whether it must name its service provider |
| **Configuration** | The tenant       | The tenant's own project | Its words, colours, categories, layout, home-screen app details, map settings, and which of the allowed features are on                    |

**The rule between them: a configuration can only switch on what its entitlements allow.**
`validateConfiguration(configuration, entitlements)` enforces it. `createWorld` applies it a
second time when a world starts, so a document nobody checked still cannot switch on a feature
that was not allowed.

A running world never calls the control plane (ADR-001, decision 3). It checks against a read-only
copy of its entitlements that the control plane writes into the tenant's project. Where that copy
is stored is step E5's decision.

## What a configuration holds

| Part            | What it is                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract`      | The contract version the document follows, for example `"1.0"`                                                                                                                                       |
| `revision`      | A whole number the tenant's project raises by one each time it publishes                                                                                                                             |
| `app`           | The home-screen app details: title-bar colour, start-up colour, icons, favicon, the world's mark. The app's name and description come from the vocabulary                                            |
| `legal`         | `serviceProvider`: one line of plain text naming the service provider on the world's legal page. It is the only place a tenant's world names the engine owner. The contract does not fix the wording |
| `vocabulary`    | The terms, the messages the tenant worded itself, the words in web addresses, and the sign-in slogan                                                                                                 |
| `theme`         | Colour tokens for a light and a dark set, and two font stacks                                                                                                                                        |
| `categories`    | Categories as data: map groups, card groups, event categories, place categories, partner types, partner kinds, gathering starters                                                                    |
| `features`      | The feature switches that are on. A missing feature is off                                                                                                                                           |
| `layout`        | Which optional components and controls the world shows, and the order of its navigation                                                                                                              |
| `map`           | `tiltDegrees` and where the map opens                                                                                                                                                                |
| `ideas`         | The ideas board's ladder of goals (needed while that feature is on)                                                                                                                                  |
| `partnerLevels` | The partner level badges (needed while that feature is on)                                                                                                                                           |

The document is plain JSON: no functions, no dates, nothing that cannot be stored in a database
column. `configurationJsonSchema()` gives its shape as JSON Schema for a database check or an
admin form.

## Vocabulary

Internal names stay as they are (`contributor_*` tables, `/api/contributor/...` routes). Everything
a person can see goes through the vocabulary.

**Terms** are the nouns a tenant renames. A term is written the way it reads in the middle of a
sentence, with its plural: `{ one: 'member', many: 'members' }`, or `{ one: 'Contributor', many:
'Contributors' }` for a world that always writes it with a capital. The capitalised forms and the
article ("a" or "an") are worked out and can be set by hand. `world` and `worldShort` have no
default, so every world must name itself.

**Messages** are the engine's sentences. Each has a neutral default written with placeholders:

| Placeholder                       | Gives (for `partner: { one: 'host', many: 'hosts' }`) |
| --------------------------------- | ----------------------------------------------------- |
| `{partner}`                       | host                                                  |
| `{partner:many}`                  | hosts                                                 |
| `{partner:One}`, `{partner:Many}` | Host, Hosts                                           |
| `{partner:a}`, `{partner:A}`      | a host, A host                                        |
| `{$name}`                         | A value filled in when the message is shown           |

A tenant that only sets its terms gets a complete world in its own words ("Become a host", "Host
Portal", "a host you follow"). It can also replace any single message. The Citizens configuration
does that wherever today's wording is not the pattern ("Kingdom Exploration", "About your
ministry").

The catalogue covers the five places a person meets the engine's words: screens, emails,
notifications, page metadata (the browser title, the calendar file's producer line) and the web
manifest (the home-screen app's name and description). A message's key starts with its channel.

Messages are plain text: no `<` or `>`, no control characters, and no line break in a message
marked single-line (an email subject, a sender name). Whoever shows a message escapes it for the
place it goes.

**Words in web addresses.** Four framing words appear in addresses today: `contributor`,
`contributors`, `citizens` and `contributor-applications`. `vocabulary.addresses` maps each one to
the word a tenant's world shows. The internal route keeps its name; step E7 rewrites the tenant's
word onto it. A word cannot be one the engine already owns (`admin`, `api`, `map`, …) and cannot be
used twice. Citizens keeps the internal words, so nothing is rewritten for it.

### Notification text written inside database functions

Six database functions write notification text themselves (inventory, section 1.3). They cannot
import this package. The contract reaches them like this:

1. Every message says who writes it out: `renderedBy` is `app`, `server`, `edge` or `database`.
2. `world.wording('database')` returns those messages in the world's own words, with terms already
   filled in and `{$name}` values left in place.
3. When a configuration is published, those rows (key, text) are written to a wording table in the
   tenant's database, in the same transaction as the configuration itself. Step E5 creates the
   table.
4. A database function reads its text by key through one helper and fills the values. If a key
   is missing it uses the engine's neutral default, which the baseline carries as seed rows made
   from the same catalogue.

So the functions never hold a sentence of their own, and a tenant's notification never says
"Contributor". `world.wording('edge')` does the same for the edge functions.

## Theme tokens

Tokens are named by role (`surface0`, `text1`, `accent`, `accentInk`, …) and follow the names the
app's stylesheets already use, so a theme is written into the page as CSS variables without
renaming anything (`themeCssVariables`). The facelift keeps these roles; it is still moving
hard-coded colours onto them.

A value is a hex colour or an `rgb()`/`rgba()` value and nothing else, because it ends up inside a
style block. A theme that people cannot read is refused: the pairs in `CONTRAST_RULES` must meet
WCAG AA in both colour sets, and a map group's colour must reach 3:1 on every surface.

## Feature switches

Every switch is off unless a configuration switches it on.

| Feature                | Line     | What it is                                                                            |
| ---------------------- | -------- | ------------------------------------------------------------------------------------- |
| `partnerInvitations`   | engine   | Staff create a partner listing and invite its owner to manage it                      |
| `partnerApplications`  | engine   | Anyone may apply to become a partner                                                  |
| `communityEvents`      | engine   | A user who is not a partner may post one community event a week                       |
| `communityIdeas`       | engine   | The ideas board (Kingdom Projects in Citizens), with the tenant's own name and ladder |
| `gatherings`           | engine   | Small gatherings from a list of starters                                              |
| `liveLocation`         | engine   | Sharing a live location for a short time                                              |
| `partnerLevels`        | engine   | The level badge on a partner profile                                                  |
| `googleSignIn`         | engine   | Google sign-in beside the email code                                                  |
| `publicApi`            | citizens | The public data feed                                                                  |
| `aiSearch`             | citizens | Search that answers a typed question                                                  |
| `listingAutomation`    | citizens | The listing helper                                                                    |
| `formIntake`           | citizens | Listings created from an outside form                                                 |
| `personalisationGames` | citizens | Short games that tune what a user sees                                                |

"Line" is the database line that carries what the feature needs (ADR-001, decision 5). A
`citizens` feature depends on things that are not in the engine baseline, so the engine owner
cannot allow it to a tenant; `validateEntitlements` refuses it.

There is no payment feature, and none may be added: the engine takes no payments.

Two founder decisions of 2026-11-11 are built in:

- **A tenant gets no public data feed.** `publicApi` is on the Citizens line. If a tenant ever
  needs a feed, it is a new version with neutral field names.
- **The ideas board stays in the engine, off by default.** A tenant gets it only if the engine
  owner allows it and the tenant switches it on, with its own term for a project and its own
  ladder (`ideas.tiers`).

For the pilot the switches are: partner invitations on, open partner sign-up off. The sample
tenant is set the same way.

## Components and controls

`COMPONENTS` and `CONTROLS` (registry.ts) list the parts a world can arrange. A core component is
always there. A part with a feature exists only while that feature is on. `layout.navigation` is
the main navigation in the tenant's order.

## Map tilt

`map.tiltDegrees` is a tenant setting, from 0 (flat) to 60. A flat map is about 17 tile requests a
visit and 45 degrees is about 27 (ADR-001, decision 6), so the engine owner can cap it:
`limits.mapTiltMaxDegrees` in the entitlements.

## Versions

- `contract` is `major.minor`. A **minor** step only adds (an optional field, a feature that is off
  unless switched on, a message or term with a default). A **major** step is anything that could
  make a valid document invalid; it ships one upgrade function in `UPGRADE_STEPS`.
- An engine build reads its own major at its own minor or lower. It refuses a newer document
  (it would silently ignore settings it does not know) and an older major until `upgradeDocument`
  has carried it forward.
- Adding a message to the catalogue is not a contract change: a configuration holds only the
  messages it words itself. Removing or renaming one is a major step.
- `revision` counts a tenant's published editions. It has nothing to do with the contract
  version.

## The two configurations

- **`citizensConfiguration`** is Citizens Connect as it is today. `test/citizens-parity.test.ts`
  reads Connect's own files (the manifest, the stylesheets, the category lists, the screens, the
  email templates, the migrations that hold notification text) and fails when a value stops
  matching. Until E7, Connect's files are what a person sees and the configuration is the record
  of them.
- **`sampleConfiguration`** is "Quillfern Commons", a made-up neighbourhood world. It is unlike
  Citizens on purpose: lower-case terms, a flat map, no slogan, a required service provider, and
  entitlements that allow less than the engine offers.

## Using it

```ts
import { createWorld, validateConfiguration } from '@engine/config';

const result = validateConfiguration(document, entitlements);
if (!result.ok) {
  // result.issues: [{ code, path, message }], in plain language
} else {
  const world = createWorld(result.value, entitlements);
  world.t('screen.apply.title'); // "Become a host"
  world.hasFeature('communityIdeas'); // false
  world.cssVariables('dark'); // { '--surface-0': '#0f1513', ... }
  world.manifest(); // the home-screen app file
}
```

`@engine/config/world` is the same `createWorld` without the validation library, for the browser
app.

## Not in the contract yet

These lists are still Citizens data inside Connect. Each is added when step E7 wires the feature
that uses it; adding an optional field is a minor step.

- The "Where to…" intents and the quick-access tools under the map's menu button.
- The partner onboarding presets, the interests and the search profile (audiences, needs, vibes).
- The question pool of the personalisation games.
- Email bodies. The catalogue holds subjects, the sender name and the sign-off; the bodies move in
  E7 with the email templates.
- A world's base path. It is a hosting setting (a tenant serves its own domain with none).
