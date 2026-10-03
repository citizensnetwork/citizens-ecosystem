# Google Form → map: Contributor intake

A new Contributor fills in the Google Form **"New 219-Connect Contributor"**. You review the row in
the responses Sheet and tick **Approve**. That is the only manual step: the Contributor goes live on
the map and in Kingdom Discovery, the row is stamped, and the owner gets a welcome email asking them
to sign in with that owner email: a 6-digit emailed code (works for any inbox, including Outlook), or
Google if it's a Google account. Signing in with that email lands them straight on their own
Contributor dashboard.

```
You tick "Approve" in the Sheet
  → intake.gs (runs as you, inside Google)
  → signed POST  https://www.citizenscentral.co.za/api/intake/google-form
  → Connect: check signature → validate → map labels → locate → create listing → upload logo/cover
  → the Sheet row gets Status / Listing URL / Processed at / Notes
  → the owner gets a welcome email (from your Gmail)
Owner signs in with that email (6-digit code, or Google) → lands on their dashboard
```

| File | What it is |
|---|---|
| `intake.gs` | The Apps Script bound to the responses Sheet (this pipeline). |
| `create-contributor-application-form.gs` | **Superseded.** The old form builder; the live Form was built by hand. |
| `apps/connect/src/app/api/intake/google-form/route.ts` | The Connect endpoint it calls. |
| `apps/connect/src/lib/intake/googleForm.ts` | The label → category/kind maps, and the coordinate, signature and image checks. |

---

## One-time setup

> **Before the first approval:** database migration **173** must be applied (it adds the
> "Individual" kind and the intake function). Until it is, every approval fails with
> `create_failed` and nothing is created.

