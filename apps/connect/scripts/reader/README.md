# The Reader (Listing Automation, Phase 2)

The Reader keeps Contributors' listings current **without a language model**. Once a day a small job reads
the public website, calendar and feeds that an owner has chosen to share, and hands what it finds to Citizens
Connect as **suggestions**. The owner approves, edits or dismisses each one. Nothing publishes without the
owner, except a **future event** for an owner who chose "publish events automatically" (the server enforces
that, not the Reader).

It costs no Claude tokens: it is a plain Node script (`run.mjs`) run by a GitHub Actions workflow
(`.github/workflows/reader.yml`). A daily job on a public repository is free within GitHub's normal allowance.

**Until someone opts in it does nothing.** Today every Contributor's automation level is `off`, so the Reader
finds zero sources, reads nothing, and exits quietly.

## Set it up (one time)

1. **Add three secrets** in GitHub: the repository, **Settings**, **Secrets and variables**, **Actions**,
   **New repository secret**. The values come from your password manager.

   | Secret name              | Value                                                |
   | ------------------------ | ---------------------------------------------------- |
   | `AUTOMATION_SUGGEST_KEY` | the full raw key whose scope is `automation:suggest` |
   | `AUTOMATION_DIGEST_KEY`  | the full raw key whose scope is `automation:digest`  |
   | `CONNECT_BASE_URL`       | `https://www.citizenscentral.co.za`                  |

   Paste each value exactly, with no quotes and no spaces. The two keys are different: the suggest key lists
   sources and posts suggestions, the digest key only triggers the "you have new suggestions" email.
   The extra key you minted by mistake (labelled suggest but scoped digest) is not needed
   and can be revoked.

2. **First run, as a dry run.** Open the **Actions** tab, choose **Reader** in the left list, click **Run
   workflow**. Leave **Dry run** ticked and run it. A dry run reads the sources and counts what it finds, but
   posts nothing and sends no email.

3. **Read the summary.** Open the finished run; the **Summary** page lists one line per source, like

   > - `aaaaaaaa website: 3 events, 1 post -> 4 pending`

   The first word is the first 8 characters of the source's id (never an address or a name), then its kind
   (`website`, `youtube` or `calendar`), then what was found (for example `3 events, 1 post`, `no events found`,
   `HTTP 404`, `blocked by robots.txt`), then, on a live run, how many suggestions were new, published or already
   known (`dry run` on a dry run).

   With nobody opted in you will see `Sources due: 0` and a green tick. That is correct.

4. **Try it for real with one test Contributor** (see the walk below), then leave the daily schedule on. It
   runs at about 05:23 South African time (03:23 UTC) and, unlike a manual run, is always live.

## Founder test walk

1. Sign in as a **test Contributor** (an approved listing you own). On the **Dashboard**, **Profile** tab,
   open the **Automatic updates** card, choose **Suggest updates for my approval**, and make sure the listing
   has one **website** source switched on (an address that publishes events as schema.org data, a calendar
   link or an RSS feed; a WordPress site with the events plugin is the usual example).
2. In GitHub, **Actions**, **Reader**, **Run workflow**, **untick Dry run**, run it.
3. Open the run's Summary: your source shows what was found and `N pending`.
4. Back on the Dashboard, the **Suggestions** tab lists the new suggestions with the source domain.
5. Within a minute the **digest email** ("you have new suggestions") arrives (at most one a day).
6. Dismiss or publish one suggestion, run the Reader again: the same items show as `already known`, not as new.

## What it does, in order

1. Asks Connect (`GET /api/automation/sources`) which sources are **due**: enabled, of a readable kind,
   belonging to an approved, visible Contributor whose level is not `off`, and not looked at in the last
   20 hours. At most 200, oldest first.
2. For each source, one at a time, it reads the address the owner gave, politely (see below), and looks for:

   - **schema.org `Event`** in the page's JSON-LD (events);
   - the **calendar and feeds the page advertises** with `<link rel="alternate">`, from the owner's own site
     only: iCalendar `text/calendar` (events, including weekly and monthly repeats) and RSS or Atom (posts);
   - for a **YouTube** source, the channel's public video feed (posts);
   - a calendar or feed address given directly as the source is read the same way.

   It does not guess: nothing is taken from free text, and a field the page does not state is left out.

3. Sends the result to `POST /api/automation/suggestions` with a short status line the owner sees on their
   Dashboard ("3 events, 1 post", "no events found", "HTTP 404"). A source that found nothing is still
   recorded as checked, so it is not retried for a day.
