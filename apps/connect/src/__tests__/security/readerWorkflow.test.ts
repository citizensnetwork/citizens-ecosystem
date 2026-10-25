/**
 * The Reader's workflow is a security surface: it holds two API keys and runs in a PUBLIC repo,
 * whose Actions logs anyone can read. This pins the properties that keep it safe, so a later edit
 * cannot quietly loosen one (line-based checks over the comment-stripped file; no YAML dependency).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = readFileSync(join(process.cwd(), "../../.github/workflows/reader.yml"), "utf8").replace(/\r\n/g, "\n");
const LINES = RAW.split("\n").filter((l) => !/^\s*#/.test(l));
const YAML = LINES.join("\n");

/** The lines of the top-level block `key:` (up to the next top-level key). */
function block(key: string): string[] {
  const start = LINES.findIndex((l) => l === `${key}:`);
  if (start === -1) return [];
  const out: string[] = [];
  for (const l of LINES.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    if (l.trim()) out.push(l);
  }
  return out;
}

const RUN_LINE = 'node apps/connect/scripts/reader/run.mjs "$READER_MODE" | tee -a "$GITHUB_STEP_SUMMARY"';

describe("reader.yml: when it runs", () => {
  it("only on a schedule or by hand: never for pull requests, pushes or other events", () => {
    const triggers = block("on").filter((l) => /^ {2}\S/.test(l)).map((l) => l.trim().replace(/:.*$/, ""));
    expect(triggers).toEqual(["schedule", "workflow_dispatch"]);
    for (const banned of ["pull_request", "pull_request_target", "push", "workflow_run", "issue_comment", "issues", "repository_dispatch"]) {
      expect(YAML).not.toMatch(new RegExp(`^\\s*${banned}:`, "m"));
    }
  });
  it("a manual run is a dry run unless 'live' is chosen; a scheduled run is dry unless READER_LIVE is true", () => {
    expect(YAML).toMatch(/default: dry-run/);
    expect(YAML).toContain(
      "READER_MODE: ${{ ((github.event_name == 'workflow_dispatch' && inputs.mode == 'live') || (github.event_name == 'schedule' && vars.READER_LIVE == 'true')) && '--live' || '--dry-run' }}",
    );
  });
  it("never on a fork, one run at a time, and at most 20 minutes", () => {
    expect(YAML).toContain("if: github.repository == 'citizensnetwork/citizens-ecosystem'");
    expect(block("concurrency").map((l) => l.trim())).toEqual(["group: reader", "cancel-in-progress: false"]);
    expect(YAML.match(/timeout-minutes: (\d+)/g)).toEqual(["timeout-minutes: 20"]);
  });
});

describe("reader.yml: what it may touch", () => {
  it("reads the repository and nothing else", () => {
    expect(block("permissions").map((l) => l.trim())).toEqual(["contents: read"]);
    expect(YAML.match(/permissions:/g)).toHaveLength(1);
    expect(YAML).toContain("persist-credentials: false");
  });
  it("uses only checkout and setup-node: no cache, no artifact, no third-party action", () => {
    const uses = [...YAML.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses).toEqual(["actions/checkout@v4", "actions/setup-node@v4"]);
  });
});

describe("reader.yml: secrets", () => {
  it("the three secrets arrive only as env entries of the same name", () => {
    const secretLines = LINES.filter((l) => l.includes("secrets."));
    expect(secretLines.map((l) => l.trim())).toEqual([
      "AUTOMATION_SUGGEST_KEY: ${{ secrets.AUTOMATION_SUGGEST_KEY }}",
      "AUTOMATION_DIGEST_KEY: ${{ secrets.AUTOMATION_DIGEST_KEY }}",
      "CONNECT_BASE_URL: ${{ secrets.CONNECT_BASE_URL }}",
    ]);
    expect(YAML).not.toMatch(/secrets\s*:\s*inherit|toJSON\(secrets\)|GITHUB_TOKEN/);
  });
  it("no expression is interpolated into a shell line (no script injection)", () => {
    const runLines = LINES.filter((l) => /^\s*run:/.test(l));
    expect(runLines).toHaveLength(1);
    expect(runLines.join("\n")).not.toContain("${{");
  });
});

describe("reader.yml: the single run line", () => {
  it("runs the script once under bash (so pipefail keeps its exit code) and tees its report into the Summary", () => {
    expect(LINES.filter((l) => /^\s*run:/.test(l)).map((l) => l.trim())).toEqual([`run: ${RUN_LINE}`]);
    expect(YAML).toMatch(/shell: bash\n\s+env:/);
    // The script itself writes no file (CodeQL js/http-to-file-access); only the workflow touches the Summary.
    for (const f of ["run", "net", "source", "connect", "html", "xml", "feed", "jsonld", "ics", "time", "robots"]) {
      expect(readFileSync(join(process.cwd(), `scripts/reader/${f}.mjs`), "utf8"), f).not.toMatch(/writeFile|appendFile|createWriteStream|from "node:fs"|GITHUB_STEP_SUMMARY/);
    }
  });
});
