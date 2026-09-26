# HANDOFF — Google Form → Map: Contributor Intake Pipeline

> **Status (2026-09-26):** planning complete, founder decisions in, **no app code or migration shipped yet**.
> The next session builds it. This file is the complete brief; it supersedes any conflicting detail in the
> earlier planning notes. `RESUME_HERE.md` §3AP points here.
>
> Branch: **`claude/citizens-connect-applicant-form-o4kvt3`** (up to date with `main` @ `f306435` + 5 docs/tool
> commits). Supabase project: **`xyiajtrvhlxaeplsiajj`**. Next migration number: **173** (head in repo = `172_entity_social_links_parity.sql`;
> verify with `list_migrations` before writing).

---

## 1. What the founder wants (their words, condensed)

1. A new Contributor fills in the **Google Form**.
2. The end of the form tells them to **watch for an email** about signing in to the app.
3. The form writes to a **Google Sheet**.
4. "The system" reads the Sheet and **puts every approved Contributor on the map** (and in Kingdom Discovery / their listing).
5. An **automated email** goes to the Contributor's email asking them to sign in.
6. On sign-in they land **directly on their own Contributor profile/dashboard** to manage it.

**Founder chose publish gate B:** the Sheet gets an **"Approve" tick box**. Ticking it is the ONLY manual step; everything after is automatic.
The founder also asked for the **simplest viable build** (see §4).

---

## 2. Live Google assets (founder's Drive, owner `citizensnetworkpbo@gmail.com`)

| Asset | ID / link |
|---|---|
| Live Form "New 219-Connect Contributor" | https://forms.gle/RtV1p7eWDGydGmZY6 · Drive id `1Wa8YiBSQtZaeqN502RAWKqYamDZhs08kOGnJPtLZD2Q` |
| Responses Sheet "New 219-Connect Contributor (Responses)", tab **"Form Responses 1"** | https://docs.google.com/spreadsheets/d/1go7ALiP1_0W4IeWH8IBbnevoS7ZQalxjkFcsaR6XclM/edit · id `1go7ALiP1_0W4IeWH8IBbnevoS7ZQalxjkFcsaR6XclM` |
| File-upload folder "New 219-Connect Contributor (File responses)" | `1-a2aUeo_qjf1Rhyr7zpAVry5UUHBwXKXNeO6eVi82s7yM9tqRZXuAAXbBRTbgVpaPo4ntjGX` (sub-folders per Q6.1 / 6.2 / 6.3) |
| Field-spec Doc (reference; **partly stale**: still lists the 17 event categories) | `1feHt4THuneueWahMZkTldGlR1fnfw1omqa9mPgPnvKs` |
| Old form-builder script (**superseded**; the founder built the form by hand) | Drive `1q42xv9KgSCnx_uiD3vVN2-6nnhz-MI_X` = repo `apps/connect/tools/google-forms/create-contributor-application-form.gs` |

**Connector limits:** the Google Drive MCP **cannot read Form questions or options** (unsupported mime type) and cannot write to Sheets.
It *can* read the Sheet (`read_file_content`), which is how the headers below were obtained. As of 2026-09-26 the Sheet had **headers only, no responses**.

### 2.1 Sheet columns (exact headers, verified 2026-09-26)

