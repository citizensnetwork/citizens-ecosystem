import { describe, it, expect } from "vitest";
import { orgTags } from "@/lib/cache/tags";

describe("orgTags vocabulary", () => {
  const ORG = "abc-123";

  it("namespaces every tag under org:<id>", () => {
    expect(orgTags.all(ORG)).toBe("org:abc-123");
    expect(orgTags.activities(ORG)).toBe("org:abc-123:activities");
    expect(orgTags.projects(ORG)).toBe("org:abc-123:projects");
    expect(orgTags.goals(ORG)).toBe("org:abc-123:goals");
    expect(orgTags.members(ORG)).toBe("org:abc-123:members");
    expect(orgTags.departments(ORG)).toBe("org:abc-123:departments");
    expect(orgTags.metrics(ORG)).toBe("org:abc-123:metrics");
  });

  it("produces distinct tags per resource to avoid cross-invalidation", () => {
    const tags = [
      orgTags.activities(ORG),
      orgTags.projects(ORG),
      orgTags.goals(ORG),
      orgTags.members(ORG),
      orgTags.departments(ORG),
      orgTags.metrics(ORG),
    ];
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("isolates tenants — same resource in different orgs has different tags", () => {
    expect(orgTags.activities("org-1")).not.toBe(orgTags.activities("org-2"));
  });
});
