#!/usr/bin/env node
// The Reader: Listing Automation, Phase 2. NO language model at run time, no dependencies.
//
//   node scripts/reader/run.mjs              dry run (the default): reads each due source, prints counts, sends nothing
//   node scripts/reader/run.mjs --dry-run    the same, said out loud
//   node scripts/reader/run.mjs --live       reads, posts suggestions, then triggers the daily digest email
//
// Environment (GitHub Actions secrets in production; see README.md):
//   AUTOMATION_SUGGEST_KEY  key with scope automation:suggest   (lists sources, posts suggestions)
//   AUTOMATION_DIGEST_KEY   key with scope automation:digest    (only for --live)
//   CONNECT_BASE_URL        defaults to https://www.citizenscentral.co.za
//
// Everything it prints is safe for a PUBLIC log (an Actions run of a public repository is readable
// by anyone): a short source id, the kind of source and a fixed status phrase with numbers. Never an
// address, a page, an organisation's name or a key. It writes no file: the workflow pipes this
// report into the run's Summary page.

import { pathToFileURL } from "node:url";
import { ConnectError, createConnectClient, redact } from "./connect.mjs";
import { createFetcher } from "./net.mjs";
import { readSource } from "./source.mjs";

/** After this the run stops reading; the unread sources are still due on the next run. */
export const TIME_BUDGET_MS = 15 * 60 * 1000;

const PLAIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.():;-_/'";

/**
 * Text that is safe in a public log and inside a Markdown table cell: every character outside a
 * fixed alphabet (a pipe, a backtick, an angle bracket, a newline, a control character) becomes "?".
 * The Reader only prints its own fixed phrases; this is the second wall.
 */
export function plainText(value, max = 200) {
  let out = "";
  for (const ch of String(value ?? "").slice(0, max)) out += PLAIN.includes(ch) ? ch : "?";
  return out;
}

export const HELP = `Citizens Connect Reader (no AI at run time)

  --dry-run   (default) read each due source and print counts only; nothing is sent
  --live      post what was found as suggestions, then trigger the daily digest email

Environment: AUTOMATION_SUGGEST_KEY, AUTOMATION_DIGEST_KEY (for --live), CONNECT_BASE_URL.
See apps/connect/scripts/reader/README.md.`;