| Col | Header | → DB / use |
|---|---|---|
| A | `Timestamp` | row id component |
| B | `Email Address` | the respondent's **verified Google email** (the Form collects emails). If B = E, the applicant controls the owner inbox (good approval signal) |
| C | `Question 1.1: Applicant full name` | not stored (vetting) |
| D | `Question 1.2: Your role in the organisation (e.g. Pastor, Founder, Organizer, Admin)` | not stored |
| E | `Question 1.3: Owner's email` | `profiles.contributor_claim_email` + the auth user's email (**required**) |
| F | `Question 1.4: Applicant phone number` | not stored |
| G | `Question 2.1: Organisation / ministry name` | `profiles.full_name` → `contributor_slug` (**required**, 2–120) |
| H | `Question 2.2: Organisation Type` | `profiles.contributor_kind` (see §3.2) |
| I | `Question 2.3: Primary category` | `profiles.contributor_category` (see §3.1; **required**) |
| J | `Question 3.1: Do you have a fixed physical location people can visit?` | `contributor_no_fixed_location` (No → true) |
| K | `Question 3.2: Street address (full address incl. suburb and city)` | `physical_address` (≤300) |
| L | `Question 3.3: Google Maps link to your location` | → `physical_latitude/longitude` |
| M | `Question 3.4: Which area(s) or suburbs do you serve?` | not stored (no column); leave out, or append to bio only if the founder asks |
| N | `Question 4.1: Short bio: who you are and who you serve` | `bio` (≤1000 server; the form was specced at 240) |
| O | `Question 4.2: Website` | `website_url` (http(s), coerce) |
| P | `Question 4.3: Public contact email (shown on your listing)` | `contributor_contact_email` (≤254) |
| Q | `Question 5.1: Instagram (Short answer)` | `instagram_handle` |
| R | `Question 5.2: Facebook (Short answer)` | `facebook_url` |
| S | `Question 5.3: TikTok (Short answer)` | `tiktok_handle` |
| T | `Question 5.4: YouTube (Short answer)` | `youtube_url` |
| U | `Question 5.5: X (Twitter) (Short answer)` | `x_handle` |
| V | `Question 5.6: LinkedIn (Short answer)` | `linkedin_url` |
| W | `Question 5.7: WhatsApp (number, wa.me link or group invite) (Short answer)` | `whatsapp_number` |
| X | `Question 6.1: Logo/profile photo (square works best)` | `logo_url` (Drive file → Supabase Storage) |
| Y | `Question 6.2: Cover / banner photo (wide, around 16:6)` | `cover_photo_urls` (jsonb array, 1 item) |
| Z | `Question 6.3: Gallery photos (people, place, activities)` | **v1: skip** (owner adds from the dashboard); v2 → `gallery_urls` (≤6) |
| AA | `Question 7.1: Team members to invite (name and email, one per line)` | not stored in v1 (team invites need the owner to have claimed first) |
| AB | `Question 7.2: Do you run regular events or have venues you'd like to list?` | not stored |
| AC | `Question 7.3: How did you hear about Citizens Connect?` | not stored |
| AD | `Question 7.4: Faith alignment` | must be ticked (required on the form) |
| AE | `Question 7.5: Permission to publish` | must be ticked (POPIA consent) |

**Rule for the Apps Script:** find columns **by the `Question N.N` prefix** (or exact header for A/B), **never by index**.
Google inserts columns when the founder edits the form, and the manual columns (§4.4) sit to the right.

**UNKNOWN, get before coding the label maps:** the exact **answer option labels** for H (Organisation Type), I (Primary category), J (Yes/No wording), and the cell format of X/Y file uploads (normally comma-separated `https://drive.google.com/open?id=<fileId>`).
The connector can't read the Form. **First step next session:** ask the founder to submit **one test response** that picks a non-default option everywhere and uploads a logo + cover, then read the Sheet. Alternatively, ask them to paste the option lists.
Build label→slug maps tolerant of case, whitespace and `&`/`/` variants, and **reject unknown labels** with an error written back to the row (never silently default).

---

## 3. Founder decisions (2026-09-26)

### 3.1 Contributor types: 12, separate from event categories
The founder decided the 17 event categories are **event** types, not Contributor types. **Do NOT change event categories** (`EVENT_CATEGORIES` stays exactly as-is for events).
Contributors get their own list of 12. **Claude was delegated the colour/icon picks.** Reuse existing slugs where the meaning is identical, so pins, filters and existing data keep working.

