// ════════════════════════════════════════════════════════════════════
//  Mutation check for the Convince entry point (FEAT-04): does the test suite notice when the feature is quietly broken?
//  ------------------------------------------------------------------
//  Each mutant changes ONE thing in ONE source file (the wrong function name, a dropped guard, a reason leaked into the
//  refusal sentence, the privacy switch ignored ...), runs the narrowest tests that should catch it, and records KILLED
//  (a test failed) or SURVIVED (everything still passed: a hole in the tests, or an equivalent mutant noted as such).
//
//  SELF-HEALING, because killing a run half way (taskkill /F cannot be trapped) must never leave the tree mutated:
//    1. before each mutation the original is copied to <repo>/.claude/sessions/convince-mutation-recovery/ and a manifest
//       names it; the copy is deleted only after the file has been restored;
//    2. on start the harness restores anything the manifest still names (a previous run that was killed);
//    3. a hash of `git diff HEAD` plus every untracked file is taken before and after, and the run fails loudly if it moved.
//  A run that executes no test at all is INCONCLUSIVE, never "survived".
//
//  Usage (from apps/connect):  node scripts/mutation/convince.mjs [--only <id,id>] [--unit] [--e2e] [--list]
//  The e2e mutants start Playwright's own dev server on port 3100: stop any other server on that port first.
// ════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");
const RECOVERY = join(REPO, ".claude", "sessions", "convince-mutation-recovery");
const MANIFEST = join(RECOVERY, "manifest.json");

const UNIT_LIB = ["src/__tests__/frontend/convinceLib.test.ts", "src/__tests__/frontend/convinceRow.test.tsx"];
const UNIT_ROW = ["src/__tests__/frontend/convinceRow.test.tsx"];
const UNIT_SQL = ["src/__tests__/security/friends-considering-proposal.test.ts"];
const UNIT_ROUTE = ["src/__tests__/api/notifications/preferences/route.test.ts", "src/__tests__/security/friends-considering-proposal.test.ts"];
const E2E = ["e2e/convince.spec.ts"];

const LIB = "src/frontend/app/convince-lib.jsx";
const ROW = "src/frontend/app/convince.jsx";
const PROFILES = "src/frontend/app/profiles.jsx";
const PAGES = "src/frontend/app/pages.jsx";
const CARD = "src/frontend/app/entity-card.jsx";
const ROUTE = "src/app/api/notifications/preferences/route.ts";
const TYPES = "src/types/db.ts";
const SQL = "../../docs/proposals/friends-considering.sql";
const PROBE = "../../docs/audit/probes/friends_considering.probe.sql";

