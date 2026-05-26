# Supabase Setup — Production Runbook

One-time operational checklist to wire a fresh Supabase project (or a clone
used for a new deployment) to the Citizens Connect app.

> If you are only recovering an existing environment that stopped working,
> use `.github/SUPABASE_RECOVERY.md` first — it covers the fast
> reconnect/validation path.

---

## 1. Environment variables

Populate these in **`.env.local`** (dev), **Vercel → Project → Settings →
Environment Variables** (prod), and **`.env`** for Capacitor builds:

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | all envs | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all envs | Public anon key (safe — RLS enforces access) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Service role for Edge Functions / server admin tasks. **Never commit or expose.** |
| `NEXT_PUBLIC_SITE_URL` | all envs | e.g. `https://citizens-connect.vercel.app`. Used for auth callback redirects. |
| `NEXT_PUBLIC_MAPTILER_KEY` | optional | Falls back to OSM raster tiles if unset |
| `DATABASE_URL` | local dev | Direct Postgres URL — used only by the Supabase CLI |

After saving env vars on Vercel, trigger a new deploy (Vercel does not
re-read env vars on existing builds).

---

## 2. Auth → URL Configuration

Supabase Dashboard → **Authentication → URL Configuration**:

1. **Site URL** — set to the production origin, e.g.
   `https://citizens-connect.vercel.app`.
2. **Redirect URLs** — add each of the following (one per line):
   - `https://citizens-connect.vercel.app/auth/callback`
   - `https://citizens-connect.vercel.app/login/reset-password`
   - `http://localhost:3000/auth/callback` (for local development)
   - `http://localhost:3000/login/reset-password`
   - `citizensconnect://auth/callback` (Capacitor deep link)

> Without these, the password-reset and email-confirmation links will fail
> with "redirect_to not allowed".

---

## 3. Auth providers

- **Email/password** — enable, with "Confirm email" optional for dev
  (mandatory for prod).
- **Magic Link** (optional) — enable if you want passwordless sign-in.
- **Phone** (optional) — requires an SMS provider (Twilio or MessageBird);
  configure in Settings → Auth → SMS.

---

## 4. Storage buckets

Buckets are created by migrations, but verify they exist under Storage:

| Bucket | Public | Policies | Migration |
|--------|--------|----------|-----------|
| `event-images` | ✅ | Public read; owner-scoped insert/update/delete | `031_event_images_rls_and_care_category.sql` |
| `place-images` | ✅ | Public read; owner-scoped insert/update/delete | `025_place_images_bucket.sql` |
| `avatars` | ✅ | Public read; owner-scoped insert/update/delete | `028_avatars_bucket.sql` |

If the bucket is missing, re-run the migration (all bucket migrations use
`ON CONFLICT DO UPDATE` and are idempotent).

---

## 5. Database migrations

From the project root:

```bash
# One-time: link to the remote project
npx supabase link --project-ref <project-ref>

# Apply all pending migrations in order
npx supabase db push
```

For hotfixes that need to run against an existing prod DB without deploying
the whole migration history, open Supabase Dashboard → **SQL Editor**, paste
the migration file's contents, and Run.

---

## 6. Push notifications (mobile)

Only needed if you're shipping Capacitor builds.

1. Create a **Firebase project** and enable **Cloud Messaging (FCM v1)**.
2. Download the server key JSON and add it as a Supabase secret:
   ```bash
   npx supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat path/to/firebase.json)"
   ```
3. For iOS, add APNs authentication key to Firebase.
4. Deploy notification Edge Functions:
   ```bash
   npx supabase functions deploy notify-interested-users \
     notify-event-cancelled send-rsvp-reminders \
     notify-new-follower send-daily-digest
   ```
5. Schedule `send-rsvp-reminders` and `send-daily-digest` via
   **Database → Cron Jobs** (daily at 08:00 UTC).

---

## 7. Smoke test

After deploy, manually verify:

- [ ] Sign up with a new email — profile row auto-created
      (`on_auth_user_created` trigger)
- [ ] Forgot password → email received → reset link lands on
      `/login/reset-password`
- [ ] Create an event with a cover image (5–15 MB) — image compresses and
      uploads (no RLS error)
- [ ] Map view renders with category markers
- [ ] Push token registers on the Capacitor build (check `push_tokens`
      table)
- [ ] Notifications bell shows unread count after a follow / RSVP / comment
