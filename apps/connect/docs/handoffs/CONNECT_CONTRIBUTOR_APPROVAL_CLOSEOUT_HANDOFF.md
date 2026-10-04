# Connect: contributor approval gate (D-12) and owner welcome email (D-13): close-out handoff

> **Type:** stateless close-out, written 2026-10-04 by the code session that built Parts A, B and C of
> `CONNECT_CONTRIBUTOR_ONBOARDING_HANDOFF.md`. Everything below was checked against git, GitHub and the
> production database that day. **Re-read every file before changing it.** Other sessions are active.

## 1. Where things stand

| Part | PR | State |
|---|---|---|
| A: approve resets `contributor_hidden` (P1 bug), repaired admin review RPCs | #86 | merged; migration 179 applied 2026-10-03 |
| B: self-serve applications wait for an admin (D-12) | #88 | merged 2026-10-04 (`aeaf966`); **migration 180 applied** 2026-10-04 (version `20261004061633`) after the deploy, pre-apply tag `connect-pre-mig180-contributor-approval`; the production probe was green |
| C: admin-created listings email the owner a welcome (D-13) | #90 | merged 2026-10-04 (this document is part of it) |

Database head: migration 180 (`20261004061633`); next free number is **181**. Security advisors after the last migration: 0 ERROR / 118 WARN / 3 INFO (the new baseline: one fewer WARN, because the dropped `self_approve_contributor_application` was an authenticated SECURITY DEFINER grant).

## 2. What exists now

- **Apply** (`POST /api/contributor/apply`) saves a `pending` application with the service-role client (scoped to the verified
  user), flips `profiles.contributor_status` to `pending` (rolls the application back if that fails) and emails the admin.
  Nothing self-approves. The admin notice is capped at 20 emails an hour across all applicants.
- **Pending Dashboard** (`src/frontend/app/pending-application.jsx`): banner plus a profile editor. Edits go to
  `GET/PATCH /api/contributor/application` and are STAGED on the applicant's own `contributor_applications` row. `profiles`,
  `places` and `news_posts` are world-readable, so nothing is written there while pending. Approval copies the staged fields.
  Pending applicants get **profile only**; events, places and news open on approval (item C18).
- **Admin → Applications**: `POST /api/admin/contributors/review` calls `approve_/reject_contributor_application` on the admin's own
  session, writes an audit row and emails the applicant (fail-soft). The card shows "Previously removed by an admin on <date>",
  requires a reason to reject, renders links only if they are http(s), and **waits for the server**.
- **Migration 180** closed four self-approval doors: the RPC was dropped, `protect_role_column` is SECURITY INVOKER and lets a user
  go only `not_applied`/`rejected` → `pending`, `contributor_applications` has no client write privileges, and the withdraw policy is
  unreachable. A static test fails if `self_approve_contributor_application` reappears in app code.
- **Email helper** `src/lib/email` (Resend over HTTP): never throws, returns `sent | failed | skipped`, logs no address or key,
  escapes every value. Without `RESEND_API_KEY` it returns `skipped`.
- **Admin Create** has an "Email the owner a welcome" checkbox (on by default), shows the email status in the success panel, and
  the stale "sign in with Google" copy is fixed.

## 3. What is left (nothing here blocks the code)

1. **Founder, Vercel:** add `RESEND_API_KEY` (a sending-only Resend key) and `ADMIN_NOTIFY_EMAIL` to the Vercel **Connect** project for
   Production and Preview, then redeploy. Until then every email is `skipped` (logged, never an error).
2. **Founder, live checks** (RESUME item A11):
   1. Become a Contributor with a fresh Gmail plus-address (e.g. `+applytest2`) → Dashboard shows the "being reviewed" banner → not
      on the map → the admin email arrives → Admin → Applications → Approve → the applicant gets "You're live" and the pin appears.
   2. Reject one → the applicant gets the reason and can apply again.
   3. Admin → Create with "Email the owner" ticked → the welcome arrives (check junk) → 6-digit sign-in → Dashboard; clean up via
      Admin → Listings → Delete.
   4. Delete a test listing, re-apply with the same account, approve → it **is** on the map (Part A).
