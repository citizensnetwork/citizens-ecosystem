# The Reader: a founder's guide

The Reader keeps listings fresh without anyone retyping them. Once a day it looks at the public
websites and calendars of Contributors who chose **automatic updates**. It turns the events and news
it finds there into **suggestions**, which wait on that Contributor's Dashboard → **Suggestions** tab.
It also nudges each owner, at most once a day, by email.

- **No AI at run time.** It is a plain script with fixed rules, so it costs no tokens and gives the
  same answer every time.
- **Consent first.** It reads only Contributors whose automatic-updates level is _Suggest_ or _Events
  automatically_, and only sources they switched on. The server checks this again on every item.
- **Nothing goes live without the owner**, with one exception: a _future_ event at the level _Events
  automatically_.
- **Free to run.** It runs on GitHub Actions, and standard runners are free for a public repository.

## What it reads, and what it never reads

| It reads                                                                                   | It never reads                                                                   |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Events marked up on a web page (schema.org `Event`; most church sites and plugins do this) | Facebook, Instagram, TikTok, WhatsApp or Threads, whatever links there           |
| Calendars (`.ics`) and news feeds (RSS/Atom) that the page itself links to                 | Comment feeds: these hold individuals' words, not the organisation's news        |
| A calendar or feed address given directly as the source                                    | Private or cancelled calendar entries, and all-day entries with no start time    |
| Pages that the site's `robots.txt` allows                                                  | Anything `robots.txt` disallows, any private network address, any non-https page |

**YouTube is not read in this version.** youtube.com's `robots.txt` disallows its video feeds for
every crawler, and the Reader honours `robots.txt`. A YouTube source shows the status "YouTube is not
read yet" on the owner's Dashboard. Reading YouTube properly needs the YouTube Data API, which needs a
Google key as a fourth secret. That is a decision for you to make later.

**Google Calendar cannot be read either.** calendar.google.com's `robots.txt` disallows everything
except its home page (checked 2026-10-25), so a Google Calendar address shows "blocked by robots.txt".
The sources that work best are:

- the organisation's own **events page**. Most WordPress event plugins and website builders mark
  events up for search engines, and that markup is exactly what the Reader reads;
- a `.ics` calendar file or an RSS/Atom feed on **their own site**;
- any page that links to such a calendar or feed.

## 1. Add the three secrets (once)

Open GitHub → the repository → **Settings → Secrets and variables → Actions → New repository
secret**, and add:

| Name                     | Value                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `AUTOMATION_SUGGEST_KEY` | the key with scope `automation:suggest` (minted 2026-10-21; in your password manager) |
| `AUTOMATION_DIGEST_KEY`  | the key with scope `automation:digest` (minted the same day)                          |
| `CONNECT_BASE_URL`       | `https://www.citizenscentral.co.za`                                                   |

Paste each key straight from the password manager into GitHub. Never put a key in a chat, an issue
or a file. GitHub hides secrets in logs, and the Reader never prints them either.

Until the suggest key is added, a scheduled run just says "Not set up yet" and finishes green.

## 2. The first dry run

Open **Actions → Reader → Run workflow**, leave **mode** on `dry-run`, and press **Run workflow**. A
dry run reads every due source and prints counts. It sends **nothing** to Connect: no suggestions,
no status line and no email.

Open the finished run and look at its **Summary**. It shows one row per source:

| Source   | Kind    | What the Reader found                              | Sent to Connect |
| -------- | ------- | -------------------------------------------------- | --------------- |
| 1a2b3c4d | website | 2 events and 1 post found (1 without a start time) | dry run         |
| 5e6f7a8b | youtube | YouTube is not read yet                            | dry run         |

- **Source** is the first 8 characters of the source's id. The log is public, so it never shows an
  address or a name. To see which listing a row belongs to, search for that id in Supabase
  (`listing_sources.id`).
- **What the Reader found** uses a fixed set of phrases. The same line appears on the owner's
  Dashboard as "last checked". The phrases are:
  - "_N events and M posts found_": all good. The note in brackets counts what was left out, such
    as entries with no start time, rules that could not be read exactly, or private entries.
  - "_no upcoming events or recent posts found_": the page was read, but nothing on it was new.
  - "_blocked by robots.txt_" / "_robots.txt unavailable_": the site asks crawlers to stay away, or
    did not answer. The Reader respects that and tries again tomorrow.
  - "_HTTP 404_", "_timed out_", "_could not connect_", "_address lookup failed_": the site is down
    or the address is wrong. The owner can fix the address on their Dashboard.
  - "_not a public https address_" / "_this site is never read_": the address is not allowed.