| # | Form label (founder's) | slug | hex | Lucide icon | origin |
|---|---|---|---|---|---|
| 1 | Church | `churches-ministries` | `#D4AF37` | `Church` | reuse (place cat; icon upgraded from Building2 for contributors only if cheap, else keep `Building2`) |
| 2 | Outreach / Mission | `outreach-missions` | `#1ABC9C` | `Globe` | reuse (event cat) |
| 3 | Market / Expo | `markets-expos` | `#F39C12` | `Store` | reuse (event cat) |
| 4 | Business | `christian-businesses` | `#A67C00` | `Store` | reuse (place cat) |
| 5 | Sport & Recreation | `sport-recreation` | `#2ECC71` | `CircleDot` | reuse (event cat) |
| 6 | Social Gathering | `social-gatherings` | `#E91E63` | `Wine` | reuse (event cat) |
| 7 | Arts & Culture | `arts-culture` | `#FF6B35` | `Palette` | reuse (event cat) |
| 8 | Media | `media-broadcasting` | `#9B59B6` | `Radio` | reuse (place cat) |
| 9 | Retreat / Healing | **`retreat-healing`** | `#6FA89A` (sage) | `Leaf` | **NEW** |
| 10 | Clinic | **`clinic`** | `#C0392B` (clinical red) | `Stethoscope` | **NEW** |
| 11 | Education / Equipping | `education-equipping` | `#3498DB` | `GraduationCap` | reuse (event cat) |
| 12 | Rehab / Development | **`rehab-development`** | `#5B2C6F` (deep violet) | `HandHeart` | **NEW** |

All four icons exist in the pinned `lucide@1.34.0` UMD (`src/frontend/index.html`).
Live data check (2026-09-26): only **5 contributors** exist, 4 with no category and 1 with `sport-recreation` (in the 12). **No data migration needed.**
Old event/place slugs must remain *accepted* on read (existing rows); new writes from Apply / Admin-create / intake should use the 12.

### 3.2 Organisation Type (`contributor_kind`)
The founder added **Individual**. Keep all four:
- **Ministry** → `ministry` (church, ministry)
- **Organisation** → `organization` (NPO / non-profit)
- **Business** → `business` (registered company / shop)
- **Individual** → **`individual` (NEW)**: a person serving in their own capacity (freelancer, counsellor, speaker, photographer, artist). A freelancer belongs here, not under Business.

The DB check `profiles_contributor_kind_check` (mig 036) only allows ministry/organization/business, so **migration 173 must widen it**.
Also update:
- `KINDS` in `src/frontend/app/entity-card.jsx` → add `individual: { label: 'Individual', icon: 'User' }`
- `KIND_ICON` in `src/frontend/app/map.jsx` → `individual: 'User'`
- the admin.jsx kind `<select>`
- `ALLOWED_KINDS` in `src/app/api/admin/contributors/create/route.ts` + `src/app/api/contributor/apply/route.ts`
- `type-change` route + `contributor_applications` if they validate kind (grep `contributor_kind`)
- `store.jsx:234` defaults a missing kind to `'organization'`; leave it

