#!/usr/bin/env node
// The Reader: Listing Automation, Phase 2. NO language model at run time.
//
//   node scripts/reader/run.mjs              dry run (the default): reads, counts, sends nothing
//   node scripts/reader/run.mjs --dry-run    the same, said out loud
//   node scripts/reader/run.mjs --live       reads, posts suggestions, then triggers the digest email
//
// Environment (GitHub Actions secrets in production):
//   AUTOMATION_SUGGEST_KEY  API key with scope automation:suggest   (always needed)
//   AUTOMATION_DIGEST_KEY   API key with scope automation:digest    (needed for --live)
//   CONNECT_BASE_URL        defaults to https://www.citizenscentral.co.za
//
// What it prints is safe for a public log: a short source id, the kind of source and a status
// phrase. Never an address, a page, an organisation name, or a key. (A GitHub Actions run of a
// public repository is readable by anyone.)

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ConnectError, createConnectClient, redact } from "./connect.mjs";
import { createFetcher } from "./net.mjs";
import { readSource } from "./source.mjs";

/** A run that has not finished by then stops reading; the unread sources are still due tomorrow. */
export const TIME_BUDGET_MS = 15 * 60 * 1000;

const short = (id) => String(id).slice(0, 8);

const PLAIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.():;-_/'";

/**
 * Text that is safe to print in a public log and to put in a Markdown table: only letters, digits, spaces
 * and a little punctuation, every other character (a pipe, a backtick, an angle bracket, a newline, a
 * control character) replaced. Everything the Reader prints is built from its own fixed phrases, and this
 * is the second wall: nothing a website or a server said can reach the log with a character of its own.
 * Each character is looked up in a constant alphabet, so the output never contains a character that was not
 * written down above.
 */
export function plainText(value, max = 200) {
  let out = "";
  for (const ch of String(value ?? "").slice(0, max)) {
    const at = PLAIN.indexOf(ch);
    out += at === -1 ? "?" : PLAIN[at];
  }
  return out;
}

export function parseArgs(argv) {
  const flags = new Set(argv);
  const unknown = argv.filter((a) => !["--dry-run", "--live", "--help", "-h"].includes(a));
  if (flags.has("--help") || flags.has("-h")) return { help: true };
  if (unknown.length) return { error: `Unknown option: ${unknown[0].slice(0, 40)}. Use --dry-run or --live.` };
  // Safe by default: only an explicit --live (and no --dry-run) posts anything.
  return { live: flags.has("--live") && !flags.has("--dry-run") };
}

export const HELP = `Citizens Connect Reader (no AI at run time)

  --dry-run   (default) read each due source and print counts only; nothing is sent
  --live      post what was found as suggestions, then trigger the daily digest email

Environment: AUTOMATION_SUGGEST_KEY, AUTOMATION_DIGEST_KEY (for --live), CONNECT_BASE_URL.
See scripts/reader/README.md.`;

/**
 * @param {{ argv?: string[], env?: Record<string,string|undefined>, deps?: object }} opts
 * @returns {Promise<{ exitCode: number, summary: Record<string, any> }>}
 */
