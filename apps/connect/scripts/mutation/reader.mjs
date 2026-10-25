// ════════════════════════════════════════════════════════════════════
//  Mutation check for the deterministic Reader (issue #263): does the test suite notice when the Reader, its routes
//  or its workflow is quietly broken?
//  ------------------------------------------------------------------
//  Each mutant changes ONE thing in ONE file (an SSRF range dropped, robots.txt ignored on a redirect, a comment feed
//  let through, a key-shaped string printed, a pull_request trigger added ...), runs the narrowest tests that should
//  catch it, and records KILLED (a test failed) or SURVIVED (everything still passed: a hole in the tests).
//
//  Same engine and the same SELF-HEALING as serving-areas.mjs, because killing a run half way (taskkill /F cannot be
//  trapped) must never leave the tree mutated:
//    1. before each mutation the original is copied to <repo>/.claude/sessions/reader-mutation-recovery/ and a manifest
//       names it; the copy is deleted only after the file has been restored;
//    2. on start the harness restores anything the manifest still names (a previous run that was killed);
//    3. a hash of `git diff HEAD` plus every untracked file is taken before and after, and the run fails loudly if it moved.
//  A run that executes no test at all is INCONCLUSIVE, never "survived".
//
//  Usage (from apps/connect):  node scripts/mutation/reader.mjs [--only <id,id>] [--list]
// ════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");
const RECOVERY = join(REPO, ".claude", "sessions", "reader-mutation-recovery");
const MANIFEST = join(RECOVERY, "manifest.json");

const T_NET = ["src/__tests__/reader/net.test.ts"];
const T_PARSERS = ["src/__tests__/reader/parsers.test.ts"];
const T_SOURCE = ["src/__tests__/reader/source.test.ts"];
const T_RUN = ["src/__tests__/reader/run.test.ts"];
const T_ROUTE = ["src/__tests__/api/automation/sources.test.ts"];
const T_DUE = ["src/__tests__/lib/automation/dueSources.test.ts"];
const T_ELIG = ["src/__tests__/lib/automation/eligibility.test.ts"];
const T_SUGG = ["src/__tests__/api/automation/suggestions.test.ts"];
const T_DIGEST = ["src/__tests__/api/automation/digest.test.ts"];
const T_WF = ["src/__tests__/security/readerWorkflow.test.ts"];

const NET = "scripts/reader/net.mjs";
const ROBOTS = "scripts/reader/robots.mjs";
const HTML = "scripts/reader/html.mjs";
const XML = "scripts/reader/xml.mjs";
const JSONLD = "scripts/reader/jsonld.mjs";
const ICS = "scripts/reader/ics.mjs";
const TIME = "scripts/reader/time.mjs";
const SOURCE = "scripts/reader/source.mjs";
const CONNECT = "scripts/reader/connect.mjs";
const RUN = "scripts/reader/run.mjs";
const ROUTE = "src/app/api/automation/sources/route.ts";
const DUE = "src/lib/automation/dueSources.ts";
const ELIG = "src/lib/automation/eligibility.ts";
const SUGG = "src/app/api/automation/suggestions/route.ts";
const DIGEST = "src/app/api/automation/digest/route.ts";
const WF = "../../.github/workflows/reader.yml";