// edits: [{ file, find, replace, count = 1 }]. `equivalent` marks a mutant that SHOULD survive (a second layer covers it).
const MUTANTS = [
  // ── the data side
  { id: "lib-arg-name", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "{ p_event: eventId }", replace: "{ p_event_id: eventId }" }] },
  { id: "lib-fn-name", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "sb.rpc('friends_considering_event'", replace: "sb.rpc('friends_considering_events'" }] },
  { id: "lib-cap", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: ".slice(0, MAX_FRIENDS)", replace: ".slice(0, 1000)" }] },
  { id: "lib-name-trim", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "typeof r.full_name === 'string' ? r.full_name.trim() : ''", replace: "typeof r.full_name === 'string' ? r.full_name : ''" }] },
  { id: "lib-id-filter", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: ".filter((r) => r && typeof r.id === 'string' && UUID_RE.test(r.id))", replace: ".filter((r) => r)" }] },
  { id: "lib-avatar-scheme", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "typeof r.avatar_url === 'string' && /^https?:\\/\\//i.test(r.avatar_url) ? r.avatar_url : ''", replace: "typeof r.avatar_url === 'string' ? r.avatar_url : ''" }] },
  { id: "lib-nudged-truthy", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "nudged: r.nudged === true,", replace: "nudged: !!r.nudged," }] },
  { id: "lib-event-guard", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "if (!sb || typeof eventId !== 'string' || !UUID_RE.test(eventId)) return { ok: false, friends: [] };", replace: "if (!sb) return { ok: false, friends: [] };" }] },
  { id: "lib-post-method", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "call(fetcher, 'POST', eventId, toUserId)", replace: "call(fetcher, 'PUT', eventId, toUserId)" }] },
  { id: "lib-delete-method", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "call(fetcher, 'DELETE', eventId, toUserId)", replace: "call(fetcher, 'POST', eventId, toUserId)" }] },
  { id: "lib-409-is-error", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "if (res.status === 409) return { ok: true, state: 'already' };", replace: "if (res.status === 409) return { ok: false, reason: 'error', message: GENERIC };" }] },
  { id: "lib-403-leaks-reason", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "refused: 'That nudge cannot be sent right now.',", replace: "refused: 'That friend has hidden this from you.'," }] },
  { id: "lib-429-dropped", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "    if (res.status === 429) return { ok: false, reason: 'rate_limited', message: COPY.slowDown };\n    if (res.status === 401) return { ok: false, reason: 'signed_out', message: COPY.signIn };\n    return { ok: false, reason: 'error', message: GENERIC };\n  }\n\n  /** Withdraw", replace: "    if (res.status === 401) return { ok: false, reason: 'signed_out', message: COPY.signIn };\n    return { ok: false, reason: 'error', message: GENERIC };\n  }\n\n  /** Withdraw" }] },
  { id: "lib-someone", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "senderName.trim() : 'Someone'", replace: "senderName.trim() : 'A friend'" }] },
  { id: "lib-cancelled-ok", kind: "unit", tests: UNIT_LIB, edits: [{ file: LIB, find: "if (ev.status === 'cancelled') return false;", replace: "" }] },
  // ── the screen
  { id: "row-mark-wrong", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "mark(f.id, true);", replace: "mark(f.id, false);" }] },
  { id: "row-no-refresh-on-403", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "if (r.reason === 'refused') load();", replace: "" }] },
  { id: "row-toast-kind", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "toast(r.message, r.reason === 'rate_limited' ? 'gold' : 'red');", replace: "toast(r.message, 'red');" }] },
  { id: "row-stale-answer", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "if (mine === seq.current) setFriends(r.friends);", replace: "setFriends(r.friends);" }] },
  { id: "row-empty-box", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "if (!sb || !me || friends.length === 0) return null;", replace: "if (!sb || !me) return null;" }] },
  { id: "row-note-ignores-switch", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "if (!shared) return null;", replace: "" }] },
  { id: "row-preview-name", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "C.previewLine(myName, eventTitle)", replace: "C.previewLine('', eventTitle)" }] },
  { id: "row-aria-label", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "'Nudge ' + name + ' to go to ' + (eventTitle || 'this event')", replace: "'Nudge'" }] },
  { id: "row-double-tap", kind: "unit", tests: UNIT_ROW, edits: [{ file: ROW, find: "disabled: !!busy", replace: "disabled: false", count: 2 }, { file: ROW, find: "if (busy) return;", replace: "", count: 2 }] },
  { id: "row-guard-only (equivalent: the disabled button is the second layer)", kind: "unit", tests: UNIT_ROW, equivalent: true, edits: [{ file: ROW, find: "if (busy) return;", replace: "", count: 2 }] },
  // ── the wiring on the pages (real browser)
  { id: "page-demo-gets-the-row", kind: "e2e", tests: E2E, edits: [{ file: PROFILES, find: "const nudgeable = !!realUser && window.CCConvince.eligibleEvent(ev);", replace: "const nudgeable = window.CCConvince.eligibleEvent(ev);" }] },
  { id: "page-note-logic-inverted", kind: "e2e", tests: E2E, edits: [{ file: PROFILES, find: "share_considering === false);", replace: "share_considering === true);" }] },
  { id: "page-title-lost", kind: "e2e", tests: E2E, edits: [{ file: PROFILES, find: "eventTitle: ev.title,", replace: "eventTitle: '',"}] },
  { id: "settings-wrong-key", kind: "e2e", tests: E2E, edits: [{ file: PAGES, find: "toggleNotif('share_considering', v)", replace: "toggleNotif('share_consider', v)" }] },
  { id: "sheet-row-removed", kind: "e2e", tests: E2E, edits: [{ file: CARD, find: "const convince = isSheet && isEvent && realUser &&", replace: "const convince = false && isEvent && realUser &&" }] },
  // ── the API route and the types
  { id: "route-key-dropped", kind: "unit", tests: UNIT_ROUTE, edits: [{ file: ROUTE, find: '  "share_considering",\n', replace: "" }] },
  { id: "types-key-dropped", kind: "unit", tests: UNIT_ROUTE, edits: [{ file: TYPES, find: '  | "share_considering";', replace: ";" }] },
  // ── the SQL proposal (static twin) and the probe that must run its text
  { id: "sql-switch-ignored", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: " or pr.notification_prefs->>'share_considering' = 'false'", replace: "" }] },
  { id: "sql-switch-boolean-cast", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "pr.notification_prefs->>'share_considering' = 'false'", replace: "(pr.notification_prefs->>'share_considering')::boolean = false" }] },
  { id: "sql-key-not-allowed", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "    'weekly_digest',\n    'share_considering'\n  ];", replace: "    'weekly_digest'\n  ];" }] },
  { id: "sql-no-cap", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "   limit 50;", replace: "   limit 5000;" }] },
  { id: "sql-popularity-order", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "order by lower(p.full_name), p.id", replace: "order by r.created_at desc" }] },
  { id: "sql-nudged-column-lost", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "returns table (id uuid, full_name text, avatar_url text, nudged boolean)", replace: "returns table (id uuid, full_name text, avatar_url text)" }] },
  { id: "sql-anon-can-read", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "to authenticated, service_role;\ncomment on function public.friends_considering_event", replace: "to authenticated, service_role, anon;\ncomment on function public.friends_considering_event" }] },
  { id: "sql-reader-skips-helper", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "     and public.is_considering_for_friend(r.user_id, p_event)\n", replace: "" }] },
  { id: "sql-nameless-sender", kind: "unit", tests: UNIT_SQL, edits: [{ file: SQL, find: "select coalesce(nullif(btrim(full_name), ''), 'Someone')", replace: "select coalesce(full_name, 'Someone')" }] },
  { id: "probe-drifts-from-proposal", kind: "unit", tests: UNIT_SQL, edits: [{ file: PROBE, find: "   limit 50;", replace: "   limit 51;" }] },
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

// ── main ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--list")) {
  for (const m of MUTANTS) console.log(`${m.kind.padEnd(5)} ${m.id}`);
  process.exit(0);
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
