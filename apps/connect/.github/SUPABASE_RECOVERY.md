# Supabase Recovery Runbook

Use this when app auth/data suddenly stops working or after changing keys/project linkage.

## 1) Confirm project linkage

Expected project URL:
- `https://xyiajtrvhlxaeplsiajj.supabase.co`

Required local env keys in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`

## 2) Fast connection checks

1. Verify DB reachability with MCP SQL:
- `select current_database(), now();`

2. Verify key app tables exist:
- `profiles`, `events`, `rsvps`, `comments`, `categories`, `places`, `reviews`

3. Verify RLS is enabled on public tables.

## 3) If app still fails to connect

1. Ensure env is loaded by restarting dev server.
2. Confirm no trailing spaces/quotes in `.env.local` values.
3. Re-run migration verification and table checks.
4. Use MCP-first migration flow instead of local Supabase CLI if CLI is unstable.

## 4) Migration-first workflow (recommended)

Use prompt:
- `.github/prompts/apply-supabase-migration.prompt.md`

This avoids local CLI blockers and applies migrations directly via MCP with verification.

## 5) Conversation-safe continuity

If chat is deleted, resume using:
- `.github/prompts/resume-project.prompt.md`
- `.github/prompts/reconnect-supabase.prompt.md`
