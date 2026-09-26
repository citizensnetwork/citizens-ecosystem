# Google Form → map: Contributor intake

A new Contributor fills in the Google Form **"New 219-Connect Contributor"**. You review the row in
the responses Sheet and tick **Approve**. That is the only manual step: the Contributor goes live on
the map and in Kingdom Discovery, the row is stamped, and the owner gets a welcome email asking them
to sign in with Google. Signing in with that email lands them straight on their own Contributor
dashboard.

```
You tick "Approve" in the Sheet
  → intake.gs (runs as you, inside Google)
  → signed POST  https://www.citizenscentral.co.za/api/intake/google-form
  → Connect: check signature → validate → map labels → locate → create listing → upload logo/cover
  → the Sheet row gets Status / Listing URL / Processed at / Notes
  → the owner gets a welcome email (from your Gmail)
Owner signs in with Google (same email) → lands on their dashboard
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
   > sign in to Citizens Connect with that Google account to manage your profile.
2. **Sheet columns.** In the **Form Responses 1** tab, to the right of the last question column
   (`Question 7.5: Permission to publish`), add these five headers in row 1, spelled exactly:
   `Approve` · `Status` · `Listing URL` · `Processed at` · `Notes`.
   Then select the `Approve` column below the header and choose **Insert → Checkbox**.
3. **Make the shared secret yourself.** Run `openssl rand -hex 32` (or have a password manager
   generate 64 random characters). Keep it in your password manager. Never paste it into a chat, an
   email, a commit or the script body.
4. **Vercel.** citizens-ecosystem-connect → Settings → Environment Variables → add
   `INTAKE_WEBHOOK_SECRET` = *the secret*, for **Production** (and Preview if you like). Then
   **redeploy production**, because env vars only apply to new deployments.
5. **Paste the script.** In the Sheet, go to Extensions → Apps Script. Delete the placeholder code,
   paste all of `intake.gs`, and click Save.
6. **Script properties.** In the Apps Script editor, go to Project Settings (gear) → Script
   properties → Add:
   - `INTAKE_URL` = `https://www.citizenscentral.co.za/api/intake/google-form`. Use it exactly, with
     `www`: the bare domain redirects and a redirect breaks the signed request.
   - `INTAKE_SECRET` = the same secret as in Vercel.
7. **Run `setup`.** In the editor, choose `setup` in the function dropdown and click **Run**, then
   approve the permissions. The script needs to see and edit this spreadsheet, read the uploaded files
   in Drive, connect to an external service, send email as you, and use Google Maps. If Google warns
   that it "hasn't verified this app": it's your own script, so choose Advanced → Go to … (unsafe).
8. **Run `testConnection`.** The Sheet should show *"Connected ✓ — the secret matches."* Nothing is
   created. Any other message says what to fix.

---

## Approving a Contributor (every time)

Before you tick **Approve**, check:

- **Column B = column E?** B is the Google account that actually submitted the Form; E is the
  owner's email the listing will belong to. If they differ, the submitter may not control that inbox.
  Confirm with them first: anyone can fill in a public Form.
- The name and category look right, and the Contributor isn't already on Citizens Connect.

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
| `That owner email already has a Citizens Connect account.` | Already processed, or the person already signed up in the app | They can go live themselves from the app: Settings → Become a Contributor |
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

The listing is created under an account with the **owner's email**. When the owner signs in with
**Google using that same email**, Supabase links the sign-in to that account. They are the listing's
owner and land on their dashboard.

If Supabase ever creates a *separate* account for that same email instead of linking, the app claims
the listing for them automatically on sign-in. The account menu's **Claim a Contributor listing** does
the same by hand.

A **different** Google address can't claim the listing; that person is simply an ordinary citizen.
The welcome email tells the owner exactly which address to sign in with, and to sign out and back in
with it if they picked the wrong account.

---

## Removing a listing

Moderation hides a Contributor; it doesn't delete them. The `/api/admin/contributors/hide` endpoint
exists, but there is no Admin-panel button for it yet. For the Phase 6 test listing, the dev session
removes it with you.

## Privacy (POPIA)

The Sheet holds applicants' personal details (names, phone numbers, emails). Keep it shared with as
few people as possible.

The secret lives only in Script properties and Vercel. No Supabase key ever goes into Apps Script:
the script can only ask Connect to create a listing, and Connect checks everything.
