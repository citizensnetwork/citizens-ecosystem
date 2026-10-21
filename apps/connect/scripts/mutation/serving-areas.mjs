// ════════════════════════════════════════════════════════════════════
//  Mutation check for serving areas (issue #259): does the test suite notice when the feature is quietly broken?
//  ------------------------------------------------------------------
//  Each mutant changes ONE thing in ONE source file (a tick that travels upward, a cap that is gone, a rate limit that is
//  dropped, a grant opened ...), runs the narrowest tests that should catch it, and records KILLED (a test failed) or
//  SURVIVED (everything still passed: a hole in the tests, or an equivalent mutant noted as such).
//
//  Same engine and the same SELF-HEALING as convince.mjs, because killing a run half way (taskkill /F cannot be
//  trapped) must never leave the tree mutated:
//    1. before each mutation the original is copied to <repo>/.claude/sessions/serving-mutation-recovery/ and a manifest
//       names it; the copy is deleted only after the file has been restored;
//    2. on start the harness restores anything the manifest still names (a previous run that was killed);
//    3. a hash of `git diff HEAD` plus every untracked file is taken before and after, and the run fails loudly if it moved.
//  A run that executes no test at all is INCONCLUSIVE, never "survived".
//
//  The database rules themselves (the selection rule, the approval wall, grants) are proven by the rollback-only probe
//  docs/audit/probes/195_service_areas.probe.sql; the SQL mutants here only check that the STATIC twin test and the
//  probe text keep pinning them. The probe was also mutation-tested against a scratch Postgres (see the PR).
//
//  Usage (from apps/connect):  node scripts/mutation/serving-areas.mjs [--only <id,id>] [--unit] [--e2e] [--list]
//  The e2e mutants (added with the globe, PR C) start Playwright's own dev server on port 3100: stop any other server there.
// ════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");
const RECOVERY = join(REPO, ".claude", "sessions", "serving-mutation-recovery");
const MANIFEST = join(RECOVERY, "manifest.json");

const T_LIB = ["src/__tests__/lib/serviceAreas.test.ts"];
const T_INDEX = ["src/__tests__/api/v1/service-areas.test.ts"];
const T_SERVING = ["src/__tests__/api/v1/serving.test.ts"];
const T_OWNER = ["src/__tests__/api/contributor/service-areas.test.ts"];
const T_SQL = ["src/__tests__/security/service-areas-migration.test.ts"];

const LIB = "src/lib/serviceAreas.ts";
const INDEX = "src/app/api/v1/service-areas/route.ts";
const SERVING = "src/app/api/v1/serving/route.ts";
const OWNER = "src/app/api/contributor/service-areas/route.ts";
const SQL = "../../supabase/migrations/195_service_areas.sql";
const PROBE = "../../docs/audit/probes/195_service_areas.probe.sql";