// edits: [{ file, find, replace, count = 1 }]. `equivalent` marks a mutant that SHOULD survive (a second layer covers it).
const MUTANTS = [
  // ── the SSRF guard and the polite fetcher
  { id: "net-v4-private-10", tests: T_NET, edits: [{ file: NET, find: "if (p === 0 || p === 10 || p === 127) return true;", replace: "if (p === 0 || p === 127) return true;" }] },
  { id: "net-v4-metadata", tests: T_NET, edits: [{ file: NET, find: "if (p === 169 && q === 254) return true; // link local, cloud metadata", replace: "" }] },
  { id: "net-v6-non-global", tests: T_NET, edits: [{ file: NET, find: "if (g[0] < 0x2000 || g[0] > 0x3fff) return true;", replace: "" }] },
  { id: "net-guard-any-private", tests: T_NET, edits: [{ file: NET, find: "if (list.some((x) => isPrivateAddress(x.address))) return cb(new BlockedAddressError());", replace: "if (list.every((x) => isPrivateAddress(x.address))) return cb(new BlockedAddressError());" }] },
  { id: "net-guard-not-wired", tests: T_NET, edits: [{ file: NET, find: 'headers: { ...headers, Connection: "close" }, lookup, agent: false', replace: 'headers: { ...headers, Connection: "close" }, agent: false' }] },
  { id: "net-any-port", tests: T_NET, edits: [{ file: NET, find: '(u.port !== "" && u.port !== "443")', replace: "false" }] },
  { id: "net-never-read-dropped", tests: T_NET, edits: [{ file: NET, find: "if (isNeverReadHost(u.hostname)) return REASONS.neverRead;", replace: "" }] },
  { id: "net-ipv4-shorthand", tests: T_NET, edits: [{ file: NET, find: "if (!/[a-z]/.test(tld) || /^0x/.test(tld)) return false;", replace: "" }] },
  { id: "net-redirect-http-allowed", tests: T_NET, edits: [{ file: NET, find: "if (next.protocol !== \"https:\") return { ok: false, reason: REASONS.insecureRedirect };", replace: "" }] },
  { id: "net-redirect-host-unchecked", tests: T_NET, edits: [{ file: NET, find: "const problem = urlProblem(u) ?? (await checkHost(u.hostname));", replace: "const problem = redirects === 0 ? urlProblem(u) ?? (await checkHost(u.hostname)) : null;" }] },
  { id: "net-redirect-robots-unchecked", tests: T_NET, edits: [{ file: NET, find: "      if (robots) {", replace: "      if (robots && redirects === 0) {" }] },
  { id: "net-redirect-limit", tests: T_NET, edits: [{ file: NET, find: "if (redirects >= maxRedirects)", replace: "if (redirects >= maxRedirects + 5)" }] },
  { id: "net-robots-5xx-allows", tests: T_NET, edits: [{ file: NET, find: "if (r.status && r.status >= 400 && r.status < 500 && r.status !== 429) return { rules: [] };", replace: "if (r.status) return { rules: [] };" }] },
  { id: "net-robots-ignored", tests: T_NET, edits: [{ file: NET, find: "return isAllowed(robots, u.pathname + u.search) ? null : REASONS.robotsBlocked;", replace: "return null;" }] },
  { id: "net-no-pacing", tests: T_NET, edits: [{ file: NET, find: "nextSlot.set(host, t + cfg.minGapMs);", replace: "nextSlot.set(host, t);" }] },
  { id: "net-no-size-cap", tests: T_NET, edits: [{ file: NET, find: "if (chunk.length >= room) {", replace: "if (false) {" }] },
  { id: "net-reason-leak", tests: T_NET, edits: [{ file: NET, find: "const reason = Object.values(REASONS).includes(e?.message) ? e.message : REASONS.connect;", replace: "const reason = String(e?.message);" }] },
  // ── robots.txt
  { id: "robots-prefix-match", tests: T_PARSERS, edits: [{ file: ROBOTS, find: "const named = groups.filter((g) => g.agents.includes(product));", replace: 'const named = groups.filter((g) => g.agents.some((a) => a && a !== "*" && product.startsWith(a)));' }] },
  { id: "robots-allow-tie", tests: T_PARSERS, edits: [{ file: ROBOTS, find: "(rule.pattern.length === best.pattern.length && rule.allow && !best.allow)", replace: "false" }] },
  { id: "robots-anchor-ignored", tests: T_PARSERS, edits: [{ file: ROBOTS, find: "if (last && anchored) return path.length - pos >= part.length && path.endsWith(part);", replace: "if (last && anchored) return true;" }] },
  // ── html, xml, json-ld, ics, time
  { id: "html-comment-feeds", tests: T_PARSERS, edits: [{ file: HTML, find: "if (isCommentFeed(u, link.title)) continue;", replace: "" }] },
  { id: "html-http-feeds", tests: T_PARSERS, edits: [{ file: HTML, find: "    if (u.protocol !== \"https:\") continue;\n    u.hash = \"\";\n    if (isCommentFeed", replace: "    u.hash = \"\";\n    if (isCommentFeed" }] },
  { id: "html-script-bodies-scanned", tests: T_PARSERS, edits: [{ file: HTML, find: 'if (tag.name === "script" || tag.name === "style" || tag.name === "template" || tag.name === "textarea") {', replace: 'if (tag.name === "style") {' }] },
  { id: "html-quadratic-rescan", tests: T_PARSERS, edits: [{ file: HTML, find: "if (tag?.incomplete) break;", replace: "if (tag?.incomplete) { i = lt + 1; continue; }" }] },
  { id: "xml-entities-allowed", tests: T_PARSERS, edits: [{ file: XML, find: 'if (/<!entity/i.test(decl)) throw new XmlRefused("entity declarations are not read");', replace: "" }] },
  { id: "xml-no-depth-cap", tests: T_PARSERS, edits: [{ file: XML, find: 'if (stack.length > MAX_DEPTH) throw new XmlRefused("nested too deeply");', replace: "" }] },
  { id: "jsonld-cancelled-kept", tests: T_PARSERS, edits: [{ file: JSONLD, find: 'if (status === "eventcancelled" || status === "eventpostponed") {', replace: 'if (status === "eventpostponed") {' }] },
  { id: "jsonld-date-only-kept", tests: T_PARSERS, edits: [{ file: JSONLD, find: 'if (!start || !("ms" in start)) {', replace: "if (!start) {" }] },
  { id: "ics-private-kept", tests: T_PARSERS, edits: [{ file: ICS, find: 'if (cls === "PRIVATE" || cls === "CONFIDENTIAL") {', replace: 'if (cls === "CONFIDENTIAL") {' }] },
  { id: "ics-cancelled-kept", tests: T_PARSERS, edits: [{ file: ICS, find: 'if (status === "CANCELLED") {', replace: "if (false) {" }] },
  { id: "ics-exdate-ignored", tests: T_PARSERS, edits: [{ file: ICS, find: "if (excluded.has(ms) || ", replace: "if (" }] },
  { id: "ics-override-ignored", tests: T_PARSERS, edits: [{ file: ICS, find: "|| overridden.has(`${uid}|${ms}`)", replace: "" }] },
  { id: "ics-unknown-rule-keys", tests: T_PARSERS, edits: [{ file: ICS, find: "if (!SUPPORTED_KEYS.has(key) || key in rule) return null;", replace: "if (key in rule) return null;" }] },
  { id: "ics-all-day-counted-wrong", tests: T_PARSERS, edits: [{ file: ICS, find: "    if (start.allDay) {\n      out.skippedNoTime++;\n      continue;\n    }\n", replace: "" }] },
  { id: "time-floating-as-utc", tests: T_PARSERS, edits: [{ file: TIME, find: "if (!zone) return { ms: zonedToUtc(f, tz) };", replace: "if (!zone) return { ms: Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) };" }] },
  // ── reading one source
  { id: "source-old-news", tests: T_SOURCE, edits: [{ file: SOURCE, find: "if (item.publishedMs > nowMs + DAY || item.publishedMs < nowMs - LIMITS.newsDays * DAY) continue;", replace: "if (item.publishedMs > nowMs + DAY) continue;" }] },
  { id: "source-past-events", tests: T_SOURCE, edits: [{ file: SOURCE, find: "if (e.startMs > nowMs && e.startMs <= nowMs + LIMITS.singleDays * DAY)", replace: "if (e.startMs <= nowMs + LIMITS.singleDays * DAY)" }] },
  { id: "source-youtube-host-read", tests: T_SOURCE, edits: [{ file: SOURCE, find: 'if (source.kind === "youtube" || isYoutubeHost(source.url))', replace: 'if (source.kind === "youtube")' }] },
  { id: "source-no-dedupe", tests: T_SOURCE, edits: [{ file: SOURCE, find: "        if (seen.has(key)) return false;\n", replace: "" }] },
  { id: "source-no-item-cap", tests: T_SOURCE, edits: [{ file: SOURCE, find: ".slice(0, LIMITS.maxItems - Math.min(newsItems.length, LIMITS.reservedForNews))", replace: ".slice(0, 1000)" }] },
  { id: "source-comment-feed-direct", tests: T_SOURCE, edits: [{ file: SOURCE, find: 'if (classify(page.text) === "feed" && isCommentFeed(new URL(page.url))) return done([], STATUS.commentFeed, "skipped");', replace: "" }] },
  { id: "source-image-sent", tests: T_SOURCE, edits: [{ file: SOURCE, find: "      website_url: e.url && e.url.length <= 500 ? e.url : null,\n", replace: "      website_url: e.url && e.url.length <= 500 ? e.url : null,\n      image_url: \"https://cdn.example.org/x.jpg\",\n" }] },
  // ── the Connect client and the runner
  { id: "connect-follows-redirects", tests: T_RUN, edits: [{ file: CONNECT, find: 'redirect: "manual",', replace: 'redirect: "follow",' }] },
  { id: "connect-batch-size", tests: T_RUN, edits: [{ file: CONNECT, find: "export const BATCH = 50;", replace: "export const BATCH = 500;" }] },
  { id: "connect-no-key-redaction", tests: T_RUN, edits: [{ file: CONNECT, find: 'let out = String(text ?? "").replace(/cck_[A-Za-z0-9_-]{4,}/g, "cck_[redacted]");', replace: 'let out = String(text ?? "");' }] },
  { id: "connect-http-source-kept", tests: T_RUN, edits: [{ file: CONNECT, find: 'r.url.startsWith("https://"),', replace: "true," }] },
  { id: "run-live-by-default", tests: T_RUN, edits: [{ file: RUN, find: 'return { live: argv.includes("--live") };', replace: 'return { live: !argv.includes("--dry-run") };' }] },
  { id: "run-dry-run-posts", tests: T_RUN, edits: [{ file: RUN, find: "    if (live) {\n      try {", replace: "    if (true) {\n      try {" }] },
  { id: "run-plaintext-open", tests: T_RUN, edits: [{ file: RUN, find: 'out += PLAIN.includes(ch) ? ch : "?";', replace: "out += ch;" }] },
  { id: "run-prints-address", tests: T_RUN, edits: [{ file: RUN, find: "| ${shortId(source.source_id)} |", replace: "| ${source.url} |" }] },
  { id: "run-no-digest", tests: T_RUN, edits: [{ file: RUN, find: "summary.digest = await client.runDigest();", replace: "summary.digest = { considered: 0, sent: 0, failed: 0 };" }] },
  { id: "run-post-failure-green", tests: T_RUN, edits: [{ file: RUN, find: "let exitCode = summary.postFailed > 0 ? 1 : 0;", replace: "let exitCode = 0;" }] },
  // ── the sources route and its shared rules
  { id: "route-no-scope-check", tests: T_ROUTE, edits: [{ file: ROUTE, find: 'if (!hasScope(gate.key, SUGGEST_SCOPE)) return json({ error: "forbidden" }, 403);', replace: "" }] },
  { id: "route-no-key-check", tests: T_ROUTE, edits: [{ file: ROUTE, find: 'if (!gate.key) return json({ error: "unauthorized" }, 401);', replace: 'if (!gate.key) return json({ sources: [], count: 0 });' }] },
  { id: "route-skips-gate-deny", tests: T_ROUTE, edits: [{ file: ROUTE, find: "if (gate.deny) return gate.deny;", replace: "" }] },
  { id: "route-eligibility-ignored", tests: T_ROUTE, edits: [{ file: ROUTE, find: 'if ("level" in contributorEligibility(p)) eligible.add(p.id);', replace: "eligible.add(p.id);" }] },
  { id: "route-db-level-filter", tests: T_ROUTE, edits: [{ file: ROUTE, find: '    .in("auto_update_level", [...ELIGIBLE_LEVELS])\n', replace: "" }] },
  { id: "route-own-bucket", tests: T_ROUTE, edits: [{ file: ROUTE, find: '{ bucket: "automation-suggestions" }', replace: '{ bucket: "automation-sources" }' }] },
  { id: "route-cacheable", tests: T_ROUTE, edits: [{ file: ROUTE, find: '"Cache-Control": "no-store"', replace: '"Cache-Control": "public, max-age=60"' }] },
  { id: "route-no-due-filter", tests: T_ROUTE, edits: [{ file: ROUTE, find: "      .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)\n", replace: "" }] },
  { id: "route-single-page", tests: T_ROUTE, edits: [{ file: ROUTE, find: "    if (batch.length < PAGE) break;", replace: "    break;" }] },
  { id: "route-error-leak", tests: T_ROUTE, edits: [{ file: ROUTE, find: '    console.error("[/api/automation/sources] profiles", profilesErr);\n    return json({ error: "read_failed" }, 500);', replace: '    return json({ error: String(profilesErr.message) }, 500);' }] },
  { id: "due-hours", tests: T_DUE, edits: [{ file: DUE, find: "export const SOURCE_DUE_AFTER_HOURS = 20;", replace: "export const SOURCE_DUE_AFTER_HOURS = 2;" }] },
  { id: "due-disabled-kept", tests: T_DUE, edits: [{ file: DUE, find: "if (row.enabled !== true || ", replace: "if (" }] },
  { id: "due-non-https-kept", tests: T_DUE, edits: [{ file: DUE, find: "    const url = httpsUrlOrNull(row.url);\n    if (!url) continue;", replace: "    const url = row.url;" }] },
  { id: "due-order-lost", tests: T_DUE, edits: [{ file: DUE, find: "checkedAt(a.row) - checkedAt(b.row) || ", replace: "" }] },
  { id: "due-no-cap", tests: T_DUE, edits: [{ file: DUE, find: "return picked.slice(0, Math.max(0, cap))", replace: "return picked" }] },
  { id: "elig-hidden-ok", tests: T_ELIG, edits: [{ file: ELIG, find: 'p.contributor_status !== "approved" || p.contributor_hidden || p.deleted_at', replace: 'p.contributor_status !== "approved" || p.deleted_at' }] },
  { id: "elig-off-ok", tests: T_ELIG, edits: [{ file: ELIG, find: ' || p.auto_update_level === "off"', replace: "" }] },
  { id: "sugg-empty-check-any-owner", tests: T_SUGG, edits: [{ file: SUGG, find: 'else if (!src || src.contributor_id !== contributorId || !src.enabled) sourceCheck = "source_disabled";', replace: 'else if (!src) sourceCheck = "source_disabled";' }] },
  { id: "sugg-empty-check-no-consent", tests: T_SUGG, edits: [{ file: SUGG, find: 'if ("reason" in who) sourceCheck = who.reason;', replace: "if (false) sourceCheck = who.reason;" }] },
  { id: "sugg-shared-rule-bypassed", tests: T_SUGG, edits: [{ file: SUGG, find: "const result = contributorEligibility(data as ProfileForAutomation | null);", replace: 'const result: Eligibility = { level: "suggest" };' }] },
  { id: "digest-shared-rule-bypassed", tests: T_DIGEST, edits: [{ file: DIGEST, find: "const who = contributorEligibility(p);", replace: 'const who = { level: "suggest" } as { level: string } | { reason: string };' }] },
  // ── the workflow
  { id: "wf-pull-request-trigger", tests: T_WF, edits: [{ file: WF, find: "  workflow_dispatch:\n    inputs:", replace: "  pull_request:\n  workflow_dispatch:\n    inputs:" }] },
  { id: "wf-write-permission", tests: T_WF, edits: [{ file: WF, find: "permissions:\n  contents: read", replace: "permissions:\n  contents: write" }] },
  { id: "wf-secret-in-run-line", tests: T_WF, edits: [{ file: WF, find: 'run: node apps/connect/scripts/reader/run.mjs "$READER_MODE"', replace: 'run: node apps/connect/scripts/reader/run.mjs "$READER_MODE" ${{ secrets.AUTOMATION_SUGGEST_KEY }}' }] },
  { id: "wf-live-by-default", tests: T_WF, edits: [{ file: WF, find: "default: dry-run", replace: "default: live" }] },
  { id: "wf-fork-guard-dropped", tests: T_WF, edits: [{ file: WF, find: "    if: github.repository == 'citizensnetwork/citizens-ecosystem'\n", replace: "" }] },
  { id: "wf-no-bash-pipefail", tests: T_WF, edits: [{ file: WF, find: "        shell: bash\n", replace: "" }] },
  { id: "wf-credentials-persisted", tests: T_WF, edits: [{ file: WF, find: "          persist-credentials: false\n", replace: "          persist-credentials: true\n" }] },
];

// ── plumbing (as serving-areas.mjs) ──────────────────────────────────
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

function childEnv() {
  const env = { ...process.env };
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[key] = join(APP, "node_modules", ".bin") + delimiter + (env[key] ?? "");
  return env;
}

function runTests(tests) {
  const args = [join(APP, "node_modules/vitest/vitest.mjs"), "run", ...tests, "--bail=1", "--reporter=default"];
  const r = spawnSync(process.execPath, args, { cwd: APP, env: childEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240_000 });
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
for (const tests of [...new Set(chosen.map((m) => m.tests.join(",")))].map((t) => t.split(","))) {
  const r = runTests(tests);
  console.log(`control ${tests.join(" ")}: ${r.verdict === "SURVIVED" ? "green" : "NOT GREEN (" + r.verdict + ")"}`);
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
