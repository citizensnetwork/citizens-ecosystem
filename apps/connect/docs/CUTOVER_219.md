# Cutover to 219.co.za: the runbook (C39 PR D, A19)

Moves the three apps onto one address each: `219.co.za/citizens/connect`, `/citizens/vision`, `/citizens/wear`
(`/learn`, `/play`, `/move` show a "coming soon" page). **Nothing here has been done.** The code is merged
(`@citizens/ecosystem`, the prefix in every app, the front door `apps/hub`, the old-address rules); production still
serves every app from its own root, and Claude changes no Vercel setting, domain, variable or DNS record without a
clear yes in chat for that step.

Written so that a person who does not write code can follow it. Each step has the same four parts: **Why**, **Do**,
**Check**, **Roll back**. Do the steps in order, and do not start the next one until the Check of the one before passes.

> **Who does what.** The clicks in Vercel, Supabase, Google, MapTiler and Absolute Hosting are the founder's (or
> someone the founder gives access). Claude can run every "Check" that is a command and read the result. The dashboards'
> button names below are as they looked when this was written; if one has moved, the words around it are enough to find it.

## What people will notice

- Everyone is **signed out once** in Connect: a browser keeps its sign-in per address, and the address changes from
  `www.citizenscentral.co.za` to `219.co.za`. They sign in again the normal way.
- Printed QR codes and old links keep working: they redirect to the new address (see Step 3).
- The three apps then share **one address**, so the browser's stored data and cookies are shared between them.
- Installed phone apps are not changed by this runbook.

## Do this at a quiet time

Step 4 has a gap of up to a minute when `219.co.za` answers nothing. Early morning (South Africa) on a weekday is best.
Allow about two hours for the whole runbook, with the checks.

---

## Before anything: preconditions

Do all of these first. Every one is reversible and none changes what visitors see today.

### P1. Remove the two parking nameservers at Absolute Hosting

**Why.** The registry lists four nameservers for `219.co.za`: Vercel's two (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) and
two parking servers (`parking1.zadns.co.za`, `parking2.zadns.co.za`). Resolvers pick among them, so some visitors get
Vercel and some get the parking page (1.1.1.1 returned the parking address `102.214.8.148` on 2026-11-01).

**Do.** Sign in at Absolute Hosting (where `219.co.za` is registered) and open the domain's **nameserver** settings.
Delete `parking1.zadns.co.za` and `parking2.zadns.co.za`. Keep `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Save.
The registry can take from a few minutes to a few hours.

**Check.** In PowerShell, ask two different public resolvers (Cloudflare and Google):

```powershell
nslookup -type=NS 219.co.za 1.1.1.1
nslookup -type=NS 219.co.za 8.8.8.8
nslookup 219.co.za 1.1.1.1
nslookup 219.co.za 8.8.8.8
nslookup www.219.co.za 1.1.1.1
```

All must show **only** the two `vercel-dns.com` names, and the address answers must be the same on both resolvers and must
**not** be `102.214.8.148`. If they differ, wait and repeat. **Do not continue until both resolvers agree.**

**Roll back.** Add the two parking nameservers again at Absolute Hosting.

### P2. Let `219.co.za` load the map (MapTiler)

**Why.** The map key only works on the websites it lists. If the new address is missing, the map is blank there.

**Do.** [cloud.maptiler.com](https://cloud.maptiler.com) > **Account** > **API keys** > open the key the site uses
(the value of `NEXT_PUBLIC_MAPTILER_KEY`) > **Allowed HTTP origins**: add `219.co.za` (and `www.219.co.za` if the page asks
for it separately). Keep the existing entries. Save. **Do this before anyone opens the map on the new address.**

**Check.** Reopen the key and see `219.co.za` in the list.

**Roll back.** Remove the entry.

### P3. Let sign-in come back to the new address (Supabase)

**Why.** After signing in, Supabase only sends a person back to addresses on its allowed list.

**Do.** Supabase dashboard > the Citizens project > **Authentication** > **URL Configuration**:

- **Redirect URLs** > **Add URL**: `https://219.co.za/citizens/*/**` (one pattern covers Connect, Vision and Wear). Save.
  Keep every entry that is already there.
- **Site URL**: **leave it as it is for now.** It is also the address in the sign-in emails, so it changes only after
  Step 5 passes (see there).

**Check.** The pattern shows in the list.

**Roll back.** Remove the pattern.

### P4. Let Google sign-in work on the new address