export async function runReader({ argv = [], env = {}, deps = {} } = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  const clock = deps.clock ?? Date.now;
  const args = parseArgs(argv);
  if (args.help) {
    log(HELP);
    return { exitCode: 0, summary: {} };
  }
  if (args.error) {
    log(args.error);
    return { exitCode: 2, summary: {} };
  }
  const live = args.live;

  const suggestKey = (env.AUTOMATION_SUGGEST_KEY ?? "").trim();
  const digestKey = (env.AUTOMATION_DIGEST_KEY ?? "").trim();
  const secrets = [suggestKey, digestKey];
  const fail = (message) => {
    log(`Stopped: ${plainText(redact(message, secrets), 300)}`);
    return { exitCode: 1, summary: {} };
  };

  if (!suggestKey) return fail("AUTOMATION_SUGGEST_KEY is not set.");
  if (live && !digestKey) return fail("AUTOMATION_DIGEST_KEY is not set (needed for a live run).");

  let client;
  try {
    client = createConnectClient({ baseUrl: env.CONNECT_BASE_URL, suggestKey, digestKey, fetchImpl: deps.connectFetch });
  } catch (e) {
    return fail(e instanceof ConnectError ? e.message : "could not set up the connection.");
  }

  const startedAt = clock();
  const summary = { live, due: 0, read: 0, failed: 0, skipped: 0, events: 0, posts: 0, pending: 0, autoPublished: 0, duplicate: 0, rejected: 0, rows: [], digest: null };
  log(`Citizens Connect Reader: ${live ? "live run" : "dry run (nothing is sent)"}`);

  let sources;
  try {
    sources = await client.listSources();
  } catch (e) {
    return fail(e instanceof ConnectError ? e.message : "could not list sources.");
  }
  summary.due = sources.length;
  log(`Sources due: ${sources.length}`);

  const fetcher = deps.fetcher ?? createFetcher();
  const budgetMs = deps.budgetMs ?? TIME_BUDGET_MS;
  let fatal = null;

  for (const source of sources) {
    if (clock() - startedAt > budgetMs) {
      summary.skipped = sources.length - summary.read - summary.failed;
      log(`Time budget reached: ${summary.skipped} source(s) left for the next run.`);
      break;
    }
    const row = { id: plainText(short(source.source_id), 8), kind: plainText(source.kind, 8), status: "", posted: "" };
    try {
      const read = await readSource(source, { fetcher, nowMs: deps.nowMs ?? Date.now() });
      row.status = plainText(read.status, 190);
      summary.read++;
      summary.events += read.events;
      summary.posts += read.posts;
      if (live) {
        const tally = await client.postSuggestions({
          sourceId: source.source_id,
          contributorId: source.contributor_id,
          status: read.status,
          items: read.items,
        });
        summary.pending += tally.pending;
        summary.autoPublished += tally.auto_published;
        summary.duplicate += tally.duplicate;
        summary.rejected += tally.rejected;
        row.posted = [`${tally.pending} pending`, `${tally.auto_published} published`, `${tally.duplicate} already known`, `${tally.rejected} refused`]
          .filter((p) => !p.startsWith("0 "))
          .join(", ");
      } else {
        row.posted = "dry run";
      }
    } catch (e) {
      summary.failed++;
      row.status = "failed";
      row.posted = plainText(redact(e instanceof ConnectError ? e.message : "unexpected error", secrets), 120);
      if (e instanceof ConnectError && e.fatal) fatal = e;
    }
    summary.rows.push(row);
    log(`  ${row.id} ${row.kind.padEnd(8)} ${row.status}${row.posted ? ` -> ${row.posted}` : ""}`);
    if (fatal) break;
  }
  if (fatal) return fail(fatal.message);

  let exitCode = 0;
  if (live) {
    try {
      summary.digest = await client.runDigest();
      log(`Digest: ${summary.digest.sent} email(s) sent, ${summary.digest.failed} failed, ${summary.digest.considered} Contributor(s) considered.`);
      if (summary.digest.failed > 0) exitCode = 1;
    } catch (e) {
      log(`Digest failed: ${plainText(redact(e instanceof ConnectError ? e.message : "unexpected error", secrets), 300)}`);
      exitCode = 1;
    }
  }
  if (sources.length > 0 && summary.read === 0 && summary.failed > 0) exitCode = 1;

  log(
    `Done: ${summary.read} read, ${summary.failed} failed, ${summary.events} event(s) and ${summary.posts} post(s) found` +
      (live ? `; ${summary.pending} pending, ${summary.autoPublished} published, ${summary.duplicate} already known, ${summary.rejected} refused.` : "."),
  );
  (deps.writeSummary ?? writeStepSummary)(env, markdown(summary));
  return { exitCode, summary };
}

function markdown(s) {
  const lines = [`## Reader ${s.live ? "(live run)" : "(dry run, nothing sent)"}`, "", `Sources due: **${s.due}**, read: **${s.read}**, failed: **${s.failed}**, left for next run: **${s.skipped}**`, ""];
  if (s.rows.length) {
    lines.push("| Source | Kind | What was found | Result |", "| --- | --- | --- | --- |");
    for (const r of s.rows) lines.push(`| ${r.id} | ${r.kind} | ${cell(r.status)} | ${cell(r.posted)} |`);
    lines.push("");
  }
  if (s.live) {
    lines.push(`Posted: ${s.pending} pending, ${s.autoPublished} published automatically, ${s.duplicate} already known, ${s.rejected} refused.`);
    if (s.digest) lines.push("", `Digest: ${s.digest.sent} email(s) sent, ${s.digest.failed} failed.`);
  }
  return lines.join("\n") + "\n";
}

const cell = (t) => String(t ?? "").replace(/[|\r\n]/g, " ").slice(0, 160);

function writeStepSummary(env, text) {
  const file = env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    appendFileSync(file, text);
  } catch {
    /* a missing summary must never fail the run */
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runReader({ argv: process.argv.slice(2), env: process.env }).then(
    ({ exitCode }) => {
      process.exitCode = exitCode;
    },
    (e) => {
      console.log(`Stopped: ${redact(e?.message ?? "unexpected error", [process.env.AUTOMATION_SUGGEST_KEY, process.env.AUTOMATION_DIGEST_KEY])}`);
      process.exitCode = 1;
    },
  );
}