// edits: [{ file, find, replace, count = 1 }]. `equivalent` marks a mutant that SHOULD survive (a second layer covers it).
const MUTANTS = [
  // ── the shared rules
  { id: "lib-radius-cap", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "b.radius_km < 1 || b.radius_km > MAX_RADIUS_KM", replace: "b.radius_km < 1" }] },
  { id: "lib-radius-integer", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "!Number.isInteger(b.radius_km) || ", replace: "" }] },
  { id: "lib-too-many", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'if (b.area_ids.length > MAX_SERVICE_AREAS) return { ok: false, error: "too_many_areas" };', replace: "" }] },
  { id: "lib-area-uuid", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'typeof id !== "string" || !isValidUUID(id)', replace: 'typeof id !== "string"' }] },
  { id: "lib-contributor-uuid", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'typeof b.contributor_id !== "string" || !isValidUUID(b.contributor_id)', replace: 'typeof b.contributor_id !== "string"' }] },
  { id: "lib-centre-without-radius", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: 'if (radiusKm === null && radiusCentreAreaId !== null) return { ok: false, error: "radius_centre_without_radius" };', replace: "" }] },
  { id: "lib-dedupe", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "areaIds: [...seen]", replace: "areaIds: (b.area_ids as string[])" }] },
  { id: "lib-main-grouping", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "LEVEL_RANK[a.served.level] - LEVEL_RANK[b.served.level] || byName(a, b)", replace: "byName(a, b)" }] },
  { id: "lib-main-name-order", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "LEVEL_RANK[a.served.level] - LEVEL_RANK[b.served.level] || byName(a, b)", replace: "LEVEL_RANK[a.served.level] - LEVEL_RANK[b.served.level]" }] },
  { id: "lib-also-distance-order", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "a.distance_km - b.distance_km || byName(a, b)", replace: "byName(a, b)" }] },
  { id: "lib-also-cap", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "also_served_by: also.slice(0, ALSO_SERVED_LIMIT)", replace: "also_served_by: also" }] },
  { id: "lib-allowlist", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "const base: ServingContributor = {", replace: "const base: ServingContributor = { ...(r as unknown as ServingContributor)," }] },
  { id: "lib-main-dedupe", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "if (seenMain.has(base.id)) continue;", replace: "" }] },
  { id: "lib-nameless", kind: "unit", tests: T_LIB, edits: [{ file: LIB, find: "if (!base.name) continue;", replace: "" }] },
  { id: "lib-refusal-401", kind: "unit", tests: T_OWNER, edits: [{ file: LIB, find: 'not_allowed: { status: 403, error: "Forbidden" },', replace: 'not_allowed: { status: 200, error: "Forbidden" },' }] },
  // ── the public reads
  { id: "serving-area-cap-dropped", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: '{ bucket: "v1-serving", resourceId: areaId }', replace: '{ bucket: "v1-serving" }' }] },
  { id: "serving-limit-raised", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: "p_also_limit: ALSO_SERVED_LIMIT", replace: "p_also_limit: 50" }] },
  { id: "serving-uuid-unchecked", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: "if (!isValidUUID(area)) {", replace: "if (false) {" }] },
  { id: "serving-404-lost", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: "if (!row || !isServiceAreaLevel(row.level)) {", replace: "if (false) {" }] },
  { id: "serving-cache-too-long", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: "s-maxage=60", replace: "s-maxage=86400" }] },
  { id: "serving-error-leak", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: 'return NextResponse.json({ error: "Failed to load the serving list" }, { status: 500 });', replace: "return NextResponse.json({ error: String(areaRes.error?.message ?? listRes.error?.message) }, { status: 500 });" }] },
  { id: "serving-skips-gate", kind: "unit", tests: T_SERVING, edits: [{ file: SERVING, find: "if (gate.deny) return gate.deny;", replace: "" }] },
  { id: "index-default-levels", kind: "unit", tests: T_INDEX, edits: [{ file: INDEX, find: 'else if (!parent) query = query.in("level", ["province", "place"]);', replace: "" }] },
  { id: "index-parent-unchecked", kind: "unit", tests: T_INDEX, edits: [{ file: INDEX, find: "if (parent !== null && !isValidUUID(parent)) {", replace: "if (false) {" }] },
  { id: "index-level-unchecked", kind: "unit", tests: T_INDEX, edits: [{ file: INDEX, find: "if (level !== null && !isServiceAreaLevel(level)) {", replace: "if (false) {" }] },
  { id: "index-no-cache", kind: "unit", tests: T_INDEX, edits: [{ file: INDEX, find: "s-maxage=3600", replace: "s-maxage=0" }] },
  { id: "index-skips-gate", kind: "unit", tests: T_INDEX, edits: [{ file: INDEX, find: "if (gate.deny) return gate.deny;", replace: "" }] },
  { id: "index-limit-unclamped", kind: "unit", tests: T_INDEX, edits: [{ file: INDEX, find: "const MAX_LIMIT = 1000;", replace: "const MAX_LIMIT = 10000000;" }] },
  // ── the owner's route
  { id: "owner-put-no-rate-limit", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "  const rl = await checkRateLimit(`service-areas-write:${user.id}`, RATE_LIMITS.mutation);\n  if (!rl.success) return tooMany(rl.resetMs);\n", replace: "" }] },
  { id: "owner-put-ignores-contributor-id", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "const contributorId = parsed.contributorId ?? user.id;", replace: "const contributorId = user.id;" }] },
  { id: "owner-put-unauthenticated", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "export async function PUT(request: NextRequest) {\n  const { supabase, user } = await getRouteAuth(request);\n  if (!user) return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });", replace: "export async function PUT(request: NextRequest) {\n  const { supabase, user: u } = await getRouteAuth(request);\n  const user = u ?? { id: \"00000000-0000-4000-8000-000000000000\" };" }] },
  { id: "owner-put-skips-validation", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });", replace: "if (!parsed.ok) { /* continues */ }" }] },
  { id: "owner-put-error-leak", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: 'return NextResponse.json({ error: "save_failed" }, { status: 500 });', replace: "return NextResponse.json({ error: error.message }, { status: 500 });" }] },
  { id: "owner-put-radius-dropped", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "p_radius_km: selection.radiusKm,", replace: "p_radius_km: null," }] },
  { id: "owner-get-unauthenticated", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "export async function GET(request: NextRequest) {\n  const { supabase, user } = await getRouteAuth(request);\n  if (!user) return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });", replace: "export async function GET(request: NextRequest) {\n  const { supabase, user: u } = await getRouteAuth(request);\n  const user = u ?? { id: \"00000000-0000-4000-8000-000000000000\" };" }] },
  { id: "owner-get-default-contributor", kind: "unit", tests: T_OWNER, edits: [{ file: OWNER, find: "(asked ?? user.id).toLowerCase()", replace: "(asked ?? OTHER_PLACEHOLDER).toLowerCase()" }, { file: OWNER, find: "export const runtime", replace: 'const OTHER_PLACEHOLDER = "00000000-0000-4000-8000-000000000000";\nexport const runtime' }] },
  // ── the SQL file and its probe (static twin)
  { id: "sql-upward-walk-reversed", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "join chain c on a.id = c.parent_id", replace: "join chain c on a.parent_id = c.id" }] },
  { id: "sql-pinned-in-main", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "where not l.has_pin", replace: "where true" }] },
  { id: "sql-no-jwt-guard", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "  if v_uid is null then\n    return jsonb_build_object('success', false, 'reason', 'not_authenticated');\n  end if;\n", replace: "" }] },
  { id: "sql-anon-may-write", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "to authenticated;\n\n-- ── 4.", replace: "to authenticated, anon;\n\n-- ── 4." }] },
  { id: "sql-insert-grant", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "grant select on public.contributor_service_areas to anon, authenticated;", replace: "grant select, insert on public.contributor_service_areas to anon, authenticated;" }] },
  { id: "sql-radius-cap-in-table", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "check (radius_km between 1 and 100)", replace: "check (radius_km between 1 and 1000)" }] },
  { id: "sql-popularity-order", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "order by x.d, x.full_name, x.id", replace: "order by x.radius_km desc, x.id" }] },
  { id: "sql-read-function-definer", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "language sql\nstable\nsecurity invoker", replace: "language sql\nstable\nsecurity definer" }] },
  { id: "sql-wall-dropped-in-read", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "       and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null\n  ),\n  main as", replace: "  ),\n  main as" }] },
  { id: "sql-parent-lookup-in-rpc", kind: "unit", tests: T_SQL, edits: [{ file: SQL, find: "select p_contributor_id, x from unnest(v_ids) as x", replace: "select p_contributor_id, x from unnest(v_ids || (select array_agg(a.parent_id) from public.service_areas a where a.id = any (v_ids))) as x" }] },
  { id: "probe-loses-truncate-check", kind: "unit", tests: T_SQL, edits: [{ file: PROBE, find: "PASS TRUNCATE is refused", replace: "PASS truncate blocked" }] },
  { id: "probe-loses-upward-check", kind: "unit", tests: T_SQL, edits: [{ file: PROBE, find: "(never upward)", replace: "(ok)" }] },
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
