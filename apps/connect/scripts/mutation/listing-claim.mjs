// ════════════════════════════════════════════════════════════════════
//  Mutation check for the verify-first listing claim (C10, issue #159): does the test suite notice when the trust fix is
//  quietly broken? The claim path is an account-takeover surface, so the questions asked here are the ones an attacker
//  would hope are not tested: is the status poll signed, can the cron be called by anyone, does the alias ever get mailed,
//  can an applicant or an admin be handed a listing, does a stray tap answer for the person, does signing in claim.
//  ------------------------------------------------------------------
//  Each mutant changes ONE thing in ONE source file, runs the narrowest tests that should catch it, and records KILLED
//  (a test failed) or SURVIVED (everything still passed: a hole in the tests, or an equivalent mutant noted as such).
//  The database functions have their own mutation run against a scratch Postgres (31 mutants); this one covers the
//  TypeScript, the Apps Script and the screen.
//
//  SELF-HEALING, because killing a run half way (taskkill /F cannot be trapped) must never leave the tree mutated:
//    1. before each mutation the original is copied to <repo>/.claude/sessions/listing-claim-mutation-recovery/ and a manifest
//       names it; the copy is deleted only after the file has been restored;
//    2. on start the harness restores anything the manifest still names (a previous run that was killed);
//    3. a hash of `git diff HEAD` plus every untracked file is taken before and after, and the run fails loudly if it moved.
//  A run that executes no test at all is INCONCLUSIVE, never "survived".
//
//  Usage (from apps/connect):  node scripts/mutation/listing-claim.mjs [--only <id,id>] [--unit] [--e2e] [--list] [--dry]
//  --dry checks every find-text still matches exactly once and runs nothing (use it after editing the sources).
//  The e2e mutants start Playwright's own dev server on E2E_PORT (default 3100): choose a free port, or stop what is on it.
// ════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");
const RECOVERY = join(REPO, ".claude", "sessions", "listing-claim-mutation-recovery");
const MANIFEST = join(RECOVERY, "manifest.json");

const T_STATUS = ["src/__tests__/api/intake/status.test.ts"];
const T_CLAIM = ["src/__tests__/api/contributor-claim.test.ts"];
const T_DECLINE = ["src/__tests__/api/contributor-claim-decline.test.ts"];
const T_CRON = ["src/__tests__/api/cron/listing-claim-reminders.test.ts"];
const T_LIB = ["src/__tests__/lib/listingClaim.test.ts"];
const T_EMAIL = ["src/__tests__/lib/email.test.ts"];
const T_INTAKE = ["src/__tests__/api/intake/google-form.test.ts"];
const T_ADMIN = ["src/__tests__/api/admin/contributors-create.test.ts"];
const T_USERS = ["src/__tests__/api/admin/users.test.ts"];
const T_GS = ["src/__tests__/tools/intakeScript.test.ts"];
const T_FE = ["src/__tests__/frontend/listing-claim.test.tsx"];
const E2E = ["e2e/listing-claim.spec.ts"];

const STATUS = "src/app/api/intake/google-form/status/route.ts";
const CLAIM = "src/app/api/contributor/claim/route.ts";
const DECLINE = "src/app/api/contributor/claim/decline/route.ts";
const ROUTE_AUTH = "src/lib/supabase/route.ts";
const CRON = "src/app/api/cron/listing-claim-reminders/route.ts";
const LIB = "src/lib/listingClaim.ts";
const ALIAS = "src/lib/placeholderEmail.ts";
const SEND = "src/lib/email/send.ts";
const TEMPLATES = "src/lib/email/templates.ts";
const INTAKE = "src/app/api/intake/google-form/route.ts";
const ADMIN = "src/app/api/admin/contributors/create/route.ts";
const USERS = "src/app/api/admin/users/route.ts";
const GS = "tools/google-forms/intake.gs";
const DIALOG = "src/frontend/app/listing-claim.jsx";
const STORE = "src/frontend/app/store.jsx";
const SHELL = "src/frontend/app/shell.jsx";

