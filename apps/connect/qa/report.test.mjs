import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvidence, markdown } from "./report.mjs";

test("separates a regression from lost coverage and leaves Android unverified", () => {
  const baseline = {
    run: { id: "prior" },
    scenarios: ["CC-01", "CC-02", "CC-03"].map((id) => ({
      id,
      status: "pass",
    })),
  };
  const evidence = buildEvidence({
    observed: new Map([
      ["CC-01", { status: "fail", detail: "HTTP 500." }],
      ["CC-02", { status: "blocked", detail: "Browser unavailable." }],
    ]),
    baseline,
    run: { date: "2026-11-23", id: "current" },
    delivery: { status: "pending", detail: "Disabled." },
  });
  assert.deepEqual(evidence.regressions, ["CC-01"]);
  assert.deepEqual(evidence.lostCoverage, ["CC-02", "CC-03"]);
  assert.equal(evidence.android.decision, "unverified");
  assert.match(markdown(evidence), /Baseline prior/);
  assert.match(markdown(evidence), /Report email is \*\*pending\*\*/);
});
