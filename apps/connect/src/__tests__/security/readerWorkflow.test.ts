import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Reader's workflow holds two API keys, in a PUBLIC repository. These checks pin down the few
// properties that keep it safe, so a later edit that weakens one fails here instead of in production.

const FILE = join(__dirname, "../../../../../.github/workflows/reader.yml");
const raw = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const code = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

/** The lines of a top-level key's block (everything indented under it). */
function block(key: string): string[] {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  expect(start, `${key}: is present`).toBeGreaterThanOrEqual(0);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && (lines[i] === "" || /^\s/.test(lines[i]!)); i++) out.push(lines[i]!);
  return out;
}

describe(".github/workflows/reader.yml", () => {
  it("is triggered only by a schedule and by hand: never by a pull request, a comment or another workflow", () => {
    const triggers = block("on")
      .filter((l) => /^ {2}[a-z_]+:/.test(l))
      .map((l) => l.trim().replace(/:.*/, ""));
    expect(triggers.sort()).toEqual(["schedule", "workflow_dispatch"]);
    for (const banned of ["pull_request", "pull_request_target", "workflow_run", "issue_comment", "issues", "push", "repository_dispatch"]) {
      expect(code, banned).not.toMatch(new RegExp(`^\\s*${banned}\\s*:`, "m"));
    }
  });

  it("can only read the repository", () => {
    expect(
      block("permissions")
        .map((l) => l.trim())
        .filter(Boolean),
    ).toEqual(["contents: read"]);
    expect(code).not.toMatch(/:\s*write\b/);
  });

  it("is bounded: a 20 minute timeout, one run at a time, and never on a fork", () => {
    expect(code).toMatch(/timeout-minutes:\s*20\b/);
    expect(code).toMatch(/concurrency:\s*\n\s+group:\s*reader\b/);
    expect(code).toContain("github.repository == 'citizensnetwork/citizens-ecosystem'");
  });

  it("uses only expressions it expects, and never one inside a shell command", () => {
    const expressions = [...code.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1]!.trim());
    expect(expressions.sort()).toEqual(
      [
        "github.event_name == 'workflow_dispatch' && inputs.dry_run && '--dry-run' || '--live'",
        "secrets.AUTOMATION_DIGEST_KEY",
        "secrets.AUTOMATION_SUGGEST_KEY",
        "secrets.CONNECT_BASE_URL",
      ].sort(),
    );
    for (const line of code.split("\n").filter((l) => /^\s*(-\s+)?run:/.test(l))) {
      expect(line, "a run: line carries no expression").not.toContain("${{");
    }
  });

  it("passes secrets through env only, and never prints the environment or a secret", () => {
    for (const line of code.split("\n").filter((l) => l.includes("secrets."))) {
      expect(line).toMatch(/^\s{10}[A-Z_]+:\s*\$\{\{ secrets\.[A-Z_]+ \}\}$/);
    }
    expect(code).not.toMatch(/\becho\b|\bprintenv\b|\bset -x\b|\benv\s*\||\bcurl\b|\bwget\b/);
  });

  it("uses only the two first-party actions, and does not persist the checkout credentials", () => {
    const uses = [...code.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.sort()).toEqual(["actions/checkout@v4", "actions/setup-node@v4"]);
    expect(code).toMatch(/persist-credentials:\s*false/);
  });

  it("runs the Reader script and nothing else, with the mode as a quoted argument", () => {
    const runs = code.split("\n").filter((l) => /^\s*run:/.test(l));
    expect(runs).toEqual(['        run: node apps/connect/scripts/reader/run.mjs "$READER_MODE"']);
  });
});
