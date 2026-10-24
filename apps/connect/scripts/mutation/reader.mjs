// ════════════════════════════════════════════════════════════════════
//  Mutation check for the Reader (Listing Automation Phase 2): does the test suite notice when a safety
//  rule is quietly broken?
//  ------------------------------------------------------------------
//  Each mutant changes ONE thing in ONE source file (the scope check dropped, robots.txt ignored, a private
//  address allowed, a past event let through, the dry run posting, a key sent to the wrong route ...), runs the
//  narrowest tests that should catch it, and records KILLED (a test failed) or SURVIVED (everything still passed:
//  a hole in the tests, or an equivalent mutant noted as such).
//
//  SELF-HEALING, because killing a run half way (taskkill /F cannot be trapped) must never leave the tree mutated:
//    1. before each mutation the original is copied to <repo>/.claude/sessions/reader-mutation-recovery/ and a
//       manifest names it; the copy is deleted only after the file has been restored;
//    2. on start the harness restores anything the manifest still names (a previous run that was killed);
//    3. a hash of `git diff HEAD` plus every untracked file is taken before and after, and the run fails loudly
//       if it moved.
//  A run that executes no test at all is INCONCLUSIVE, never "survived".
//
//  Usage (from apps/connect):  node scripts/mutation/reader.mjs [--only <id,id>] [--list]
// ════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");
const RECOVERY = join(REPO, ".claude", "sessions", "reader-mutation-recovery");
const MANIFEST = join(RECOVERY, "manifest.json");

const T = "src/__tests__/";
const SOURCES_ROUTE = [`${T}api/automation/sources.test.ts`, `${T}lib/automation/dueSources.test.ts`];
const ELIGIBILITY = [...SOURCES_ROUTE, `${T}api/automation/suggestions.test.ts`];
const NET = [`${T}reader/net.test.ts`];
const ROBOTS = [`${T}reader/parsers.test.ts`, `${T}reader/net.test.ts`];
const SOURCE = [`${T}reader/source.test.ts`];
const PARSERS = [`${T}reader/parsers.test.ts`, `${T}reader/source.test.ts`];
const RUN = [`${T}reader/run.test.ts`];
const WORKFLOW = [`${T}security/readerWorkflow.test.ts`];

const ROUTE = "src/app/api/automation/sources/route.ts";
const DUE = "src/lib/automation/dueSources.ts";
const S = "scripts/reader/";
const WF = "../../.github/workflows/reader.yml";