4. After the last source, calls `POST /api/automation/digest` once; Connect sends at most one email per
   Contributor per day and only to those with new pending suggestions.

### Limits that keep it quiet

At most **20 items per source** per run (always leaving room for up to 5 posts); only **future** events; only
posts from the **last 14 days**; a repeating event shows its next **4** dates within 28 days; phone numbers and
email addresses are removed from text; only **https** links are kept; no images (Connect does not import them yet).

### Politeness and safety

- `https` only, on the standard port; at most 3 redirects, each re-checked; a 10 second timeout; a 1 MB cap;
  no cookies; one request a second to any one site; an honest `User-Agent`:
  `CitizensConnectReader/1.0 (+https://www.citizenscentral.co.za)`.
- **robots.txt is honoured**: a page it disallows is never fetched and is recorded as `blocked by robots.txt`.
  If a site's robots.txt cannot be read, the Reader stays away that day.
- **Never** reads Facebook, Instagram, TikTok, WhatsApp or Threads, whatever kind of source points at them.
- Refuses any address that is not a public website (no IP addresses, no `localhost`, nothing that resolves to a
  private or cloud-metadata address), so a listing cannot point the job at an internal service.
- The logs and the Summary are readable by anyone (the repository is public), so they carry only a short id, the
  kind and a status phrase: **never** an address, a page, an organisation's name or a key.

### Times and time zones

A time with a zone or offset is used as given. A time with **no** zone is read as **South African time**
(Africa/Johannesburg). An **all-day event with no start time is skipped** and counted ("1 event without a start
time skipped") rather than turned into midnight. A repeat rule it cannot expand exactly, or a time zone it does
not know, is skipped and counted too.

## YouTube: a known limit today

YouTube's own `robots.txt` disallows its feed address (`/feeds/videos.xml`) for automated readers. Because the
Reader honours robots.txt, a YouTube source currently shows **`blocked by robots.txt`** and reads nothing. This
is deliberate. The way to read YouTube without breaking that rule is the official **YouTube Data API**, which
needs a Google API key stored as another secret; that is a separate decision (and a small follow-up build).

## Switch it off

- **Stop the schedule:** **Actions**, **Reader**, the **...** menu, **Disable workflow**. Nothing runs again until
  you enable it.
- **Per Contributor:** they set their own level to **Off** on the Dashboard (instant; pending suggestions from
  that source are cleared). Or switch an individual source off.
- **Everything, at once:** revoke the suggest key (below). Without it the Reader cannot list or post anything.

## Roll a key

1. Mint a new key with the same scope (`POST /api/admin/api-keys`, called with an admin token; the secret is
   shown once, so put it straight into your password manager).
2. Update the GitHub secret (**Settings**, **Secrets and variables**, **Actions**, click the secret, **Update**).
3. Run the Reader once as a dry run to confirm it can still list sources.
4. Revoke the old key.

If a run says `the key was refused (HTTP 401)` or `(HTTP 403)`, the secret is missing, mistyped, revoked, or has
the wrong scope (the suggest key needs `automation:suggest`, the digest key `automation:digest`).

## Run it on your own computer

```bash
# from the repository root; Node 22
AUTOMATION_SUGGEST_KEY=... CONNECT_BASE_URL=https://www.citizenscentral.co.za node apps/connect/scripts/reader/run.mjs
```

With no flag it is a **dry run**. `--live` posts and sends the digest (and needs `AUTOMATION_DIGEST_KEY` too);
`--dry-run` says "dry run" explicitly and always wins if both are given. `CONNECT_BASE_URL` may be
`http://localhost:3100` to rehearse against a local server.

## Developer notes

- Code: `run.mjs` (the run), `connect.mjs` (calls Connect), `source.mjs` (reads one source), `net.mjs` (the
  polite fetcher), `robots.mjs`, `html.mjs`, `jsonld.mjs`, `ics.mjs`, `feed.mjs`, `time.mjs`, `text.mjs`. No
  dependencies beyond Node itself.
- Tests: `apps/connect/src/__tests__/reader/` (fictional `.example` fixtures), the route tests in
  `src/__tests__/api/automation/sources.test.ts`, and `src/__tests__/security/readerWorkflow.test.ts`, which
  pins the workflow's safety properties (only `schedule` and `workflow_dispatch`, `contents: read`, no echo of
  secrets, no fork runs).
- Mutation check: `node scripts/mutation/reader.mjs` (from `apps/connect`; self-healing, restores every file).
- The Reader never decides who may be read or what may be published: Connect does (`lib/automation/`).
  An `rss` or `ics` source kind (A17) is a possible follow-up; it needs a migration and your yes.
