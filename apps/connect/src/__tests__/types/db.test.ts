import { describe, expect, it } from "vitest";
import { getRoleDisplayLabel } from "@/types/db";

describe("getRoleDisplayLabel", () => {
  it("returns contributor subtype for contributor profiles", () => {
    expect(getRoleDisplayLabel("contributor", "ministry")).toBe(
      "Contributor - Ministry"
    );
  });

  it("falls back to base role when contributor kind is missing", () => {
    expect(getRoleDisplayLabel("contributor", null)).toBe("Contributor");
  });

  it("returns plain labels for citizen and admin", () => {
    expect(getRoleDisplayLabel("citizen", "business")).toBe("Citizen");
    expect(getRoleDisplayLabel("admin")).toBe("Admin");
  });
});