**Do.** [console.cloud.google.com](https://console.cloud.google.com) > the project that holds the sign-in client >
**APIs & Services** > **Credentials** > the **OAuth 2.0 Client ID** the site uses > **Authorised JavaScript origins** >
**Add URI**: `https://219.co.za`. Save. Leave **Authorised redirect URIs** alone if they point at
`https://<project>.supabase.co/auth/v1/callback` (the sign-in goes through Supabase, which does not move).

**Check.** The origin shows in the list.

**Roll back.** Remove it.

### P5. Decisions the founder owes (they do not block the steps, they block going public)

- Read the wording on the new landing page and the coming-soon pages (listed in the PR that built them) and answer the
  open questions there.
- `learn` is assumed to mean "Citizens Equip"; `impact` is not reserved yet.

### P6. Make sure the latest code is live first

The apps and the front door must be deployed from a `main` that contains PR C **and** the Vision fix for
`CONNECT_API_BASE_URL` (Vision used to drop any path in that variable; Step 6 depends on the fix). Open each project's
**Deployments** tab and confirm the newest **Production** deployment is **Ready** and was built from that `main`.

---

## Step 1. Create the front-door project (nothing points at it yet)

**Why.** The front door is a fourth Vercel project. It will own `219.co.za`. First it lives on a test address of its own.

**Do.**

1. [vercel.com](https://vercel.com). Top-left picker: choose the team **citizensecosystem-projects**.
2. **Add New...** > **Project**.
3. **Import Git Repository**: pick `citizensnetwork/citizens-ecosystem` > **Import**.
4. **Project Name**: `citizens-ecosystem-hub` (so the test address is `https://citizens-ecosystem-hub.vercel.app`; if Vercel
   suggests a different name because that one is taken, note the address it shows).
5. **Root Directory**: click **Edit**, choose `apps/hub`, **Continue**. Leave "Include source files outside of the Root
   Directory in the build step" **ticked** (the front door reads the shared package `packages/ecosystem`).
6. **Framework Preset** should say **Next.js**. Leave the build, output and install commands untouched.
7. **Environment Variables**: add none. (The defaults are the three apps' production addresses.)
8. **Deploy**. When it says **Ready**, click **Visit**.

Then open the project > **Settings** > **General** and make **Node.js Version** the same as the Connect project's.

**Check.** Call the test address `H`. Everything on this list works, except the line marked "not yet":

| Open                                        | You should see                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `https://H/`                                | The address changes to `https://H/citizens`                                                   |
| `https://H/citizens`                        | "Connecting the Kingdom", three cards that say "Open ..." and three that say "Coming soon"    |
| `https://H/citizens/learn`, `/play`, `/move` | A "Coming soon" page for each, with a link back                                              |
| `https://H/citizens/nothing`                | "Page not found"                                                                              |
| `https://H/robots.txt`, `/sitemap.xml`      | Plain text and XML                                                                            |
| `https://H/citizens/connect`                | **Not yet.** A "not found" page: Connect is not under its prefix until Step 3. This is expected. |

If you see a Vercel **login** page instead, open the project > **Settings** > **Deployment Protection** and make it match
the Connect project's setting.

**Roll back.** Project > **Settings** > **General** > bottom of the page > **Delete Project**. Nothing depends on it yet.

---

## Step 2. Put Vision and Wear under their prefixes

**Why.** Each app learns to live at `/citizens/<app>` when told to. They go first because nothing sends visitors to them
yet. The front door can then reach them.

**Do, once for Vision and once for Wear.**

1. Vercel > the project (`citizens-ecosystem-vision`, then `citizens-ecosystem-wear`) > **Settings** > **Environment Variables**.
2. **Key**: `NEXT_PUBLIC_BASE_PATH`. **Value**: `/citizens/vision` for Vision, `/citizens/wear` for Wear. Type it exactly:
   lowercase, a leading slash, no trailing slash or space. **Environments**: tick **Production** only; untick Preview and
   Development. **Save**.
3. **Deployments** tab > the newest **Production** deployment > the **...** menu > **Redeploy** > **untick** "Use existing
   Build Cache" > **Redeploy**. Wait for **Ready**. (The value is read when the app is built, so it does nothing until
   there is a new build.)

A wrong value makes the build fail with a message that names the right one; nothing goes live from a failed build.

**What changes.** `https://citizens-ecosystem-vision.vercel.app/` now sends visitors on to `/citizens/vision`, and the same for
Wear. Anything that called those two addresses at their root for pages is now expected to use the prefix. The apps'
`/api/...` addresses keep working at the old path. Connect is untouched.

**Check.** Using the test address `H` from Step 1:

| Open                                              | You should see                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `https://H/citizens/vision`                       | Vision's sign-in page, styled, with the Citizens icon in the browser tab              |
| `https://H/citizens/wear`                         | Wear's first page, styled, with the Citizens icon in the browser tab                 |
| `https://H/citizens/wear/health`                  | A small health answer (not a "not found")                                            |
| Command: `curl.exe -sI https://H/citizens/vision/index.html` | `HTTP/2 200` and exactly one `content-security-policy` line (Vision's own)    |

Do **not** try to sign in on `H`: the allowed return address list knows `219.co.za`, not `H`. Sign-in is tested in Step 5.

**Roll back.** In each project, **Environment Variables**: the **...** next to `NEXT_PUBLIC_BASE_PATH` > **Remove**, then
**Redeploy** (same as above). Or **Deployments** > the last good deployment > **...** > **Instant Rollback**.

---

## Step 3. Put Connect under its prefix

**Why.** Connect is the app people use today. `219.co.za` is *still attached to Connect*, so once Connect lives under its
prefix, `https://219.co.za/citizens/connect/...` already works with no help from the front door. This is also the step that
turns the old `www.citizenscentral.co.za` addresses into forwards.

**Do.**

1. Vercel > **Connect** project > **Settings** > **Environment Variables**.
2. `NEXT_PUBLIC_BASE_PATH` = `/citizens/connect`, **Production** only (as in Step 2).
3. `NEXT_PUBLIC_SITE_URL` = `https://219.co.za` (the address only: no `/citizens/connect`, no trailing slash), **Production**
   only. If a row for it already exists, click **...** > **Edit**, and **write the old value down first**: you need it to roll back.
4. **Deployments** > newest **Production** deployment > **...** > **Redeploy**, "Use existing Build Cache" **unticked**.

**What changes the moment it is Ready.** `www.citizenscentral.co.za` and `citizenscentral.co.za` send every page address to the
same path under `https://219.co.za/citizens/connect/`, and the bare `/` on any other Connect address
(`citizens-ecosystem-connect.vercel.app`, and `219.co.za` while it is attached here) goes to `/citizens/connect`.
`/api/...` is **not** forwarded with a redirect: the request is passed on inside Connect with its method and body, because the
Google Apps Script posts new Contributors to `www.citizenscentral.co.za/api/intake/google-form` and a redirect can turn that
post into a plain read.

**Check.** Replace `SLUG` with a real Contributor address word (the end of a printed QR code), and run in PowerShell:

```powershell
curl.exe -sI https://www.citizenscentral.co.za/c/SLUG
curl.exe -sI "https://www.citizenscentral.co.za/index.html?c=SLUG"
curl.exe -sI https://www.citizenscentral.co.za/dashboard
curl.exe -sI https://www.citizenscentral.co.za/
curl.exe -sI https://citizens-ecosystem-connect.vercel.app/
curl.exe -sI https://219.co.za/citizens/connect
curl.exe -s -o NUL -w "%{http_code}`n" -X POST https://www.citizenscentral.co.za/api/intake/google-form -H "Content-Type: application/json" -d "{}"
curl.exe -si -X OPTIONS https://www.citizenscentral.co.za/api/events -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: GET"
```

| Command (in order) | Expected                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| 1                  | `308`, `location: https://219.co.za/citizens/connect/c/SLUG`                                           |
| 2                  | `308`, `location: https://219.co.za/citizens/connect/index.html?c=SLUG` (the `?c=` is kept)            |
| 3                  | `308`, `location: https://219.co.za/citizens/connect/dashboard`                                        |
| 4                  | `308`, `location: https://219.co.za/citizens/connect`                                                  |
| 5                  | `307`, `location: /citizens/connect`                                                                   |
| 6                  | `200` (Connect's page; it has Connect's own `content-security-policy` once)                            |
| 7                  | **`401`** (or `503` if no intake secret is set). **Not `404`, not `308`**: that proves the post reached Connect's route and was refused for having no signature. No data is created. |
| 8                  | `204` and `access-control-allow-origin: capacitor://localhost` (a phone app's pre-flight is answered) |

**If command 7 or 8 shows `404`:** the pass-through of `/api` does not work on Vercel (it makes one extra hop into Connect's
own address; this could not be tried before today). **Roll back at once** (below) and tell Claude; the Apps Script would
otherwise stop delivering Contributors.

In a browser, open `https://219.co.za/citizens/connect`: the map shows (P2), and sharing a listing makes a link that starts
`https://219.co.za/citizens/connect/`.

**Roll back.** **Environment Variables**: **Remove** `NEXT_PUBLIC_BASE_PATH`, put `NEXT_PUBLIC_SITE_URL` back to the old value you
wrote down (or remove it if it did not exist), **Redeploy** without the build cache. Connect serves from its root again and
`www.citizenscentral.co.za` works as it did. Nothing was lost.

---

## Step 4. Give `219.co.za` to the front door

**Why.** Today `219.co.za` shows Connect. After this, it shows the front door, which serves `/citizens` itself and passes
`/citizens/connect`, `/vision` and `/wear` to the three apps.

**Do.** Have both tabs open, then go quickly (the gap is the time between the two saves):

1. Vercel > **Connect** project > **Settings** > **Domains**. For `219.co.za` click **Remove**. Do the same for `www.219.co.za`.
   **Do not touch** `www.citizenscentral.co.za`: it stays on Connect.
2. Vercel > the **hub** project (`citizens-ecosystem-hub`) > **Settings** > **Domains** > **Add**: `219.co.za` > **Add**.
   Choose to connect it to **Production**.
3. **Add** `www.219.co.za`. When it asks what to do, choose **Redirect to Another Domain**, pick `219.co.za`, and keep the
   status **308 Permanent Redirect**.
4. Wait until both rows say **Valid Configuration** (a minute or two). The certificate was already issued for both names
   (valid to 2027-01-30); Vercel re-uses or renews it.

**Check.** Right away:

```powershell
curl.exe -sI https://219.co.za/
curl.exe -sI https://www.219.co.za/
curl.exe -sI https://219.co.za/citizens
curl.exe -sI https://219.co.za/citizens/connect
```

| Command | Expected                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| 1       | `302`, `location: /citizens`                                                                                  |
| 2       | `308`, `location: https://219.co.za/` (the apex)                                                               |
| 3       | `200`, the front door's page; its `content-security-policy` ends `frame-ancestors 'none'` and has no `unsafe-inline` |
| 4       | `200`, **Connect's** page and **Connect's** `content-security-policy` (it lists `unpkg.com`), exactly one such line  |

**Roll back.** Hub > **Settings** > **Domains**: **Remove** both. Connect > **Settings** > **Domains** > **Add** `219.co.za` and
`www.219.co.za` again. Because Step 3 is still on, `https://219.co.za/citizens/connect/...` keeps working while the domain
is back on Connect.

---

## Step 5. After the move: check everything, then finish the settings

**Check, in a browser** (a phone as well as a computer):

1. `https://219.co.za` lands on `/citizens`. Open each "Open ..." card: Connect, Vision, Wear. Each opens, each tab shows
   **its own** icon, the address bar stays on `219.co.za`.
2. **Sign in** on Connect (email code and Google), then open Vision and Wear: signed in there too (one address, one session).
   Sign out, sign in again. Nothing sends you to `localhost`, to `citizenscentral.co.za`, or to a Vercel address.
3. Share a listing in Connect and open the link on a phone.
4. Scan or open an old printed QR address (`https://www.citizenscentral.co.za/c/SLUG`): it lands on the same Contributor.
5. `https://219.co.za/favicon.ico` and `https://219.co.za/robots.txt` answer (the front door's).
6. `https://219.co.za/citizens/learn` shows "Coming soon", and `https://219.co.za/citizens/nothing` shows "Page not found".

**Then finish the settings** (only now):

- **Supabase** > Authentication > URL Configuration > **Site URL**: change to `https://219.co.za/citizens/connect`. (Check what
  it is today and write it down first; it decides where sign-in emails send people.)
- **Google Apps Script** (the Contributor form): Project Settings > Script properties > `INTAKE_URL` =
  `https://219.co.za/citizens/connect/api/intake/google-form`. Until you do this the old address keeps working through the
  pass-through of Step 3, so there is no rush, but do it so the form no longer depends on it. Submit a test form and watch it arrive.

**Roll back.** Site URL and `INTAKE_URL`: put the old values back. Anything else wrong: Step 4's roll back.

---

## Step 6. Point Vision's and Wear's reads of Connect at Connect's new address

**Why.** Vision and Wear read Contributors, events and places from Connect's `/api/v1` from their servers. Those calls use
the variable `CONNECT_API_BASE_URL`. Connect's own address now includes the prefix, so the variable should too. (Until it
does, the calls still work through the `/api` pass-through of Step 3, with one extra hop. Vision used to throw away any
path in this variable; that is fixed in the code that is live after P6.)

**Do, for Vision and for Wear.** **Settings** > **Environment Variables** > `CONNECT_API_BASE_URL` > **...** > **Edit**:

```
https://citizens-ecosystem-connect.vercel.app/citizens/connect
```

(Connect's own project address, **not** `219.co.za`: a server-to-server call needs no detour through the front door. No
trailing slash. No `/api/v1` on the end.) **Production** only. Write the old value down. Then **Redeploy** both projects
(without the build cache).

**Check.** In Vision, open the page that lists Connect's events or places; in Wear, open the Contributors directory.
Both show data (they would show an empty list or an error if the address were wrong).

**Roll back.** Put the old value back and redeploy; it keeps working through the pass-through.

---

## Variable cheat sheet

Scope is **Production** only in every case. A `NEXT_PUBLIC_` or `HUB_` value is read **when the app is built**: change it, then
redeploy without the build cache.

| Project | Name                    | Value                                                           | Step | Roll back to          |
| ------- | ----------------------- | --------------------------------------------------------------- | ---- | --------------------- |
| Vision  | `NEXT_PUBLIC_BASE_PATH` | `/citizens/vision`                                              | 2    | remove, redeploy      |
| Wear    | `NEXT_PUBLIC_BASE_PATH` | `/citizens/wear`                                                | 2    | remove, redeploy      |
| Connect | `NEXT_PUBLIC_BASE_PATH` | `/citizens/connect`                                             | 3    | remove, redeploy      |
| Connect | `NEXT_PUBLIC_SITE_URL`  | `https://219.co.za`                                             | 3    | the old value         |
| Vision  | `CONNECT_API_BASE_URL`  | `https://citizens-ecosystem-connect.vercel.app/citizens/connect` | 6    | the old value         |
| Wear    | `CONNECT_API_BASE_URL`  | `https://citizens-ecosystem-connect.vercel.app/citizens/connect` | 6    | the old value         |
| Hub     | (none)                  | `HUB_ORIGIN_CONNECT`, `HUB_ORIGIN_VISION`, `HUB_ORIGIN_WEAR` exist but are **left unset**: their defaults are the three projects' production addresses | - | - |

Never set `NEXT_PUBLIC_BASE_PATH` on Preview or Development: a Preview with a prefix answers only under it, and the
front door does not proxy to previews. Setting it to another app's path (or anything but the exact value above) stops the
build with a message saying what is allowed.

## If something goes wrong

| What you see                                                                  | Do                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `219.co.za` shows a browser warning or does not load right after Step 4       | Wait two minutes, then reload. Still wrong after ten: Step 4's roll back.                                    |
| The map is blank on `219.co.za`                                               | P2 (the MapTiler key).                                                                                       |
| Sign-in sends people to the wrong address, or "redirect URL not allowed"      | P3 (the pattern), then the Site URL in Step 5.                                                               |
| The Contributor form stops delivering                                         | Step 3 command 7; if it shows `404`, roll back Step 3. Then check `INTAKE_URL`.                             |
| A page of one app shows another app's content, or a broken blank page         | Tell Claude which address; the front door's proxy table is `apps/hub/config/hub-config.js`.                  |
| Anything else                                                                 | Roll back the last step you did, using its **Roll back** paragraph. Each is complete on its own.             |

## After the cutover (not part of the steps)

- Keep `citizenscentral.co.za` **renewed**: it expires 2027-06-08 at domains.co.za and Vercel does not renew it. The
  forwards, the Apps Script address and the `no-reply@` sender depend on it.
- Update `apps/connect/tools/google-forms/README.md` (it tells people to use the `www.citizenscentral.co.za` address).
- Drop `'unsafe-inline'` from Connect's `script-src`: all apps now share one address and one session.
- The phone apps' API base points at `citizens-connect.vercel.app` / `citizens-wear.vercel.app`, which are not the
  projects' current names (RESUME_HERE, C39). Check before the next store build.
- The QR code and share origin in Connect's code are still `https://www.citizenscentral.co.za` (they redirect, so they work).
- `/.well-known/assetlinks.json` is **not** served by the front door; whoever ships native app links adds it there.

## What this runbook could not check

Stated plainly so nobody assumes otherwise:

1. The `/api` pass-through (one extra hop into the same Vercel project) was proved with real builds on one machine, not on
   Vercel. Step 3's commands 7 and 8 are the proof; the roll back is ready.
2. The current values of the Vercel variables, of Supabase's Site URL and of the Google client were not readable from the
   code, so every "write the old value down" is an instruction, not a known value.
3. Vision's and Wear's pages were built and served under their prefix and fetched with `curl` (PR A), not walked through
   with a signed-in user. Step 5 is that walk.
4. The dashboard button names above are from memory of the Vercel, Supabase, Google and MapTiler screens.