// edits: [{ file, find, replace, count = 1 }]. `equivalent` marks a mutant that SHOULD survive (a second layer covers it).
// The two equivalent mutants are covered by a second layer: contributorEligibility re-checks every profile the database
// query returns, and pickDueSources re-checks kind and enabled for every row the scan returns.
const MUTANTS = [
  // ── the read route: who may call it, who may be read
  { id: "route-no-scope", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: '  if (!hasScope(gate.key, SUGGEST_SCOPE)) return json({ error: "forbidden" }, 403);\n', replace: "" }] },
  { id: "route-no-key", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: '  if (!gate.key) return json({ error: "unauthorized" }, 401);\n', replace: "" }] },
  { id: "route-scope-is-digest", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: 'const SUGGEST_SCOPE = "automation:suggest";', replace: 'const SUGGEST_SCOPE = "automation:digest";' }] },
  { id: "route-level-off-included", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: '.in("auto_update_level", ["suggest", "events_auto"])', replace: '.in("auto_update_level", ["off", "suggest", "events_auto"])' }], equivalent: true },
  { id: "route-eligibility-dropped", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: 'if ("level" in contributorEligibility(p)) eligible.add(p.id);', replace: "eligible.add(p.id);" }] },
  { id: "route-kind-filter", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: '.in("kind", [...READABLE_SOURCE_KINDS])', replace: '.in("kind", ["website", "youtube", "calendar", "facebook", "instagram", "tiktok"])' }], equivalent: true },
  { id: "route-no-store", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: '{ status, headers: { "Cache-Control": "no-store" } }', replace: "{ status }" }] },
  { id: "route-writes", tests: SOURCES_ROUTE, edits: [{ file: ROUTE, find: '  const sources = pickDueSources(rows, eligible, now);\n', replace: '  const sources = pickDueSources(rows, eligible, now);\n  await admin.from("listing_sources").update({ last_checked_at: now.toISOString() }).eq("enabled", true);\n' }] },
  // ── the pure rules
  { id: "due-always", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: "return now.getTime() - t > SOURCE_DUE_AFTER_HOURS * 3_600_000;", replace: "return true;" }] },
  { id: "due-no-cap", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: "picked.slice(0, Math.max(0, cap))", replace: "picked" }] },
  { id: "due-order-reversed", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: "a.checked < b.checked ? -1 : 1", replace: "a.checked < b.checked ? 1 : -1" }] },
  { id: "due-kinds-open", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: 'if (!row.enabled || !(READABLE_SOURCE_KINDS as readonly string[]).includes(row.kind)) continue;', replace: "if (!row.enabled) continue;" }] },
  { id: "due-disabled-listed", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: 'if (!row.enabled || !(READABLE_SOURCE_KINDS as readonly string[]).includes(row.kind)) continue;', replace: 'if (!(READABLE_SOURCE_KINDS as readonly string[]).includes(row.kind)) continue;' }] },
  { id: "due-ineligible-listed", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: "    if (!eligibleContributors.has(row.contributor_id)) continue;\n", replace: "" }] },
  { id: "due-http-listed", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: "    const url = httpsUrlOrNull(row.url);\n    if (!url) continue;\n", replace: "    const url = row.url;\n" }] },
  { id: "due-leaks-a-field", tests: SOURCES_ROUTE, edits: [{ file: DUE, find: "    url,\n    last_status: row.last_status,", replace: "    url,\n    enabled: row.enabled,\n    last_status: row.last_status," }] },
  { id: "eligible-hidden-ok", tests: ELIGIBILITY, edits: [{ file: DUE, find: 'p.contributor_status !== "approved" || p.contributor_hidden || p.deleted_at', replace: 'p.contributor_status !== "approved" || p.deleted_at' }] },
  { id: "eligible-unapproved-ok", tests: ELIGIBILITY, edits: [{ file: DUE, find: 'p.contributor_status !== "approved" || p.contributor_hidden', replace: "p.contributor_hidden" }] },
  { id: "eligible-off-ok", tests: ELIGIBILITY, edits: [{ file: DUE, find: '|| p.auto_update_level === "off") return { reason: "consent_off" };', replace: ") return { reason: \"consent_off\" };" }] },
  // ── the polite fetcher
  { id: "net-http-allowed", tests: NET, edits: [{ file: `${S}net.mjs`, find: 'if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) {\n      return { reason:', replace: 'if (u.username || u.password || (u.port && u.port !== "443")) {\n      return { reason:' }, { file: `${S}net.mjs`, find: 'if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) {\n      return { ok: false,', replace: 'if (u.username || u.password || (u.port && u.port !== "443")) {\n      return { ok: false,' }] },
  { id: "net-private-address-ok", tests: NET, edits: [{ file: `${S}net.mjs`, find: "if (!addresses.length || addresses.some((x) => isPrivateAddress(x.address))) verdict", replace: "if (!addresses.length) verdict" }] },
  { id: "net-ip-literal-ok", tests: NET, edits: [{ file: `${S}net.mjs`, find: "if (isIP(h) !== 0 || h.startsWith(\"[\")) return false;", replace: "" }] },
  { id: "net-never-read-off", tests: NET, edits: [{ file: `${S}net.mjs`, find: "if (isNeverReadHost(hostname)) {", replace: "if (false) {" }] },
  { id: "net-metadata-range", tests: NET, edits: [{ file: `${S}net.mjs`, find: "if (p === 169 && q === 254) return true; // link local, cloud metadata", replace: "" }] },
  { id: "net-robots-ignored", tests: NET, edits: [{ file: `${S}net.mjs`, find: "isAllowed(robots, u.pathname + u.search)", replace: "true" }] },
  { id: "net-robots-query-ignored", tests: NET, edits: [{ file: `${S}net.mjs`, find: "isAllowed(robots, u.pathname + u.search)", replace: "isAllowed(robots, u.pathname)" }] },
  { id: "net-robots-error-means-allow", tests: NET, edits: [{ file: `${S}net.mjs`, find: '        return { blocked: "robots.txt unavailable" };', replace: "        return { rules: [] };" }] },
  { id: "net-robots-404-means-block", tests: NET, edits: [{ file: `${S}net.mjs`, find: "if (r.status && r.status >= 400 && r.status < 500 && r.status !== 429) return { rules: [] };", replace: "" }] },
  { id: "net-no-throttle", tests: NET, edits: [{ file: `${S}net.mjs`, find: "minGapMs: 1000,", replace: "minGapMs: 0," }] },
  { id: "net-redirects-unlimited", tests: NET, edits: [{ file: `${S}net.mjs`, find: "maxRedirects: 3,", replace: "maxRedirects: 30," }] },
  { id: "net-redirect-to-http", tests: NET, edits: [{ file: `${S}net.mjs`, find: '        if (next.protocol !== "https:") return { ok: false, reason: "redirected to a non-https address" };\n', replace: "" }] },
  { id: "net-redirect-skips-robots", tests: NET, edits: [{ file: `${S}net.mjs`, find: "      if (checkRobots) {\n        const verdict = await hostCheckedRobots(current);\n        if (!verdict.ok) return verdict;\n      }", replace: "      if (checkRobots && redirects === 0) {\n        const verdict = await hostCheckedRobots(current);\n        if (!verdict.ok) return verdict;\n      }" }] },
  { id: "net-body-uncapped", tests: NET, edits: [{ file: `${S}net.mjs`, find: "if (size > limit) {", replace: "if (size > limit * 1000) {" }] },
  { id: "net-sends-credentials", tests: NET, edits: [{ file: `${S}net.mjs`, find: 'credentials: "omit",', replace: 'credentials: "include",' }] },
  { id: "net-follows-redirects-itself", tests: NET, edits: [{ file: `${S}net.mjs`, find: 'redirect: "manual",', replace: 'redirect: "follow",' }] },
  { id: "net-dishonest-user-agent", tests: NET, edits: [{ file: `${S}net.mjs`, find: 'export const USER_AGENT = "CitizensConnectReader/1.0 (+https://www.citizenscentral.co.za)";', replace: 'export const USER_AGENT = "Mozilla/5.0";' }] },
  // ── robots.txt rules
  { id: "robots-shortest-wins", tests: ROBOTS, edits: [{ file: `${S}robots.mjs`, find: "rule.pattern.length > best.pattern.length ||", replace: "rule.pattern.length < best.pattern.length ||" }] },
  { id: "robots-named-group-ignored", tests: ROBOTS, edits: [{ file: `${S}robots.mjs`, find: "const chosen = named.length ? named :", replace: "const chosen = false ? named :" }] },
  { id: "robots-empty-disallow-blocks", tests: ROBOTS, edits: [{ file: `${S}robots.mjs`, find: '      if (value === "") continue; // "Disallow:" with nothing means allow everything\n', replace: "" }] },
  { id: "robots-allow-loses-ties", tests: ROBOTS, edits: [{ file: `${S}robots.mjs`, find: "(rule.pattern.length === best.pattern.length && rule.allow && !best.allow)", replace: "(rule.pattern.length === best.pattern.length && !rule.allow && best.allow)" }] },
  // ── what is read and kept
  { id: "source-past-events-kept", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "if (e.startMs > nowMs && e.startMs <= nowMs + LIMITS.singleDays * DAY_MS) acc.events.push", replace: "if (e.startMs <= nowMs + LIMITS.singleDays * DAY_MS) acc.events.push" }] },
  { id: "source-old-news-kept", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "item.publishedMs < nowMs - LIMITS.newsDays * DAY_MS", replace: "false" }] },
  { id: "source-no-cap", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: ".slice(0, LIMITS.maxItems - newsRoom)", replace: ".slice(0, 1000)" }] },
  { id: "source-no-news-room", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "const newsRoom = Math.min(news.length, LIMITS.reservedForNews);", replace: "const newsRoom = 0;" }] },
  { id: "source-reads-any-kind", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: '    if (!READABLE_KINDS.has(source.kind)) return done([], "not readable");\n', replace: "" }] },
  { id: "source-youtube-skips-robots-probe", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "  if (!allowed.ok) return allowed.reason;\n", replace: "" }] },
  { id: "source-youtube-any-host", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: '|| !YOUTUBE_HOSTS.has(u.hostname.toLowerCase())) return "not a YouTube address";', replace: '|| false) return "not a YouTube address";' }] },
  { id: "source-no-scrub", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "  return scrubPersonalContact(shaped);", replace: "  return shaped;" }] },
  { id: "source-duplicates-kept", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "        if (seen.has(key)) return false;", replace: "        if (false) return false;" }] },
  { id: "source-category-guessed", tests: SOURCE, edits: [{ file: `${S}source.mjs`, find: "      location: clean(e.location, 300),\n      website_url: e.url,", replace: '      location: clean(e.location, 300),\n      category: "outreach-missions",\n      website_url: e.url,' }] },
  { id: "source-follows-feeds-anywhere", tests: PARSERS, edits: [{ file: `${S}html.mjs`, find: "    if (sameSiteOnly && !sameSite(url, pageUrl)) continue;\n", replace: "" }] },
  { id: "source-comments-feed-read", tests: PARSERS, edits: [{ file: `${S}html.mjs`, find: "    if (/comment/i.test(link.title)) continue;\n", replace: "" }] },
  { id: "source-channel-guessed", tests: PARSERS, edits: [{ file: `${S}html.mjs`, find: "  return null;\n}\n\n/** \"/channel/", replace: "  return \"UCzzzzzzzzzzzzzzzzzzzzzz\";\n}\n\n/** \"/channel/" }] },
  // ── parsers
  { id: "jsonld-cancelled-kept", tests: PARSERS, edits: [{ file: `${S}jsonld.mjs`, find: "if (/EventCancelled|EventPostponed/.test(status)) {", replace: "if (false) {" }] },
  { id: "jsonld-date-only-kept", tests: PARSERS, edits: [{ file: `${S}jsonld.mjs`, find: 'if (start.kind !== "datetime") {', replace: "if (false) {" }] },
  { id: "time-naive-is-utc", tests: [...PARSERS, `${T}reader/textTime.test.ts`], edits: [{ file: `${S}time.mjs`, find: "const ms = zonedToUtcMs(local, DEFAULT_ZONE);\n    return ms === null ? null : { kind: \"datetime\", ms };", replace: "const ms = zonedToUtcMs(local, \"UTC\");\n    return ms === null ? null : { kind: \"datetime\", ms };" }] },
  { id: "ics-exdate-ignored", tests: PARSERS, edits: [{ file: `${S}ics.mjs`, find: "if (ms > nowMs && !excluded.has(ms)) out.push(ms);", replace: "if (ms > nowMs) out.push(ms);" }] },
  { id: "ics-cancelled-kept", tests: PARSERS, edits: [{ file: `${S}ics.mjs`, find: 'if (e.status === "CANCELLED") {', replace: "if (false) {" }] },
  { id: "ics-all-day-kept", tests: PARSERS, edits: [{ file: `${S}ics.mjs`, find: 'if (e.dtstart.params.VALUE === "DATE" || start.kind === "date") {', replace: "if (false) {" }] },
  { id: "ics-alarm-text-read", tests: PARSERS, edits: [{ file: `${S}ics.mjs`, find: "    if (alarmDepth > 0) continue;\n", replace: "" }] },
  { id: "ics-unsupported-guessed", tests: PARSERS, edits: [{ file: `${S}ics.mjs`, find: "if (UNSUPPORTED_PARTS.some((p) => p in rule)) return null;", replace: "" }] },
  { id: "ics-no-series-cap", tests: PARSERS, edits: [{ file: `${S}ics.mjs`, find: "occurrences.slice(0, maxPerSeries)", replace: "occurrences" }] },
  { id: "text-http-links-kept", tests: PARSERS, edits: [{ file: `${S}text.mjs`, find: 'if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;', replace: 'if (u.username || u.password) return null;' }] },
  // ── the run
  { id: "run-live-by-default", tests: RUN, edits: [{ file: `${S}run.mjs`, find: 'return { live: flags.has("--live") && !flags.has("--dry-run") };', replace: 'return { live: !flags.has("--dry-run") };' }] },
  { id: "run-dry-run-posts", tests: RUN, edits: [{ file: `${S}run.mjs`, find: "      if (live) {\n        const tally", replace: "      if (true) {\n        const tally" }] },
  { id: "run-dry-run-digest", tests: RUN, edits: [{ file: `${S}run.mjs`, find: "  if (live) {\n    try {\n      summary.digest", replace: "  if (true) {\n    try {\n      summary.digest" }] },
  { id: "run-digest-uses-suggest-key", tests: RUN, edits: [{ file: `${S}connect.mjs`, find: 'key: digestKey, what: "Sending the digest"', replace: 'key: suggestKey, what: "Sending the digest"' }] },
  { id: "run-batch-size", tests: RUN, edits: [{ file: `${S}connect.mjs`, find: "const BATCH = 50;", replace: "const BATCH = 500;" }] },
  { id: "run-key-not-redacted", tests: RUN, edits: [{ file: `${S}connect.mjs`, find: 'replace(/cck_[A-Za-z0-9_-]{6,}/g, "cck_[redacted]")', replace: 'replace(/cck_[A-Za-z0-9_-]{6,}/g, "$&")' }] },
  { id: "run-refused-key-not-fatal", tests: RUN, edits: [{ file: `${S}connect.mjs`, find: "if (res.status === 401 || res.status === 403) {", replace: "if (false) {" }] },
  { id: "run-http-base-url", tests: RUN, edits: [{ file: `${S}connect.mjs`, find: '(u.protocol === "http:" && local)', replace: 'u.protocol === "http:"' }] },
  { id: "run-no-time-budget", tests: RUN, edits: [{ file: `${S}run.mjs`, find: "if (clock() - startedAt > budgetMs) {", replace: "if (false) {" }] },
  { id: "run-bad-rows-kept", tests: RUN, edits: [{ file: `${S}connect.mjs`, find: "SOURCE_KINDS.has(r.kind) &&", replace: "true &&" }] },
  { id: "run-plaintext-off", tests: RUN, edits: [{ file: `${S}run.mjs`, find: `    out += at === -1 ? "?" : PLAIN[at];`, replace: "    out += ch;" }] },
  { id: "run-logs-address", tests: RUN, edits: [{ file: `${S}run.mjs`, find: "kind: plainText(source.kind, 8), status: \"\"", replace: "kind: plainText(source.kind + \" \" + source.url, 80), status: \"\"" }] },
  // ── the workflow
  { id: "workflow-can-write", tests: WORKFLOW, edits: [{ file: WF, find: "permissions:\n  contents: read", replace: "permissions:\n  contents: write" }] },
  { id: "workflow-pull-request-trigger", tests: WORKFLOW, edits: [{ file: WF, find: "on:\n  schedule:", replace: "on:\n  pull_request_target:\n  schedule:" }] },
  { id: "workflow-persists-credentials", tests: WORKFLOW, edits: [{ file: WF, find: "persist-credentials: false", replace: "persist-credentials: true" }] },
  { id: "workflow-echoes-secret", tests: WORKFLOW, edits: [{ file: WF, find: '        run: node apps/connect/scripts/reader/run.mjs "$READER_MODE"', replace: '        run: echo "$AUTOMATION_SUGGEST_KEY" && node apps/connect/scripts/reader/run.mjs "$READER_MODE"' }] },
  { id: "workflow-no-fork-guard", tests: WORKFLOW, edits: [{ file: WF, find: "    if: github.repository == 'citizensnetwork/citizens-ecosystem'\n", replace: "" }] },
  { id: "workflow-no-timeout", tests: WORKFLOW, edits: [{ file: WF, find: "timeout-minutes: 20", replace: "timeout-minutes: 360" }] },
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

