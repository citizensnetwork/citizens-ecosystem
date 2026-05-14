# Citizens Connect — Operations Runbook

> Quick reference for recurring owner tasks, environment setup, and production operations.

---

## 1. Local Development Setup

```powershell
# Windows: prepend Node to PATH first (required every new terminal session)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# Install dependencies
npm install

# Copy env template and fill in values
Copy-Item .env.example .env.local

# Start dev server
npm run dev
```

---

## 2. Required Environment Variables

| Variable | Where to get it | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API | Yes |
| `NEXT_PUBLIC_MAPTILER_KEY` | [MapTiler Cloud](https://cloud.maptiler.com/account/keys/) | Yes (prod) |
| `NEXT_PUBLIC_MAPTILER_STYLE` | MapTiler Cloud → Maps → copy style UUID | Yes (prod) |

**Locked style UUID:** `019dba0f-b49b-73bb-bf6a-f9d820f43be8` (Kingdom Commons branded style).

### Setting variables on Vercel (T4 — owner task)

1. Go to [Vercel Dashboard](https://vercel.com) → Citizens Connect project
2. **Settings → Environment Variables**
3. Add both `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE`
4. Set scope: **Production, Preview, Development** for both
5. Click **Save** → trigger a new deployment (or push a commit)
6. Verify: open the deployed site → map should show the branded Kingdom Commons style (not generic OSM tiles)

---

## 3. Quality Gate (run before every push)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # 0 errors required
npx vitest run              # all tests passing required
npx next lint --dir src     # clean required (deprecation warning is non-blocking)
```

---

## 4. Supabase Operations

See `.github/SUPABASE_RECOVERY.md` for the full reconnect runbook.

### Apply a migration

```powershell
# Via Supabase MCP (preferred in AI sessions):
# mcp_supabase_apply_migration

# Or via Supabase CLI:
supabase db push
```

### Deploy an Edge Function

```powershell
# Via Supabase MCP:
# mcp_supabase_deploy_edge_function

# Or via CLI:
supabase functions deploy <function-name>
```

### Check security advisors

Via Supabase MCP: `mcp_supabase_get_advisors type:"security"`.
Current known baseline (do not fix in passing — address in dedicated batch):
- `directory_contributors` — security_definer_view (BUG-06)
- `app_settings` — RLS not enabled (BUG-06)

---

## 5. Capacitor Mobile Builds

### Android

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx next build
npx cap sync android
# Then open Android Studio: npx cap open android
```

### iOS (Mac only)

```bash
npx next build
npx cap sync ios
npx cap open ios
```

---

## 6. Git Commit Convention

```powershell
# Write commit message to file (avoids PowerShell quoting issues)
Set-Content .git/COMMIT_MSG.txt "feat: short description`n`nDetails..."
git add -A
git -c user.name="Citizens Network" -c user.email="citizensnetworkpbo@gmail.com" commit -F .git/COMMIT_MSG.txt
git push origin main
```

---

## 7. MapTiler Key Expiry

If the map stops showing branded tiles:
1. Log in to [MapTiler Cloud](https://cloud.maptiler.com)
2. Check **Account → Keys** — verify the key is not expired or rate-limited
3. Regenerate if necessary and update both `.env.local` and Vercel environment variables
4. Verify the style UUID (`019dba0f-b49b-73bb-bf6a-f9d820f43be8`) still exists in **Maps**

---

## 8. Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Map shows plain OSM tiles | `NEXT_PUBLIC_MAPTILER_KEY` not set | Set in `.env.local` / Vercel |
| Auth redirects broken | Supabase site URL / redirect URLs not set | Supabase → Auth → URL Configuration |
| Push notifications not arriving | FCM credentials expired or wrong | Check Edge Function logs via MCP |
| TypeScript errors on Windows | `node_modules/.bin` not in PATH | Prepend Node PATH as shown above |
| Tests fail on CI | Missing env vars | Ensure secrets are set in GitHub Actions |