- **Sent to Connect** (live runs only) counts suggestions that are _pending_, _published_
  (automatic events), _already known_ (seen on an earlier day) and _refused_ (the server's rules
  said no).

## 3. Switch it on

1. Run it once by hand with **mode** set to `live`. Check the Summary and one owner's Suggestions tab.
2. To make the daily run live as well, go to **Settings → Secrets and variables → Actions →
   Variables → New repository variable** and add `READER_LIVE` with the value `true`. Without this
   variable, the daily 06:23 (South African time) run stays a dry run.

## Switch it off

- **Pause the live runs:** change `READER_LIVE` to `false`, or delete it. The daily run goes back to
  being a harmless dry run.
- **Stop it completely:** **Actions → Reader → ⋯ → Disable workflow**.
- **One owner:** the owner sets automatic updates to _Off_ on their Dashboard. That switches off
  every one of their sources at once, and they are never offered to the Reader again.

## Roll (replace) a key

1. Mint a new key with the same scope: `POST /api/admin/api-keys` with an admin session and the
   body `{ "name": "Reader suggest", "owner_id": "<your admin id>", "scopes": ["automation:suggest"] }`
   (or `automation:digest`). The raw key is shown **once**: put it straight into the password manager.
2. Paste it into the matching GitHub secret (Settings → Secrets → the secret → Update).
3. Start a dry run. When it is green, revoke the old key with `DELETE /api/admin/api-keys?id=<old key id>`.
   `GET /api/admin/api-keys` lists the ids and prefixes.

A third key minted on 2026-10-21 is a digest key that was labelled "automation suggest" by mistake
(its prefix is in RESUME_HERE, item T5). Nothing uses it, so you can revoke it now.

## A test walk (about 15 minutes)

The repository holds a test calendar with one made-up weekly event, "Reader test event (please
dismiss)". Its address once this is merged is

`https://raw.githubusercontent.com/citizensnetwork/citizens-ecosystem/main/apps/connect/scripts/reader/test-calendar.ics`

1. Sign in to Connect as a test Contributor you control (not a real organisation's listing). Under
   Dashboard → Profile → **Automatic updates**, choose _Suggest_. Then add a source of type **Calendar
   link (.ics)** with the address above.
2. **Actions → Reader → Run workflow → dry-run.** The Summary shows a row for that source reading
   "2 events found" (the next two weekly dates). The other rows are your real opted-in listings.
3. Run it again with **live**. The row now shows "2 pending". Open Dashboard → **Suggestions**, where
   both wait marked "From raw.githubusercontent.com". Dismiss them. (Approving one would publish it on
   the map, so don't approve unless you want to watch that and delete it afterwards.)
4. The digest email ("you have new suggestions") arrives at that Contributor's address. It is sent at
   most once a day.
5. Run live again. The row shows "2 already known", so nothing is suggested twice.
6. Clean up: set automatic updates back to _Off_. Its source is switched off at once.

## For developers

```bash
cd apps/connect
node scripts/reader/run.mjs --help
AUTOMATION_SUGGEST_KEY=... CONNECT_BASE_URL=http://localhost:3000 node scripts/reader/run.mjs   # dry run against a local server
```

- `run.mjs` is the entry point. `connect.mjs` is the client for `/api/automation/{sources,suggestions,digest}`.
  `net.mjs` is the polite fetcher: https only, default port, public addresses checked inside the
  connection's own DNS lookup, `robots.txt`, one request a second per host, 10 s, 1 MB, every redirect
  re-checked. `source.mjs` reads one source. The parsers are `html.mjs`, `jsonld.mjs`, `xml.mjs`,
  `feed.mjs` and `ics.mjs`, with `time.mjs` and `robots.mjs` as helpers.
- The script uses no dependencies and writes no file. The workflow pipes its report into the run Summary.
- Tests: `src/__tests__/reader/`, `src/__tests__/api/automation/sources.test.ts` and
  `src/__tests__/security/readerWorkflow.test.ts`. Mutation check: `node scripts/mutation/reader.mjs`.
- Limits (in `source.mjs`): at most 20 items per source a day, with 5 kept for posts. Posts must be
  from the last 14 days. A repeating event is suggested at most twice within 14 days, and a one-off
  event up to a year ahead. A time with no zone is read as South African time.
