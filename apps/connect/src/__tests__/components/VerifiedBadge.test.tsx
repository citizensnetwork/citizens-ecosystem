import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VerifiedBadge, isVerifiedContributor } from "@/components/ui/VerifiedBadge";

describe("isVerifiedContributor", () => {
  it("returns true when role=contributor and contributor_status=approved", () => {
    expect(isVerifiedContributor({ role: "contributor", contributor_status: "approved" })).toBe(true);
  });

  it("returns false when status is not approved", () => {
    expect(isVerifiedContributor({ role: "contributor", contributor_status: "pending" })).toBe(false);
    expect(isVerifiedContributor({ role: "contributor", contributor_status: "rejected" })).toBe(false);
    expect(isVerifiedContributor({ role: "contributor", contributor_status: null })).toBe(false);
  });

  it("returns false for non-contributor roles", () => {
    expect(isVerifiedContributor({ role: "citizen", contributor_status: "approved" })).toBe(false);
    expect(isVerifiedContributor({ role: "admin", contributor_status: "approved" })).toBe(false);
  });

  it("returns false for null/undefined profile", () => {
    expect(isVerifiedContributor(null)).toBe(false);
    expect(isVerifiedContributor(undefined)).toBe(false);
  });
});

describe("VerifiedBadge", () => {
  it("renders with accessible title", () => {
    const { getByTitle } = render(<VerifiedBadge />);
    expect(getByTitle("Verified Contributor")).toBeTruthy();
  });

  it("honours custom title", () => {
    const { getByTitle } = render(<VerifiedBadge title="Approved" />);
    expect(getByTitle("Approved")).toBeTruthy();
  });
});