export function parseArgs(argv) {
  const known = new Set(["--dry-run", "--live", "--help", "-h"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  if (unknown.length) return { error: `Unknown option ${plainText(unknown[0], 30)}. Use --dry-run or --live.` };
  if (argv.includes("--live") && argv.includes("--dry-run")) return { error: "Choose one of --dry-run or --live." };
  return { live: argv.includes("--live") };
}

const shortId = (id) => plainText(String(id).slice(0, 8), 8);

/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, deps?: { log?: Function, fetcher?: object, connectFetch?: typeof fetch, clock?: () => number, nowMs?: () => number, budgetMs?: number, sleep?: Function } }} opts
 * @returns {Promise<{ exitCode: number, summary: object }>}
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
  const suggestKey = String(env.AUTOMATION_SUGGEST_KEY ?? "").trim();
  const digestKey = String(env.AUTOMATION_DIGEST_KEY ?? "").trim();
  const secrets = [suggestKey, digestKey];
  const say = (text, max = 300) => plainText(redact(text, secrets), max);
  const stop = (message) => {
    log(`Stopped: ${say(message)}`);
    return { exitCode: 1, summary: {} };
  };

  log(`## Citizens Connect Reader: ${live ? "live run" : "dry run, nothing is sent"}`);
  log("");
  if (!suggestKey) {
    log("Not set up yet: AUTOMATION_SUGGEST_KEY is empty, so nothing was read. See the README to add the secrets.");
    return { exitCode: 0, summary: { notSetUp: true } };
  }
  if (live && !digestKey) return stop("AUTOMATION_DIGEST_KEY is empty, and a live run needs it.");

  let client;
  try {
    client = createConnectClient({ baseUrl: env.CONNECT_BASE_URL, suggestKey, digestKey, fetchImpl: deps.connectFetch, sleep: deps.sleep });
  } catch (e) {
    return stop(e instanceof ConnectError ? e.message : "could not set up the connection.");
  }

  let sources;
  try {
    sources = await client.listSources();
  } catch (e) {
    return stop(e instanceof ConnectError ? e.message : "could not list the sources.");
  }

  const summary = { live, due: sources.length, read: 0, failed: 0, skipped: 0, notReached: 0, events: 0, posts: 0, pending: 0, autoPublished: 0, duplicate: 0, rejected: 0, postFailed: 0, digest: null };
  log(`Sources due: ${sources.length}`);
  log("");
  if (sources.length) {
    log("| Source | Kind | What the Reader found | Sent to Connect |");
    log("| --- | --- | --- | --- |");
  }

  const fetcher = deps.fetcher ?? createFetcher();
  const budgetMs = deps.budgetMs ?? TIME_BUDGET_MS;
  const startedAt = clock();
  let fatal = null;

  for (const [index, source] of sources.entries()) {
    if (clock() - startedAt > budgetMs) {
      summary.notReached = sources.length - index;
      break;
    }
    const read = await readSource(source, { fetcher, nowMs: (deps.nowMs ?? Date.now)() });
    summary[read.outcome === "read" ? "read" : read.outcome === "failed" ? "failed" : "skipped"]++;
    summary.events += read.events;
    summary.posts += read.posts;
    let sent = "dry run";
    if (live) {
      try {
        const t = await client.postSuggestions({ sourceId: source.source_id, contributorId: source.contributor_id, status: read.status, items: read.items });
        summary.pending += t.pending;
        summary.autoPublished += t.auto_published;
        summary.duplicate += t.duplicate;
        summary.rejected += t.rejected;
        const parts = [`${t.pending} pending`, `${t.auto_published} published`, `${t.duplicate} already known`, `${t.rejected} refused`].filter((p) => !p.startsWith("0 "));
        if (t.sourceCheck && t.sourceCheck !== "recorded") parts.push(`check not recorded: ${t.sourceCheck}`);
        sent = parts.length ? parts.join(", ") : "check recorded";
      } catch (e) {
        summary.postFailed++;
        sent = e instanceof ConnectError ? e.message : "posting failed";
        if (e instanceof ConnectError && e.fatal) fatal = e;
      }
    }
    log(`| ${shortId(source.source_id)} | ${plainText(source.kind, 10)} | ${say(read.status, 190)} | ${say(sent, 160)} |`);
    if (fatal) break;
  }
  if (fatal) {
    log("");
    return stop(fatal.message);
  }

  log("");
  if (summary.notReached) log(`Time budget reached: ${summary.notReached} source(s) left for the next run.`);
  let exitCode = summary.postFailed > 0 ? 1 : 0;
  if (live) {
    try {
      summary.digest = await client.runDigest();
      log(`Digest: ${summary.digest.sent} email(s) sent, ${summary.digest.failed} failed, ${summary.digest.considered} listing(s) considered.`);
      if (summary.digest.failed > 0) exitCode = 1;
    } catch (e) {
      log(`Digest failed: ${say(e instanceof ConnectError ? e.message : "unexpected error")}`);
      exitCode = 1;
    }
  }
  log(
    `Done: ${summary.read} read, ${summary.failed} could not be read, ${summary.skipped} skipped; ${summary.events} event(s) and ${summary.posts} post(s) found` +
      (live ? `; ${summary.pending} pending, ${summary.autoPublished} published, ${summary.duplicate} already known, ${summary.rejected} refused.` : "."),
  );
  return { exitCode, summary };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runReader({ argv: process.argv.slice(2), env: process.env }).then(
    ({ exitCode }) => {
      process.exitCode = exitCode;
    },
    (e) => {
      console.log(`Stopped: ${plainText(redact(e?.message ?? "unexpected error", [process.env.AUTOMATION_SUGGEST_KEY, process.env.AUTOMATION_DIGEST_KEY]), 300)}`);
      process.exitCode = 1;
    },
  );
}