// edits: [{ file, find, replace, count = 1 }]. `equivalent` marks a mutant that SHOULD survive (a second layer covers it).
const MUTANTS = [
  // ── the Sheet's status poll: signed, bounded, read-only
  { id: "status-unsigned", kind: "unit", tests: T_STATUS, edits: [{ file: STATUS, find: "  if (!gate.ok) return gate.response;", replace: "" }] },
  { id: "status-slug-any-text", kind: "unit", tests: T_STATUS, edits: [{ file: STATUS, find: "const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;", replace: "const SLUG_RE = /^.*$/;" }] },
  { id: "status-unbounded-list", kind: "unit", tests: T_STATUS, edits: [{ file: STATUS, find: "list.length > MAX_SLUGS", replace: "list.length > 1000000" }] },
  { id: "status-leaks-the-address", kind: "unit", tests: T_STATUS, edits: [{ file: STATUS, find: '.select("slug, status, created_at, reminder_sent_at")', replace: '.select("slug, status, created_at, reminder_sent_at, claim_email")' }] },
  { id: "status-oldest-wins", kind: "unit", tests: T_STATUS, edits: [{ file: STATUS, find: '.order("created_at", { ascending: true })', replace: '.order("created_at", { ascending: false })' }] },
  { id: "status-duplicates-sent-on", kind: "unit", tests: T_STATUS, edits: [{ file: STATUS, find: "slugs = [...new Set(list)];", replace: "slugs = list;" }] },
  // ── Confirm and the read-only question
  { id: "claim-ask-runs-the-claim", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: 'supabase.rpc("peek_claimable_listing")', replace: 'supabase.rpc("claim_admin_created_contributor")' }] },
  { id: "claim-ask-leaks-everything", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: '    mode: peek.mode === "self" ? "self" : "attach",', replace: '    ...peek,\n    mode: peek.mode === "self" ? "self" : "attach",' }] },
  { id: "claim-eligible-truthy", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: "eligible: peek.eligible === true,", replace: "eligible: !!peek.eligible," }] },
  { id: "claim-attach-after-unverified", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: 'if (ownResult?.reason && ownResult.reason !== "nothing_to_mark") {', replace: "if (false) {" }] },
  { id: "claim-unverified-is-409", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: "  email_not_verified: 403,\n", replace: "" }] },
  { id: "claim-cookie-session-accepted", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: "  if (!hasBearerToken(request)) return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });\n", replace: "" }] },
  { id: "claim-bearer-any-header", kind: "unit", tests: T_CLAIM, edits: [{ file: ROUTE_AUTH, find: 'return /^bearer\\s+\\S+/i.test(request.headers.get("authorization") ?? "");', replace: 'return (request.headers.get("authorization") ?? "") !== "" || true;' }] },
  { id: "claim-signed-out-allowed", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: '  if (!user) {\n    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });\n  }', replace: "" }] },
  { id: "claim-no-rate-limit", kind: "unit", tests: T_CLAIM, edits: [{ file: CLAIM, find: "  if (!rl.success) {\n    return NextResponse.json(\n      { error: \"Too many attempts\" },\n      { status: 429, headers: { \"Retry-After\": Math.ceil(rl.resetMs / 1000).toString() } },\n    );\n  }\n\n  // Self first", replace: "  // Self first" }] },
  // ── Not me
  { id: "decline-runs-the-claim", kind: "unit", tests: T_DECLINE, edits: [{ file: DECLINE, find: 'supabase.rpc("decline_listing_claim")', replace: 'supabase.rpc("claim_admin_created_contributor")' }] },
  { id: "decline-cookie-session-accepted", kind: "unit", tests: T_DECLINE, edits: [{ file: DECLINE, find: "  if (!hasBearerToken(request)) return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });\n", replace: "" }] },
  { id: "decline-admin-not-told", kind: "unit", tests: T_DECLINE, edits: [{ file: DECLINE, find: "  if (to) {", replace: "  if (false) {" }] },
  { id: "decline-unverified-is-409", kind: "unit", tests: T_DECLINE, edits: [{ file: DECLINE, find: "  email_not_verified: 403,\n", replace: "" }] },
  { id: "decline-email-before-success", kind: "unit", tests: T_DECLINE, edits: [{ file: DECLINE, find: "  if (!result?.success) {", replace: "  if (false) {" }] },
  // ── the one reminder
  { id: "cron-open-to-anyone", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: 'if (!bearerMatches(request.headers.get("authorization"), secret)) {', replace: "if (false) {" }] },
  { id: "cron-secret-optional", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: "const MIN_SECRET_LENGTH = 32;", replace: "const MIN_SECRET_LENGTH = 0;" }] },
  { id: "cron-bearer-prefix-match", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: "return given.length === expected.length && timingSafeEqual(given, expected);", replace: "return given.length > 0 && expected.toString().startsWith(given.toString());" }] },
  { id: "cron-stamp-unguarded", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: '      .eq("id", row.id)\n      .eq("status", "awaiting")\n      .is("reminder_sent_at", null)\n      .select("id");', replace: '      .eq("id", row.id)\n      .select("id");' }] },
  { id: "cron-failed-send-stays-stamped", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: '      await admin.from("listing_claims").update({ reminder_sent_at: null }).eq("id", row.id);\n', replace: "" }] },
  { id: "cron-reminds-hidden-listings", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: "if (!profile || profile.contributor_hidden || profile.deleted_at) {", replace: "if (!profile) {" }] },
  { id: "cron-after-one-day", kind: "unit", tests: T_CRON, edits: [{ file: LIB, find: "export const REMINDER_AFTER_DAYS = 7;", replace: "export const REMINDER_AFTER_DAYS = 1;" }] },
  { id: "cron-reminds-the-wrong-people", kind: "unit", tests: T_CRON, edits: [{ file: CRON, find: '    .eq("status", "awaiting")\n    .is("reminder_sent_at", null)\n    .lte(', replace: '    .is("reminder_sent_at", null)\n    .lte(' }] },
  // ── the alias placeholder is never mailed, and an account is only offered a listing when it is safe to
  { id: "alias-mailed", kind: "unit", tests: T_EMAIL, edits: [{ file: SEND, find: "  if (isPlaceholderEmail(to)) {", replace: "  if (false) {" }] },
  { id: "alias-domain-resolvable", kind: "unit", tests: T_LIB, edits: [{ file: ALIAS, find: 'export const PLACEHOLDER_EMAIL_DOMAIN = "listing-placeholder.invalid";', replace: 'export const PLACEHOLDER_EMAIL_DOMAIN = "listing-placeholder.example.com";' }] },
  { id: "alias-check-substring", kind: "unit", tests: T_LIB, edits: [{ file: ALIAS, find: "  return at >= 0 && value.trim().toLowerCase().slice(at + 1) === PLACEHOLDER_EMAIL_DOMAIN;", replace: "  return value.toLowerCase().includes(PLACEHOLDER_EMAIL_DOMAIN) && at >= 0;" }] },
  { id: "listing-user-alias-is-the-real-address", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "      email: placeholderAliasEmail(),", replace: "      email: input.claimEmail," }] },
  { id: "listing-user-offered-to-applicants", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'existing?.role === "citizen" && existing.contributor_status === "not_applied"', replace: 'existing?.role === "citizen"' }] },
  { id: "listing-user-offered-to-admins", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'existing?.role === "citizen" && existing.contributor_status === "not_applied"', replace: 'existing && existing.contributor_status === "not_applied"' }] },
  { id: "listing-user-second-listing-allowed", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'if (existing?.role === "contributor" && existing.contributor_slug) {', replace: "if (false) {" }] },
  { id: "ledger-duplicate-not-recognised", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'if (error.code === "23505") {', replace: 'if (error.code === "23506") {' }] },
  { id: "ledger-other-error-is-duplicate", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: '  console.error("[listingClaim] ledger insert", error);\n  return { ok: false, reason: "error" };', replace: '  return { ok: false, reason: "duplicate", existingSlug: null };' }] },
  // ── the Form intake and the admin Create: both ask, neither attaches
  { id: "intake-ledger-failure-ignored", kind: "unit", tests: T_INTAKE, edits: [{ file: INTAKE, find: "  if (!claim.ok) {", replace: "  if (false) {" }] },
  { id: "intake-ledger-source", kind: "unit", tests: T_INTAKE, edits: [{ file: INTAKE, find: '    claimEmail: fields.claimEmail,\n    source: "google_form",', replace: '    claimEmail: fields.claimEmail,\n    source: "admin_create",' }] },
  { id: "intake-account-flag-lost", kind: "unit", tests: T_INTAKE, edits: [{ file: INTAKE, find: "    owner_has_account: ownerHasAccount,", replace: "    owner_has_account: false," }] },
  { id: "intake-pending-not-reported", kind: "unit", tests: T_INTAKE, edits: [{ file: INTAKE, find: 'if (claim.reason === "duplicate") {', replace: "if (false) {" }] },
  { id: "admin-ledger-failure-ignored", kind: "unit", tests: T_ADMIN, edits: [{ file: ADMIN, find: "  if (!claim.ok) {", replace: "  if (false) {" }] },
  { id: "admin-welcome-ignores-account", kind: "unit", tests: T_ADMIN, edits: [{ file: ADMIN, find: "        hasAccount: ownerHasAccount,\n", replace: "" }] },
  { id: "admin-ledger-source", kind: "unit", tests: T_ADMIN, edits: [{ file: ADMIN, find: '    source: "admin_create",', replace: '    source: "google_form",' }] },
  { id: "admin-list-hides-ledger", kind: "unit", tests: T_USERS, edits: [{ file: USERS, find: "        ...(c ? { claim_status: c.status, claim_created_at: c.created_at } : {}),\n", replace: "" }] },
  // ── the words people are told (they must stay true)
  { id: "welcome-promises-dashboard", kind: "unit", tests: T_EMAIL, edits: [{ file: TEMPLATES, find: '"<li>Type the code in, then confirm the listing is yours.</li>" +', replace: '"<li>Type the code in. You\'ll land on your Contributor dashboard.</li>" +' }] },
  { id: "welcome-ignores-account", kind: "unit", tests: T_EMAIL, edits: [{ file: TEMPLATES, find: "const hasAccount = input.hasAccount === true;", replace: "const hasAccount = false;" }] },
  // ── the Apps Script (the Sheet only shows state; it never triggers anything)
  { id: "gs-poll-overwrites-edits", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "if (!isOpenStatus_(current) || current === label) return;", replace: "if (current === label) return;" }] },
  { id: "gs-poll-handler-private", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "function refreshStatuses() {", replace: "function refreshStatuses_() {" }] },
  { id: "gs-declined-row-resent", kind: "unit", tests: T_GS, edits: [{ file: GS, find: " || s === STATUS_DECLINED || isOpenStatus_(s);", replace: " || isOpenStatus_(s);" }] },
  { id: "gs-poll-posts-to-intake", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "  if (suffix) url += suffix;\n", replace: "" }] },
  { id: "gs-poll-every-hour", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "timeBased().everyMinutes(10)", replace: "timeBased().everyMinutes(60)" }] },
  { id: "gs-batch-too-big", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "var STATUS_BATCH = 200;", replace: "var STATUS_BATCH = 1000;" }] },
  { id: "gs-declined-note-dropped", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "if (entry.status === 'declined') {", replace: "if (false) {" }] },
  { id: "gs-new-row-says-live", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "cell('Status', awaitingStatus_(0, false));", replace: "cell('Status', STATUS_LIVE);" }] },
  { id: "gs-welcome-account-inverted", kind: "unit", tests: T_GS, edits: [{ file: GS, find: "var askHtml = hasAccount === true", replace: "var askHtml = hasAccount !== true" }] },
  { id: "gs-welcome-hasaccount-not-passed", kind: "unit", tests: T_GS, edits: [{ file: GS, find: " res.body.on_map === true, res.body.owner_has_account === true);", replace: " res.body.on_map === true);" }] },
  // ── the confirm screen
  { id: "dialog-swaps-confirm-and-decline", kind: "unit", tests: T_FE, edits: [{ file: DIALOG, find: "kind === 'confirm' ? '/api/contributor/claim' : '/api/contributor/claim/decline'", replace: "kind === 'confirm' ? '/api/contributor/claim/decline' : '/api/contributor/claim'" }] },
  { id: "dialog-double-tap (equivalent: the disabled buttons are the second layer)", kind: "unit", tests: T_FE, equivalent: true, edits: [{ file: DIALOG, find: "      if (lock.current) return;\n", replace: "" }] },
  { id: "dialog-always-eligible", kind: "unit", tests: T_FE, edits: [{ file: DIALOG, find: "const eligible = claim.eligible !== false;", replace: "const eligible = true;" }] },
  { id: "dialog-backdrop-answers", kind: "unit", tests: T_FE, edits: [{ file: DIALOG, find: "      onPointerDown: (e) => e.stopPropagation(),\n    },", replace: "      onPointerDown: (e) => e.stopPropagation(),\n      onClick: (e) => { if (e.target === e.currentTarget) send('decline'); },\n    }," }] },
  { id: "dialog-server-text-shown", kind: "unit", tests: T_FE, edits: [{ file: DIALOG, find: "        setError(status === 404 ? S.gone", replace: "        setError(res && res.statusText ? res.statusText : status === 404 ? S.gone" }] },
  { id: "dialog-no-reload-after-attach", kind: "unit", tests: T_FE, edits: [{ file: DIALOG, find: "      window.location.href = '/dashboard';\n", replace: "" }] },
  { id: "dialog-self-reloads", kind: "unit", tests: T_FE, edits: [{ file: DIALOG, find: "        app.resetNav('dashboard');\n        return;", replace: "        window.location.href = '/dashboard';\n        return;" }] },
  { id: "store-ask-claims", kind: "unit", tests: T_FE, edits: [{ file: STORE, find: "const res = await authedFetch('/api/contributor/claim');", replace: "const res = await authedFetch('/api/contributor/claim', { method: 'POST' });" }] },
  { id: "store-ask-trusts-any-answer", kind: "e2e", tests: [...E2E, "e2e/contributor-intake-landing.spec.ts"], edits: [{ file: STORE, find: "if (!body || body.found !== true) return null;", replace: "if (!body) return null;" }] },
  { id: "shell-manual-button-claims", kind: "unit", tests: T_FE, edits: [{ file: SHELL, find: "const found = await askAboutListing(realUser.id, true);", replace: "const found = await window.authedFetch('/api/contributor/claim', { method: 'POST' });" }] },
  // ── the same screen in a real browser
  { id: "page-never-asks", kind: "e2e", tests: E2E, edits: [{ file: STORE, find: "        askAboutListing(s.user.id, false, () => active);\n", replace: "" }] },
  { id: "page-no-dialog-host", kind: "e2e", tests: E2E, edits: [{ file: SHELL, find: "      window.CCListingClaim && React.createElement(window.CCListingClaim.Host),\n", replace: "" }] },
  { id: "page-decide-later-forgotten", kind: "e2e", tests: E2E, edits: [{ file: STORE, find: "try { if (userId) sessionStorage.setItem('cc_listing_claim_later_v1:' + userId, '1'); } catch (e) { /* still closes */ }", replace: "" }] },
  { id: "page-snooze-ignored", kind: "e2e", tests: E2E, edits: [{ file: STORE, find: "if (userId && sessionStorage.getItem('cc_listing_claim_later_v1:' + userId)) return null;", replace: "" }] },
];

