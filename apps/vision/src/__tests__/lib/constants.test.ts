import { describe, it, expect } from "vitest";
import {
  APP_NAME,
  ORG_ROLES,
  ROLE_LABELS,
  ROLE_HIERARCHY,
} from "@/lib/constants";

describe("constants", () => {
  it("exports APP_NAME", () => {
    expect(APP_NAME).toBe("Citizens Vision");
  });

  it("defines exactly 5 org roles", () => {
    expect(ORG_ROLES).toHaveLength(5);
  });

  it("has labels for every role", () => {
    for (const role of ORG_ROLES) {
      expect(ROLE_LABELS[role]).toBeDefined();
      expect(typeof ROLE_LABELS[role]).toBe("string");
    }
  });

  it("has hierarchy values for every role", () => {
    for (const role of ORG_ROLES) {
      expect(typeof ROLE_HIERARCHY[role]).toBe("number");
    }
  });

  it("platform_admin has highest hierarchy", () => {
    const max = Math.max(...Object.values(ROLE_HIERARCHY));
    expect(ROLE_HIERARCHY.platform_admin).toBe(max);
  });

  it("org_viewer has lowest hierarchy", () => {
    const min = Math.min(...Object.values(ROLE_HIERARCHY));
    expect(ROLE_HIERARCHY.org_viewer).toBe(min);
  });
});
