import { describe, it, expect } from "vitest";
import { ELIGIBLE_LEVELS, contributorEligibility } from "@/lib/automation/eligibility";
import { AUTO_UPDATE_LEVELS } from "@/lib/automation/suggestions";

const ok = { role: "contributor", contributor_status: "approved", contributor_hidden: false, deleted_at: null, auto_update_level: "suggest" };

describe("contributorEligibility: the one rule the three machine routes share", () => {
  it("an approved, visible, undeleted Contributor at 'suggest' or 'events_auto' is eligible at that level", () => {
    expect(contributorEligibility(ok)).toEqual({ level: "suggest" });
    expect(contributorEligibility({ ...ok, auto_update_level: "events_auto" })).toEqual({ level: "events_auto" });
    expect(contributorEligibility({ ...ok, contributor_hidden: null })).toEqual({ level: "suggest" });
  });

  it.each([
    ["no profile", null],
    ["a Citizen", { ...ok, role: "citizen" }],
    ["an admin", { ...ok, role: "admin" }],
    ["a pending applicant", { ...ok, contributor_status: "pending" }],
    ["a rejected applicant", { ...ok, contributor_status: "rejected" }],
    ["a hidden listing", { ...ok, contributor_hidden: true }],
    ["a deleted listing", { ...ok, deleted_at: "2026-01-01T00:00:00Z" }],
  ])("%s is not eligible", (_label, p) => {
    expect(contributorEligibility(p)).toEqual({ reason: "contributor_not_eligible" });
  });

  it("level 'off', a missing level and an unknown level all count as consent off", () => {
    for (const level of ["off", null, undefined, "", "yes", "SUGGEST"]) {
      expect(contributorEligibility({ ...ok, auto_update_level: level as string }), String(level)).toEqual({ reason: "consent_off" });
    }
  });

  it("eligibility is checked before consent (a hidden listing at 'off' is not eligible, not 'consent off')", () => {
    expect(contributorEligibility({ ...ok, contributor_hidden: true, auto_update_level: "off" })).toEqual({ reason: "contributor_not_eligible" });
  });

  it("a Care / Recovery Contributor at 'events_auto' is served as 'suggest': nothing of theirs is auto-published (#202)", () => {
    for (const contributor_category of ["retreat-healing", "clinic", "rehab-development"]) {
      expect(contributorEligibility({ ...ok, auto_update_level: "events_auto", contributor_category }), contributor_category).toEqual({ level: "suggest" });
    }
    expect(contributorEligibility({ ...ok, auto_update_level: "events_auto", contributor_category: "churches-ministries" })).toEqual({ level: "events_auto" });
    expect(contributorEligibility({ ...ok, auto_update_level: "off", contributor_category: "clinic" })).toEqual({ reason: "consent_off" });
  });

  it("ELIGIBLE_LEVELS is every level except 'off'", () => {
    expect([...ELIGIBLE_LEVELS].sort()).toEqual(AUTO_UPDATE_LEVELS.filter((l) => l !== "off").sort());
  });
});