// ── plumbing ─────────────────────────────────────────────────────────
const abs = (rel) => resolve(APP, rel);

function treeHash() {
  const run = (args) => spawnSync("git", args, { cwd: REPO, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  const h = createHash("sha256");
  h.update(run(["diff", "HEAD", "--binary"]).stdout);
  const untracked = run(["ls-files", "--others", "--exclude-standard", "-z"]).stdout.toString("utf8").split("\0").filter(Boolean).sort();
  for (const f of untracked) {
    h.update(f);
    try {
      h.update(readFileSync(join(REPO, f)));
    } catch {
      h.update("unreadable");
    }
  }
  return h.digest("hex");
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return {};
  }
}
function writeManifest(m) {
  mkdirSync(RECOVERY, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

/** Restore anything a previous (killed) run left mutated. */
function heal() {
  const m = readManifest();
  let healed = 0;
  for (const [rel, backup] of Object.entries(m)) {
    copyFileSync(backup, abs(rel));
    rmSync(backup, { force: true });
    healed++;
  }
  writeManifest({});
  for (const f of readdirSync(RECOVERY)) if (f.endsWith(".orig")) rmSync(join(RECOVERY, f), { force: true });
  if (healed) console.log(`self-heal: restored ${healed} file(s) a previous run left mutated`);
}

/** Apply a mutant's edits: stash every original first, then write. Returns an error string for a bad mutant. */
function apply(mutant) {
  const edits = mutant.edits.map((e) => ({ ...e, count: e.count ?? 1 }));
  const files = [...new Set(edits.map((e) => e.file))];
  const next = {};
  for (const rel of files) {
    let text = readFileSync(abs(rel), "utf8");
    const crlf = text.includes("\r\n");
    for (const e of edits.filter((x) => x.file === rel)) {
      const find = crlf ? e.find.replace(/\n/g, "\r\n") : e.find;
      const replace = crlf ? e.replace.replace(/\n/g, "\r\n") : e.replace;
      const parts = text.split(find);
      if (parts.length - 1 !== e.count) return `bad mutant: ${rel} has ${parts.length - 1} match(es) of the find text, expected ${e.count}`;
      text = parts.join(replace);
    }
    next[rel] = text;
  }
  const manifest = readManifest();
  for (const rel of files) {
    const backup = join(RECOVERY, `${files.indexOf(rel)}-${rel.replace(/[^a-z0-9.]+/gi, "_")}.orig`);
    mkdirSync(RECOVERY, { recursive: true });
    copyFileSync(abs(rel), backup);
    manifest[rel] = backup;
  }
  writeManifest(manifest);
  for (const rel of files) writeFileSync(abs(rel), next[rel]);
  return null;
}

function restore() {
  const m = readManifest();
  for (const [rel, backup] of Object.entries(m)) {
    copyFileSync(backup, abs(rel));
    rmSync(backup, { force: true });
  }
  writeManifest({});
}

/** The child's environment with this app's .bin first on PATH (Playwright's webServer command runs `next`; `npx` used to supply that). */
function childEnv() {
  const env = { ...process.env };
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[key] = join(APP, "node_modules", ".bin") + delimiter + (env[key] ?? "");
  return env;
}

function runTests(kind, tests) {
  const args =
    kind === "unit"
      ? [join(APP, "node_modules/vitest/vitest.mjs"), "run", ...tests, "--bail=1", "--reporter=default"]
      : [join(APP, "node_modules/@playwright/test/cli.js"), "test", ...tests, "--max-failures=1", "--reporter=line"];
  const r = spawnSync(process.execPath, args, { cwd: APP, env: childEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: kind === "unit" ? 240_000 : 420_000 });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const ranSomething = kind === "unit" ? /Tests\s+.*\b(passed|failed)\b/.test(out) : /\b\d+ (passed|failed)\b/.test(out);
  const sawFailure = kind === "unit" ? /Tests\s+.*\bfailed\b/.test(out) || /Test Files\s+.*\bfailed\b/.test(out) : /\b\d+ failed\b/.test(out);
  return { status: r.status, verdict: !ranSomething ? "INCONCLUSIVE" : r.status !== 0 && sawFailure ? "KILLED" : r.status === 0 ? "SURVIVED" : "INCONCLUSIVE", tail: out.trim().split("\n").slice(-6).join("\n") };
}


/** --dry: does every find-text still match exactly as often as the mutant says? Writes nothing. */
function dryCheck(mutant) {
  for (const e of mutant.edits) {
    const text = readFileSync(abs(e.file), "utf8");
    const find = text.includes("\r\n") ? e.find.replace(/\n/g, "\r\n") : e.find;
    const n = text.split(find).length - 1;
    if (n !== (e.count ?? 1)) return `${e.file}: ${n} match(es), expected ${e.count ?? 1}`;
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--list")) {
  for (const m of MUTANTS) console.log(`${m.kind.padEnd(5)} ${m.id}`);
  process.exit(0);
}
if (argv.includes("--dry")) {
  let bad = 0;
  for (const m of MUTANTS) {
    const problem = dryCheck(m);
    if (problem) { bad++; console.log("BAD   " + m.id + ": " + problem); }
  }
  console.log(`${MUTANTS.length - bad} of ${MUTANTS.length} mutants match the sources`);
  process.exit(bad ? 1 : 0);
}
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const wantUnit = argv.includes("--unit") || !argv.includes("--e2e");
const wantE2e = argv.includes("--e2e") || !argv.includes("--unit");
const chosen = MUTANTS.filter((m) => (only ? only.includes(m.id) : (m.kind === "unit" ? wantUnit : wantE2e)));

mkdirSync(RECOVERY, { recursive: true });
heal();
const before = treeHash();
console.log(`tree hash before: ${before.slice(0, 16)}`);

// controls: the unmutated suites must be green, or "killed" would mean nothing
const controls = [...new Set(chosen.map((m) => `${m.kind}:${m.tests.join(",")}`))];
for (const c of controls) {
  const [kind, tests] = [c.slice(0, c.indexOf(":")), c.slice(c.indexOf(":") + 1).split(",")];
  const r = runTests(kind, tests);
  console.log(`control ${kind} ${tests.join(" ")}: ${r.verdict === "SURVIVED" ? "green" : "NOT GREEN (" + r.verdict + ")"}`);
  if (r.verdict !== "SURVIVED") {
    console.log(r.tail);
    process.exit(2);
  }
}

const results = [];
try {
  for (const m of chosen) {
    const bad = apply(m);
    let res;
    if (bad) res = { verdict: "INCONCLUSIVE", tail: bad };
    else {
      try {
        res = runTests(m.kind, m.tests);
      } finally {
        restore();
      }
    }
    results.push({ id: m.id, kind: m.kind, equivalent: !!m.equivalent, verdict: res.verdict });
    console.log(`${res.verdict.padEnd(12)} ${m.kind.padEnd(5)} ${m.id}${m.equivalent ? "  (expected to survive)" : ""}${res.verdict === "INCONCLUSIVE" ? "\n" + res.tail : ""}`);
  }
} finally {
  restore();
}

// the e2e runs rebuild public/ (generated, gitignored) from whatever was mutated at the time: rebuild it from the restored sources
if (chosen.some((m) => m.kind === "e2e")) spawnSync(process.execPath, [join(APP, "scripts/build-frontend.js")], { cwd: APP, stdio: "ignore" });

const after = treeHash();
const killed = results.filter((r) => r.verdict === "KILLED").length;
const survived = results.filter((r) => r.verdict === "SURVIVED" && !r.equivalent);
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE");
console.log(`\ntree hash after:  ${after.slice(0, 16)} ${after === before ? "(identical: every file restored byte for byte)" : "(DIFFERENT: SOMETHING IS LEFT MUTATED)"}`);
console.log(`${killed} killed, ${survived.length} survived${survived.length ? " (" + survived.map((r) => r.id).join(", ") + ")" : ""}, ${inconclusive.length} inconclusive, ${results.filter((r) => r.equivalent && r.verdict === "SURVIVED").length} expected survivor(s)`);
process.exit(after !== before || survived.length || inconclusive.length ? 1 : 0);