Check `src/types/db.ts` for a kind union type.
**Note the overlap:** "Business" exists as both a kind and a type (#4). The founder is fine with it: kind = how you're set up, type = what you do.

### 3.3 Other decisions / facts
- **Publish gate = B** (Approve tick box). Anti-abuse rationale: a public form + instant publish would let anyone map a fake or impersonated church under someone else's email.
- **Email from the founder's Gmail via Apps Script `MailApp`** (not Resend). Consumer Gmail quota ≈100/day. Resend exists (`supabase/functions/_shared/email.ts`) but `RESEND_API_KEY` is unverified.
- **Identity linking (the founder asked whether form-created accounts are recognised on Google sign-in):**
  - The intake creates the auth user via `admin.auth.admin.createUser({ email, email_confirm: true })`: email-only, **no password, no identity** (a placeholder, not a usable "local account").
  - On Google sign-in with the **same** email, Supabase auto-links the Google identity to that user.
  - **Evidence:** live `auth.identities` shows a contributor with **both `email` and `google` providers on one user**.
  - So the owner signs in **as** the listing account: same profile, already `role='contributor'`, `contributor_status='approved'`.
  - **Caveat:** a *different* Google address creates a separate citizen account. The fallback is the existing claim flow (`claim_admin_created_contributor()`, only eligible for `role='citizen' AND contributor_status='not_applied'`).
  - The welcome email must say "sign in with Google using exactly `<email>`".
  - **Must be verified live** with a real test Google account in Phase 6.
- **Confirmation message** (founder to set in Form → Settings → Presentation). Suggested: *"Thank you! We'll email you at the owner address you gave us when your listing is live. Then just sign in to Citizens Connect with that Google account to manage your profile."*

---

## 4. The build (simplified architecture, agreed direction)

```
Founder ticks "Approve" in the Sheet
  → installable onEdit trigger (Apps Script, runs as the founder)
  → builds JSON from the row (+ logo/cover blobs from Drive, base64)
  → POST https://<prod-domain>/api/intake/google-form   (HMAC-signed)
  → Connect: verify → validate → map labels → geocode → create auth user → RPC fills profile → upload images → return {slug, url}
  → script writes Status / Listing URL / Processed at back to the row
  → script MailApp-sends the welcome email to the owner
Owner signs in with Google (same email) → auto-linked → lands on /dashboard
```

**Cut for simplicity (do not build):** a `contributor_intake` staging table (the Sheet is the queue/log), Resend, Sheet polling, a Vercel cron, Google credentials in Vercel, gallery photos in v1.

### 4.1 Migration `173_contributor_form_intake.sql` (via MCP `apply_migration`)
Protocol (monorepo CLAUDE.md):
- Tag a pre-apply git tag first.
- Read the **live** definitions before replacing anything: `select pg_get_functiondef('public.protect_role_column'::regproc)` and the same for `admin_create_contributor_profile`.
- After applying, run the security advisors: **0 ERROR / 0 unexpected new findings**.
- **Known footguns (§3AE, migs 165/166):** `CREATE OR REPLACE FUNCTION` **drops** the `SET search_path = ''` hardening unless restated, and `CREATE OR REPLACE VIEW` **drops** `security_invoker`. Restate both.

Contents:
1. Widen `profiles_contributor_kind_check` to include `'individual'` (drop + re-add; `NOT VALID` is unnecessary since the data is tiny). Also check `contributor_applications.contributor_kind` for a matching check.
2. **Trigger carve-out in `protect_role_column()`:** `if coalesce(auth.role(), '') = 'service_role' then return new; end if;` placed right after the `is_admin()` bypass. It is safe because service_role already bypasses RLS entirely. This is required because the intake has no admin session: `is_admin()` keys on `auth.uid()`, which is null for service_role. This is the exact bug caught in §3AL PR #54.
   - Keep the existing body verbatim otherwise, including the self-approve and claim transitions.
3. New RPC `public.intake_create_contributor_profile(...)`:
   - `SECURITY DEFINER`, `SET search_path = ''`
   - `REVOKE ALL ... FROM public, anon, authenticated; GRANT EXECUTE ... TO service_role` (service_role only)
   - Mirrors `admin_create_contributor_profile` (mig 170) but with **no `is_admin()` check** and the **full field set**: `_x_handle`, `_linkedin_url`, `_whatsapp_number`, `_contact_email`, `_cover_photo_urls jsonb`, `_claim_email`.
   - Sets `role='contributor'`, `contributor_status='approved'`, `contributor_slug := public.generate_contributor_slug(...)`, `contributor_claim_email`, `contributor_created_by_admin = null`.
   - Returns `{success, slug}`.
   - (Alternative considered: with the carve-out, the route could `update` profiles directly with the service client. The RPC is preferred for one atomic statement + slug generation.)
4. `comment on` everything.
5. Update `apps/connect/docs/SHARED_DB_CONTRACT.md` §9 (head migration + advisor snapshot).

### 4.2 Contributor-type taxonomy in code
- `src/lib/categories.ts`: add a `ContributorType` union + `CONTRIBUTOR_TYPES: {value,label,hex,icon}[]` (the 12, §3.1) + `CONTRIBUTOR_TYPE_SLUGS` set. Add the 3 new slugs' hex/label wherever a category lookup must resolve them.
- `src/frontend/app/data.jsx`: add `CONTRIBUTOR_TYPES` (same shape as the event list: `{id,name,short,hex,icon}`); make `getCategory(id)` also resolve contributor types (event → place → contributor; the reused slugs already resolve).
- **Apply wizard** (`src/frontend/app/apply.jsx` `CategoryGrid`, line ~25) and **Admin Create** (`src/frontend/app/admin.jsx` ~171): switch `window.DATA.EVENT_CATEGORIES` → `window.DATA.CONTRIBUTOR_TYPES`. The label "Primary category" stays; the hint "sets your colour & icon" stays.
- **Server validation:** `src/app/api/contributor/apply/route.ts` and `src/app/api/admin/contributors/create/route.ts` build `ALLOWED_CATEGORIES` from EVENT ∪ PLACE. Accept EVENT ∪ PLACE ∪ CONTRIBUTOR_TYPES (back-compat), or tighten new writes to the 12. Put this in ONE shared helper; don't duplicate.
- Grep for other category consumers that must understand the 3 new slugs: map pins (`map.jsx pinIcon` via `DATA.getCategory`), Kingdom Discovery filters (`kingdom-discovery.jsx`), `entity-card.jsx`, `profiles.jsx`, `/api/v1/contributors`, and `CATEGORIES.md` (update the doc).
- Frontend rule (§3AD/§3AE): any touched `src/frontend/app/*.jsx` needs its `?v=` cache-bust bumped in `src/frontend/index.html`. New files must also go in `scripts/build-frontend.js` `appFileOrder`.

### 4.3 Intake route `POST /api/intake/google-form` (`src/app/api/intake/google-form/route.ts`)
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Read the **raw body** (`await request.text()`) before JSON-parsing.
- **Auth = HMAC, not a user session:**
  - Headers `X-Intake-Timestamp` (unix seconds) + `X-Intake-Signature` = hex HMAC-SHA256(`INTAKE_WEBHOOK_SECRET`, `timestamp + "." + rawBody`).
  - Reject if |now − ts| > 300 s. Compare with `crypto.timingSafeEqual` (equal-length buffers).
  - 401 on any failure, with no detail. Missing env secret → 503 (fail closed).
  - Rate-limit via `checkRateLimit` (`src/lib/rate-limit`).
- **Validation:** extract the admin-create route's rules into a shared module (e.g. `src/lib/contributorFields.ts`) and have **both** routes use it:
  - `trimOrNull`, `MAX_*` constants, the bounded `EMAIL_RE`, and length-before-regex (the ReDoS lesson, §3AL)
  - `coercePublicUrl` / `hasUnsafeScheme` from `src/lib/publicUrl`
  - The profile route caps socials at 500; the admin route caps handles at 80. Pick 500 for intake to match the profile route.
- Require `faith_alignment === true && permission_to_publish === true`. The script sends booleans; it checks the cells are non-empty.
- **Geocoding (server-side):**
  - First parse coordinates from the Maps link: `@lat,lng`, `?q=lat,lng`, `!3dlat!4dlng`.
  - Short `maps.app.goo.gl` links: have the **Apps Script** resolve the redirect (`UrlFetchApp.fetch(url, {followRedirects:false})` → `Location` header) and send the long URL.
  - Fallback: MapTiler geocoding of the address, same call as `store.jsx:87` `geocodeAddress` (`https://api.maptiler.com/geocoding/<q>.json?key=…&limit=1&country=za`). Server key: `NEXT_PUBLIC_MAPTILER_KEY` exists (`src/lib/map/config.ts`), so reuse it.
  - If both fail: still create the listing without coordinates (it shows in Kingdom Discovery, no pin) and return a `warning` the script writes to the row.
  - `no_fixed_location` → null coordinates and address.
- **Create:** the same sequence as `admin/contributors/create`:
  1. `createAdminClient()` → `auth.admin.createUser({ email: claimEmail, email_confirm: true, user_metadata: { full_name, created_via: 'google_form' } })`.
     - An "already been registered" error → **409 `email_already_registered`**. This doubles as **idempotency**: re-ticking a processed row can't duplicate. The script also skips rows whose Status is already set.
  2. Call the RPC with the **service client** (service_role).
  3. On RPC failure → `auth.admin.deleteUser` rollback (copy the existing pattern).
- **Images (logo + cover only in v1):**
  - The body carries `{ logo?: {mime, base64}, cover?: {mime, base64} }`.
  - Allow `image/jpeg|png|webp` only and check magic bytes, not just the claimed mime. Cap each decoded image at ≤2 MB.
  - Vercel's request body limit is ~4.5 MB, so the script must skip images over the cap and note it in the row.
  - Upload with the service client to the existing bucket used for contributor logos today. `MediaPicker` uses scope `event-cover` → bucket **`event-images`** (see `src/app/api/media/upload/route.ts` `SCOPE_CONFIG`). Use a server-built path like `contributors/<userId>/logo-<uuid>.<ext>`.
  - Store the public URLs via the RPC args.
  - Upload **after** creating the user and **before** the RPC. On failure, create the listing without images plus a warning; don't fail the whole intake.
- **Response:** `{ success, slug, url, warnings: string[] }`. `url` = `<APP_ORIGIN>/<slug>` (check how public contributor URLs are formed in the frontend router before hard-coding).
- **Log:** there is no admin actor, so either skip `logAdminAction` or log with a system marker. Check the `admin_audit_log` schema (whether `actor_id` is nullable).
- **Tests** (`src/__tests__/api/intake/google-form.test.ts`, mirror `src/__tests__/api/admin/contributors-create.test.ts` mocks):
  - bad/missing signature
  - stale timestamp
  - missing secret → 503
  - required fields
  - unknown category/kind label → 400
  - consent false → 400
  - `email_already_registered` → 409
  - RPC failure → deleteUser rollback
  - Maps-link coordinate parsing
  - no-fixed-location nulls coordinates
  - oversize/unsupported image → warning, not failure
  - a ReDoS input on the email field resolving fast (existing test pattern)
- **Label → slug maps live server-side** (single source of truth); the script sends raw labels. Tolerant matching: normalise case, whitespace, `&`↔`and`, `/` spacing.

### 4.4 Apps Script `apps/connect/tools/google-forms/intake.gs` (bound to the Responses Sheet)
- **Manual columns** the founder adds **to the right of AE**, with these exact headers: `Approve` (Insert → Checkbox), `Status`, `Listing URL`, `Processed at`, `Notes`.
- `setup()` (run once):
  - creates an **installable** onEdit trigger: `ScriptApp.newTrigger('onApproveEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create()`. A *simple* `onEdit` cannot call `UrlFetchApp`/`MailApp`.
  - validates that the headers exist.
- `onApproveEdit(e)`: act only when the edited column's header is `Approve`, the new value is `TRUE`, the row > 1, and `Status` is empty.
  - Use `LockService.getScriptLock()`.
  - Build the payload by **header prefix** (`Question 1.3:` etc.).
  - Drive file ids: parse from `open?id=` URLs. `DriveApp.getFileById(id).getBlob()` → `Utilities.base64Encode(blob.getBytes())`. Skip if >2 MB.
  - Resolve short Maps links.
  - Sign: `Utilities.computeHmacSha256Signature(ts + '.' + body, secret)` → hex.
  - `UrlFetchApp.fetch(INTAKE_URL, {method:'post', contentType:'application/json', payload: body, headers:{...}, muteHttpExceptions:true})`.
- On 200: write `Status = Live ✓`, `Listing URL`, `Processed at`, and `Notes` = warnings. Then `MailApp.sendEmail({to: ownerEmail, subject, htmlBody, name: 'Citizens Connect'})`:
  - the welcome email includes the listing link, "Sign in with Google using exactly **<owner email>**", and the app sign-in link.
- On error: `Status = Error`, `Notes` = the error code, and **untick Approve** so the founder can fix and retry.
- Secrets: `PropertiesService.getScriptProperties()` → `INTAKE_URL`, `INTAKE_SECRET`. Never hard-code them. Never put the Supabase service key in Apps Script.
- Also ship `apps/connect/tools/google-forms/README.md`: the founder's step-by-step setup (§6). Mark the old `create-contributor-application-form.gs` as superseded in its header.

### 4.5 Sign-in landing (step 6)
- Today, claiming is only a manual account-menu button (`src/frontend/app/shell.jsx` `claimListing`, ~line 49, POST `/api/contributor/claim` → `window.location.href='/dashboard'`).
- Add to the session bootstrap in `src/frontend/app/store.jsx` (real users only, once per session):
  - **(a)** If the signed-in profile is `role='contributor'` with `contributor_claim_email` not null and `contributor_claimed_at` null (the auto-linked case): stamp claimed via a new tiny own-row RPC (`mark_own_listing_claimed()`, SECDEF, `auth.uid()` row only, sets `contributor_claimed_at=now()`, `contributor_claim_email=null`; migration 173) or a route. Then `go('dashboard')` with a welcome toast.
  - **(b)** If `role='citizen'` and `contributor_status='not_applied'`: silently POST `/api/contributor/claim`. On 200 → dashboard. On 404 `nothing_to_claim` → do nothing (no toast).
  - Check what profile fields the bootstrap already loads (`myProfileMeta`, etc.) before adding a fetch.
- Consider a `?welcome=1` deep link from the email.
- Keep the manual menu button as the fallback.
- **e2e:** extend `apps/connect/e2e/` using the existing hermetic-mock approach (§3AE: `cc_session_v1` localStorage + `page.route()` mocks). Cover "contributor with unclaimed listing lands on dashboard".

### 4.6 Gates before every push (monorepo root CLAUDE.md)
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- `pnpm --filter citizens-connect test:e2e`
- `node scripts/build-frontend.js`
- security review of the HMAC route + migration (RLS/grants)
- Supabase advisors after the migration

Open a PR only if the founder asks. Update `RESUME_HERE.md` §3AP at session end.

---

## 5. Phases (do in order; each one shippable)

0. **Get the answer-option labels** (test response or pasted lists) + confirm the production domain for `INTAKE_URL` and the email links. Candidates seen in the repo: `https://citizensconnect.app`, `https://citizens-connect.vercel.app`; check Vercel project domains via the Vercel MCP.
1. Migration 173 (§4.1).
2. Taxonomy + Individual kind in code (§4.2, §3.2).
3. Intake route + shared validator + tests (§4.3). Add `INTAKE_WEBHOOK_SECRET` to Vercel env: the **founder** generates it (e.g. `openssl rand -hex 32`) and adds it in Vercel → Settings → Environment Variables (Production + Preview). Never paste it in chat or commits.
4. Apps Script `intake.gs` + README (§4.4).
5. Sign-in landing (§4.5).
6. **Live end-to-end test with the founder:**
   1. Submit the form using a test Google account.
   2. Tick Approve → pin on the map + listing in Kingdom Discovery.
   3. Check the email arrives.
   4. Sign in with the same Google account → dashboard.
   5. Also test a *different* Google account → claim fallback.
   6. Hide/delete the test listing afterwards (`/api/admin/contributors/hide` or `.../delete`).

## 6. Founder setup checklist (for the README; hand over at Phase 4)
1. Form → Settings → Presentation → confirmation message (§3.3).
2. In the Sheet, add the headers `Approve` (checkbox column), `Status`, `Listing URL`, `Processed at`, `Notes` to the right of the last question column.
3. Sheet → Extensions → Apps Script → paste `intake.gs` → Project Settings → Script properties: `INTAKE_URL`, `INTAKE_SECRET`.
4. Run `setup()` once and approve the permissions (Sheets, Drive read, external requests, send mail).
5. Vercel → add `INTAKE_WEBHOOK_SECRET` (same value as `INTAKE_SECRET`) → redeploy.
6. Test with one response (Phase 6).

## 7. Known gaps / explicitly out of scope for v1
- Gallery photos (Z) and team invites (AA): later. Owners add these from the dashboard.
- Q3.4 "areas served" has no DB column (not stored).
- The admin Create form/route will still lack X/LinkedIn/WhatsApp/contact email/cover unless Phase 2/3 also extends them. Optional, but cheap once the shared validator exists.
- The Drive field-spec Doc still shows the 17 categories. Update or annotate it after Phase 2.
- `send_later` check-ins/PR watching only if a PR is opened.