function runTests(tests) {
  const args = [join(APP, "node_modules/vitest/vitest.mjs"), "run", ...tests, "--bail=1", "--reporter=default"];
  const r = spawnSync(process.execPath, args, { cwd: APP, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240_000 });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const ranSomething = /Tests\s+.*\b(passed|failed)\b/.test(out);
  const sawFailure = /Tests\s+.*\bfailed\b/.test(out) || /Test Files\s+.*\bfailed\b/.test(out);
  return { status: r.status, verdict: !ranSomething ? "INCONCLUSIVE" : r.status !== 0 && sawFailure ? "KILLED" : r.status === 0 ? "SURVIVED" : "INCONCLUSIVE", tail: out.trim().split("\n").slice(-6).join("\n") };
}

// ── main ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--list")) {
  for (const m of MUTANTS) console.log(m.id);
  process.exit(0);
}
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const chosen = MUTANTS.filter((m) => (only ? only.includes(m.id) : true));

mkdirSync(RECOVERY, { recursive: true });
heal();
const before = treeHash();
console.log(`tree hash before: ${before.slice(0, 16)}`);

// controls: the unmutated suites must be green, or "killed" would mean nothing
for (const tests of new Set(chosen.map((m) => m.tests.join(",")))) {
  const r = runTests(tests.split(","));
  console.log(`control ${tests.split(",").map((t) => t.split("/").pop()).join(" ")}: ${r.verdict === "SURVIVED" ? "green" : "NOT GREEN (" + r.verdict + ")"}`);
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
        res = runTests(m.tests);
      } finally {
        restore();
      }
    }
    results.push({ id: m.id, equivalent: !!m.equivalent, verdict: res.verdict });
    console.log(`${res.verdict.padEnd(12)} ${m.id}${m.equivalent ? "  (expected to survive)" : ""}${res.verdict === "INCONCLUSIVE" ? "\n" + res.tail : ""}`);
  }
} finally {
  restore();
}

const after = treeHash();
const killed = results.filter((r) => r.verdict === "KILLED").length;
const survived = results.filter((r) => r.verdict === "SURVIVED" && !r.equivalent);
const inconclusive = results.filter((r) => r.verdict === "INCONCLUSIVE");
console.log(`\ntree hash after:  ${after.slice(0, 16)} ${after === before ? "(identical: every file restored byte for byte)" : "(DIFFERENT: SOMETHING IS LEFT MUTATED)"}`);
console.log(`${killed} killed, ${survived.length} survived${survived.length ? " (" + survived.map((r) => r.id).join(", ") + ")" : ""}, ${inconclusive.length} inconclusive, ${results.filter((r) => r.equivalent && r.verdict === "SURVIVED").length} expected survivor(s)`);
process.exit(after !== before || survived.length || inconclusive.length ? 1 : 0);