1. **Form confirmation message.** Form → Settings → Presentation → Confirmation message:
   > Thank you! We'll email you at the owner address you gave us when your listing is live. Then just
   > sign in to Citizens Connect with that email address (we'll send you a 6-digit code, or you can use
   > Google if it's a Google account) to manage your profile.
2. **Sheet columns.** In the **Form Responses 1** tab, to the right of the last question column
   (`Question 7.5: Permission to publish`), add these five headers in row 1:
   `Approve` · `Status` · `Listing URL` · `Processed at` · `Notes`. Capitals and extra spaces don't
   matter.
   Then select the `Approve` column below the header and choose **Insert → Checkbox**.
3. **Make the shared secret yourself.** Run `openssl rand -hex 32` (or have a password manager
   generate 64 random characters). Keep it in your password manager. Never paste it into a chat, an
   email, a commit or the script body.
4. **Vercel.** citizens-ecosystem-connect → Settings → Environment Variables → add
   `INTAKE_WEBHOOK_SECRET` = *the secret*, for **Production** (and Preview if you like). Then
   **redeploy production**, because env vars only apply to new deployments.
5. **Paste the script.** Open the Apps Script editor **from inside the Sheet** (Extensions → Apps
   Script). Opening it this way connects it to the Sheet; a project made at script.google.com won't
   work.
   - Click into the code area and select everything (Ctrl+A), including the placeholder
     `function myFunction() { … }`, then delete it.
   - Paste the **entire contents** of `intake.gs`: all ~370 lines, from the opening `/**` comment to
     the last `}`. `intake.gs` is the name of the file whose code you paste in. You don't type it
     anywhere. The file's name in the left sidebar doesn't matter.
   - Save with Ctrl+S or the disk icon.
6. **Script properties.** In the Apps Script editor, go to Project Settings (gear) → Script
   properties → Add:
   - `INTAKE_URL` = `https://www.citizenscentral.co.za/api/intake/google-form`. Use it exactly, with
     `www`: the bare domain redirects and a redirect breaks the signed request.
   - `INTAKE_SECRET` = the same secret as in Vercel.
7. **Run `setup`.** This needs step 2's headers in the Sheet first; `setup` checks them.
   - In the toolbar above the code, next to **Run** and **Debug**, there's a dropdown. It said
     `myFunction` before the paste; after saving it lists the script's functions. Pick **`setup`**, then
     click **Run**.
   - The first run asks for permission: **Review permissions** → pick your Google account. The script
     needs to see and edit this spreadsheet, read the uploaded files in Drive, connect to an external
     service, send email as you, and use Google Maps.
   - If Google warns that it "hasn't verified this app", that's expected for your own script:
     **Advanced** → **Go to … (unsafe)** → **Allow**.
   - Done when the Execution log shows *"Execution completed"* and the Sheet shows a toast, *"Intake is
     ready."*
8. **Run `testConnection`** the same way: pick it in the dropdown, then click **Run**. The Sheet should
   show *"Connected ✓ — the secret matches."* Nothing is created. Any other message says what to fix.
   This needs `INTAKE_WEBHOOK_SECRET` in Vercel **and a redeploy** (step 4).

---

## Approving a Contributor (every time)

Before you tick **Approve**, check:

- **Column B = column E?** B is the Google account that actually submitted the Form; E is the
  owner's email the listing will belong to. If they differ, the submitter may not control that inbox.
  Confirm with them first: anyone can fill in a public Form.
- The name and category look right, and the Contributor isn't already on Citizens Connect.
- It's a real Form submission. Approving a hand-typed sample row publishes a real listing and
  emails whoever's address is in column E, so delete sample rows instead.

Tick **Approve**. Within about 10–20 seconds:

- **Status** = `Live ✓`.
- **Listing URL** = the public page (`…/c/<name>`). It's shareable, so the owner can post it anywhere.
- **Processed at** = when it happened.
- **Notes** = anything worth knowing (see below).

The owner then gets the welcome email.

Ticking a row that's already `Live ✓` does nothing. If a row ends in `Error`, fix the cell the
Notes point to, then tick **Approve** again.

### What the Notes mean

| Notes say | What happened | What to do |
|---|---|---|
| `Unknown Primary category "…"` | Q2.3 isn't one of the 12 types below | Change the cell to one of the 12 labels, then tick again |
| `Unknown Organisation Type "…"` | Q2.2 isn't a known option | Use one of the four options below |
| `Unrecognised fixed-location answer "…"` | Q3.1 isn't Yes/No | Set it to `Yes` or `No` |
| `display_name_required` / `valid_claim_email_required` | Q2.1 name / Q1.3 owner's email missing or invalid | Fix the cell |
| `invalid_website_url`, `invalid_contact_email`, `invalid_<social>` | That answer can't be used as-is (or is a dangerous link) | Fix or clear that cell |
| `Faith alignment and permission to publish must both be given.` | Q7.4 is empty, or Q7.5 is empty/"No" | Can't publish without consent |
| `… already has a Contributor listing: …/c/<name> — nothing was changed.` | This owner is already live (e.g. the row was approved before, or they applied in the app). Says `(currently hidden)` if you hid it | Nothing to do, or unhide it in Admin → Listings |
| `… already has a Citizens Connect account, so no listing was created. …` | The owner email belongs to someone who already signed in to the app as a citizen | They can go live themselves: Settings → Become a Contributor. Or change the owner's email on the row and tick again |
| `unauthorized` | The two secrets differ | Re-copy the same value into Vercel and the Script property, then redeploy |
| `intake_not_configured` | Vercel has no `INTAKE_WEBHOOK_SECRET` | Add it (step 4) and redeploy |
| `INTAKE_URL redirects …` | `INTAKE_URL` isn't the exact `www` address | Fix the Script property (step 6) |
| `rate_limited` | Too many approvals in a minute | Wait a minute, tick again |
| `create_failed`, `target_not_fresh`, `create_user_failed` | Server-side problem; nothing was left half-created | Tell the dev session |
| *(Live ✓ with)* `No map pin: …` | The location couldn't be found | Live in Kingdom Discovery; the owner drops the pin from their dashboard |
| *(Live ✓ with)* `Logo/Cover photo skipped: …` | Wrong type (e.g. iPhone HEIC), too large, or no file | The owner adds it from their dashboard |
| *(Live ✓ with)* `…welcome email failed…` | Gmail refused (daily quota is ~100) | Email the owner yourself, or clear Status and tick again tomorrow |
| Status stuck on `Processing…` | Google stopped the script mid-run | Clear Status, untick, then tick Approve again |

---

## Answers Connect understands

**Q2.2 Organisation Type** (how you're set up):

| Form answer | Kind on Connect |
|---|---|
| Church | Ministry |
| Christian Nonprofit / Ministry | Organisation |
| Christian Business | Business |
| Individual | Individual (a person serving in their own capacity) |

**Q2.3 Primary category** (what you do). These set the pin colour and icon: Church · Outreach /
Mission · Market / Expo · Business · Sport & Recreation · Social Gathering · Arts & Culture · Media ·
Retreat / Healing · Clinic · Education / Equipping · Rehab / Development.

Matching ignores capitals, extra spaces, `&` vs "and", and the spacing around `/`. If you **rename
an option on the Form**, Connect must learn the new wording first. The lists live in
`apps/connect/src/lib/intake/googleForm.ts` (types) and `src/lib/categories.ts` +
`src/frontend/app/data.jsx` (categories). Until then, rows with the new wording end in `Error` with a
clear note; they are never published under a guessed category.

**What isn't imported:**

- Q1.1, 1.2, 1.4: applicant name, role and phone. These are for your vetting only.
- Q3.4: areas served.
- Q6.3: gallery photos. The owner adds them from the dashboard.
- Q7.1: team invites. The owner invites the team after signing in.
- Q7.2, 7.3.

**Location:**

- The Maps link's pin is used first.
- If the link has no coordinates (for example `maps.google.com/?q=<address>`), Google's geocoder
  (run by the script) locates the street address.
- If that fails, Connect tries MapTiler.
- Short `maps.app.goo.gl` links are expanded by the script.

**Images:**

- The logo (6.1) and cover (6.2) are uploaded if they are JPEG, PNG or WebP.
- Anything over 1.5 MB is first shrunk through Drive (logo 800 px wide, cover 1600 px).
- iPhone HEIC photos aren't supported yet; the row notes it.

---

## How the owner gets in

The listing is created under an account with the **owner's email**, and the owner signs in with
**that same email**, either way:

- **Continue with email (a 6-digit code).** Works for any inbox, including Outlook and company mail,
  so nobody needs a Google account. They enter the address, we email a 6-digit code, they type it back.
  They are signed in AS the listing's account and land on their dashboard. Receiving the code is the
  proof they own the inbox.
- **Google, using that same email.** Supabase links the Google sign-in to that account, with the same
  result.

If Supabase ever creates a *separate* account for that same email instead of linking (only possible
via Google), the app claims the listing for them automatically on sign-in. The account menu's **Claim a
Contributor listing** does the same by hand.

A **different** address can't claim the listing; that person is simply an ordinary citizen. The
welcome email tells the owner exactly which address to sign in with, and to sign out and back in with
it if they used the wrong one.

> **After you change `intake.gs` in the repo, re-paste it into the Sheet's Apps Script** (one-time
> setup, step 5). The welcome email only changes once the Sheet's copy of the script does.

> **The 6-digit email must carry the code.** In Supabase → Authentication → Email Templates, both the
> **Magic Link** and **Confirm signup** templates need `{{ .Token }}` in the body: existing accounts
> (like a listing's owner) get the first, brand-new addresses get the second.

---

## Removing a listing

Sign in to Citizens Connect as an admin → **Admin Panel → Listings**. Every Contributor listing is
there, with whether it's live or hidden and whether its owner has signed in yet ("Awaiting owner
sign-in"). **Hide** (then **Confirm hide**) takes a listing off the map and Kingdom Discovery for
everyone; nothing is deleted, and **Unhide** puts it straight back. Use it for an approval you
regret, or for the Phase 6 test listing once you've checked it.

**Delete** removes a listing for good. A listing is really a user account, so what Delete does
depends on one fact, and the app works it out and tells you before you confirm (you type the
listing's name to enable the button):

| The owner has… | Delete does |
|---|---|
| **never signed in** (an intake or Admin-Create placeholder, "Awaiting owner sign-in") | Removes it permanently, with everything attached to it (events, places, news posts, uploaded images). |
| **signed in at least once** (a real person) | Removes only the **listing**: their Contributor profile, events, places, news posts and team go, but they **keep their citizen account** and can sign in and apply again. A new listing would start **hidden** until you unhide it in Listings. |

Delete **refuses** (and says why) for an admin, for your own account, and for anyone who owns a
Citizens Wear brand or has Citizens Vision data; use **Hide** for those. Every delete is written to
the admin audit log. Use Hide when you only want something off the map for now, and Delete for test,
duplicate or bad listings.

## Privacy (POPIA)

The Sheet holds applicants' personal details (names, phone numbers, emails). Keep it shared with as
few people as possible.

The secret lives only in Script properties and Vercel. No Supabase key ever goes into Apps Script:
the script can only ask Connect to create a listing, and Connect checks everything.