3. **PR #89 (C15, URL routing; another session)** overlaps these changes in `store.jsx`, `shell.jsx`, `admin.jsx` and
   `index.html` (and the `?v=` stamps there). Whoever merges second merges `main` in, resolves, and re-runs the e2e suite.
4. **RESUME items opened:** C18 (drafts for pending applicants), S12 (open policies found: `news_posts` INSERT is
   `auth.uid() = contributor_id` for any signed-in user; `profiles`/`places`/`news_posts` SELECT are `true`; `/stats` has no
   `contributor_hidden` guard), A11 (the founder steps above), H5 (the `review-contributor-application` edge function is deployed
   but unused; founder decides whether to undeploy).
5. **Housekeeping, not done:** RESUME §6 now holds more than the ~8 entries it should; move the oldest to
   `docs/archive/RESUME_HISTORY_2026H2.md`.

## 4. Gotchas this session hit (also in RESUME §3)

- Another session's dev server held port 3100, so Playwright's `reuseExistingServer` tested the wrong files. Use a throwaway config on a free port.
- Heredoc/node scripts can lose backslashes (`\r\n` became real line breaks). Use `String.fromCharCode(92)` and re-read.
- `profiles-column-privacy.test.ts` is a security gate: a new service-role read of a private column needs a justified `SERVICE_ROLE_READS` entry.
- e2e specs must not redeclare `Window.__cc` / `__ccMap`; use `e2e/support/app-hooks.ts`.

## 5. Paste-ready prompt for a stateless continuation

```
You are continuing the citizens-ecosystem monorepo (Citizens Connect, apps/connect). Read, in order: the root CLAUDE.md,
apps/connect/VISION.md (run its alignment self-prompt), apps/connect/RESUME_HERE.md (§2, §3, and items A11, C18, S12, H5), then
apps/connect/docs/handoffs/CONNECT_CONTRIBUTOR_APPROVAL_CLOSEOUT_HANDOFF.md.

State: founder decisions D-12 (self-serve Contributor applications wait for an admin) and D-13 (admin-created listings email the
owner a welcome) are built and merged (PRs #86, #88, #90); migrations 179 and 180 are applied. What remains is mostly founder
work (Vercel env vars RESEND_API_KEY + ADMIN_NOTIFY_EMAIL, then the four live checks in A11). Before doing anything, run
`git fetch`, `git branch --show-current` and `ls -t .claude/sessions`: other sessions are active, so never switch branches in a
checkout another session owns (use a sibling worktree).

Pick ONE of these (ask the founder which, in one question):
 1. Walk the A11 live checks with the founder and fix whatever they find.
 2. S12: tighten `news_posts` INSERT to approved Contributors, add the `contributor_hidden` guard to /api/v1/contributors/<slug>/stats,
    and review the open SELECT policies. Needs a migration: ask first, push a pre-apply tag, run a rollback-only probe, and compare
    advisors with 0 ERROR / 118 WARN / 3 INFO.
 3. C18: drafts for pending applicants (design first: places and news_posts SELECT policies are `true`).

Rules that bit this work: a pending applicant is role='citizen' + contributor_status='pending' and their edits are staged on
contributor_applications (server-written only since mig 180); never write them to profiles/places/news_posts. Email goes through
src/lib/email (fail-soft; tests mock sendEmail). e2e: use a free port and a throwaway Playwright config if 3100 is taken; don't
redeclare Window hooks (use e2e/support/app-hooks.ts). Merges and migration applies need explicit in-chat founder approval. Never
commit real people's or organisations' contact details (public repo; use .example addresses).

Run the gates (pnpm format:check, lint, build BEFORE typecheck, test, then Connect e2e), do a vibe-security pass, update
RESUME_HERE.md at the END only, and finish with the DONE / LEFT / continuation-prompt close-out.
```
