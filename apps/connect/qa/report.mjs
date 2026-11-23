import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const scenarios = [
  [
    "CC-01",
    "Production entry",
    "Citizens may be unable to enter Connect.",
    "Verify the canonical entry returns HTML under the Connect prefix.",
  ],
  [
    "CC-02",
    "Guest Discover",
    "Newcomers may miss public discovery.",
    "Verify Discover loads for a fresh guest.",
  ],
  [
    "CC-03",
    "Guest map",
    "Citizens may miss nearby Contributors, places and events.",
    "Verify the map screen renders under the Connect prefix.",
  ],
  [
    "CC-04",
    "Guest Community",
    "Citizens may miss opportunities to participate.",
    "Verify the Community screen renders for a guest.",
  ],
  [
    "CC-05",
    "Mobile web Discover",
    "Mobile guests may lose access to content or navigation.",
    "Verify Discover renders without horizontal page overflow.",
  ],
  [
    "CC-06",
    "Exploratory guest journeys",
    "Listing usability and accessibility remain unverified.",
    "Review listing details, back navigation, keyboard use and design integrity.",
  ],
  [
    "CC-07",
    "Authenticated staging",
    "Authenticated participation remains unverified.",
    "Verify role-based journeys using isolated synthetic identities.",
  ],
  [
    "CC-08",
    "Android release candidate",
    "Native behavior remains unverified.",
    "Record release-candidate build, device checks and release review.",
  ],
  [
    "CC-VITEST",
    "Connect unit tests",
    "Local behavior may regress.",
    "Inspect Connect Vitest results and rerun the affected tests.",
  ],
  [
    "CC-E2E",
    "Hermetic Connect Playwright",
    "Mocked end-to-end journeys may regress.",
    "Inspect the affected hermetic Playwright cases.",
  ],
  [
    "CC-PREFIX",
    "Hermetic prefix Playwright",
    "Prefixed routes and links may regress.",
    "Inspect the affected prefix-mode Playwright cases.",
  ],
];

export function buildEvidence({ observed, baseline, run, delivery }) {
  const previous = new Map(
    (baseline?.scenarios ?? []).map(({ id, status }) => [id, status]),
  );
  const results = scenarios.map(([id, name, impact, acceptance]) => {
    const { status, detail } = observed.get(id) ?? {
      status: "not_run",
      detail: "Check did not execute.",
    };
    return {
      id,
      name,
      status,
      detail,
      impact,
      acceptance,
      previous: previous.get(id) ?? null,
    };
  });
  const regressions = results
    .filter(({ previous, status }) => previous === "pass" && status === "fail")
    .map(({ id }) => id);
  const lostCoverage = results
    .filter(
      ({ previous, status }) =>
        previous === "pass" && ["blocked", "not_run"].includes(status),
    )
    .map(({ id }) => id);
  return {
    schemaVersion: "1.0.0",
    catalogueVersion: 1,
    run,
    baseline: baseline?.run ?? null,
    regressions,
    lostCoverage,
    android: {
      decision: "unverified",
      gates: {
        releaseCandidateBuild: "not_run",
        deviceExecution: "not_run",
        releaseReview: "not_run",
      },
    },
    delivery,
    scenarios: results,
  };
}

export function markdown(evidence) {
  const list = (items) => items.join(", ") || "None";
  return [
    `# Citizens Connect QA — ${evidence.run.date}`,
    "",
    `Run ${evidence.run.id}. Baseline ${evidence.baseline?.id ?? "unavailable"}.`,
    "",
    `Regressions — ${list(evidence.regressions)}. Lost coverage — ${list(evidence.lostCoverage)}.`,
    "",
    "| Check | Previous | Outcome | Evidence |",
    "| --- | --- | --- | --- |",
    ...evidence.scenarios.map(
      (row) =>
        `| ${row.id} ${row.name} | ${row.previous ?? "—"} | ${row.status} | ${row.detail} |`,
    ),
    "",
    "## Follow-up and acceptance",
    "",
    ...evidence.scenarios
      .filter(({ status }) => status !== "pass")
      .map((row) => `- **${row.id}** — ${row.impact} ${row.acceptance}`),
    "",
    "Investigate failed surfaces and propose fixes after the cause is confirmed. Rerun blocked checks from an enabled runner.",
    "",
    "Review whether navigation makes Contributors, places, events and Kingdom Projects easy to find. Check keyboard access, touch targets and consistent treatment of loading and empty states during the exploratory review.",
    "",
    `Android readiness is **${evidence.android.decision}**.`,
    "",
    `Report email is **${evidence.delivery.status}**. ${evidence.delivery.detail}`,
    "",
  ].join("\n");
}

async function runReport() {
  const observed = new Map();
  const record = (id, status, detail) => observed.set(id, { status, detail });
  for (const [id, key] of [
    ["CC-VITEST", "UNIT"],
    ["CC-E2E", "E2E"],
    ["CC-PREFIX", "PREFIX"],
  ]) {
    const outcome = process.env[`QA_${key}`];
    const status =
      {
        success: "pass",
        failure: "fail",
        skipped: "blocked",
        cancelled: "blocked",
      }[outcome] ?? "not_run";
    record(id, status, `Runner step outcome: ${outcome || "unavailable"}.`);
  }
  if (process.env.QA_HTTP === "200") {
    record(
      "CC-01",
      "pass",
      "Read-only HEAD reached the canonical entry with HTTP 200.",
    );
    for (const id of ["CC-02", "CC-03", "CC-04", "CC-05", "CC-06"]) {
      record(id, "blocked", "Browser execution unavailable for this run.");
    }
  }
  if (process.env.QA_PUBLIC === "true") {
    try {
      await (await import("./public.mjs")).publicChecks(record);
    } catch {
      for (const id of ["CC-01", "CC-02", "CC-03", "CC-04", "CC-05"]) {
        if (!observed.has(id))
          record(
            id,
            "blocked",
            "Public browser runner unavailable or interrupted.",
          );
      }
    }
  }
  record(
    "CC-07",
    "not_run",
    "An isolated staging environment and approved identities have not been established.",
  );
  record(
    "CC-08",
    "not_run",
    "Native release-candidate and emulator or device evidence unavailable.",
  );
  const baseline = await readFile(".qa-baseline/evidence.json", "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const run = {
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
    }).format(new Date()),
    id: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
      : "phase-0",
    revision: process.env.GITHUB_SHA ?? null,
  };
  const evidence = buildEvidence({
    observed,
    baseline:
      baseline?.catalogueVersion === 1 && Array.isArray(baseline.scenarios)
        ? baseline
        : null,
    run,
    delivery: {
      status: "pending",
      detail:
        "See the Actions delivery job for any provider acceptance receipt.",
    },
  });
  await mkdir(".qa-report", { recursive: true });
  await writeFile(
    ".qa-report/evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await writeFile(
    `.qa-report/citizens-connect-qa-${run.date}-${run.id}.md`,
    markdown(evidence),
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown(evidence));
  }
  if (
    evidence.scenarios.some(
      ({ id, status }) =>
        status === "fail" ||
        (process.env.QA_PUBLIC === "true" &&
          id === "CC-01" &&
          status === "blocked"),
    )
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await runReport();
