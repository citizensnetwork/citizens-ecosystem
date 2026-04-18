import { describe, it, expect } from "vitest";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  getRoleDisplayLabel,
  getRoleAndTitle,
} from "@/lib/roles/labels";

describe("role labels", () => {
  it("exposes a label for every RBAC role", () => {
    expect(ROLE_LABELS.platform_admin).toBe("Platform Admin");
    expect(ROLE_LABELS.org_admin).toBe("CEO");
    expect(ROLE_LABELS.org_manager).toBe("Admin");
    expect(ROLE_LABELS.org_member).toBe("Employee");
    expect(ROLE_LABELS.org_viewer).toBe("Viewer");
  });

  it("exposes a description for every RBAC role", () => {
    expect(ROLE_DESCRIPTIONS.platform_admin).toMatch(/platform/i);
    expect(ROLE_DESCRIPTIONS.org_admin).toMatch(/organisation/i);
    expect(ROLE_DESCRIPTIONS.org_manager).toMatch(/manage/i);
    expect(ROLE_DESCRIPTIONS.org_member).toMatch(/member/i);
    expect(ROLE_DESCRIPTIONS.org_viewer).toMatch(/read.?only/i);
  });

  describe("getRoleDisplayLabel", () => {
    it("returns the mapped label when not a founder", () => {
      expect(getRoleDisplayLabel("org_admin")).toBe("CEO");
      expect(getRoleDisplayLabel("org_manager", false)).toBe("Admin");
      expect(getRoleDisplayLabel("org_member", null)).toBe("Employee");
    });

    it("overrides to 'Founder' when isFounder is true, regardless of role", () => {
      expect(getRoleDisplayLabel("org_admin", true)).toBe("Founder");
      expect(getRoleDisplayLabel("org_viewer", true)).toBe("Founder");
      expect(getRoleDisplayLabel("platform_admin", true)).toBe("Founder");
    });
  });

  describe("getRoleAndTitle", () => {
    it("combines label and trimmed title with a separator", () => {
      expect(getRoleAndTitle("org_admin", "Head of Ops")).toBe(
        "CEO · Head of Ops",
      );
      expect(getRoleAndTitle("org_member", "  Lead Volunteer  ")).toBe(
        "Employee · Lead Volunteer",
      );
    });

    it("returns just the label when title is missing or blank", () => {
      expect(getRoleAndTitle("org_admin")).toBe("CEO");
      expect(getRoleAndTitle("org_admin", null)).toBe("CEO");
      expect(getRoleAndTitle("org_admin", "")).toBe("CEO");
      expect(getRoleAndTitle("org_admin", "   ")).toBe("CEO");
    });

    it("honours the founder override", () => {
      expect(getRoleAndTitle("org_admin", "Head of Ops", true)).toBe(
        "Founder · Head of Ops",
      );
      expect(getRoleAndTitle("org_member", null, true)).toBe("Founder");
    });
  });
});
