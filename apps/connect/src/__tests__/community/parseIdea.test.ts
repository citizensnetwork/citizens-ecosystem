import { describe, it, expect } from "vitest";
import { parseIdeaBody } from "@/lib/community/parseIdea";

describe("parseIdeaBody", () => {
  it("extracts category and description from a well-formed body", () => {
    const body = "[cat:community-upliftment]\n\nBuild a neighbourhood garden.";
    const { categoryId, description } = parseIdeaBody(body);
    expect(categoryId).toBe("community-upliftment");
    expect(description).toBe("Build a neighbourhood garden.");
  });

  it("returns null category and full body when no prefix", () => {
    const body = "Just a plain idea with no category tag.";
    const { categoryId, description } = parseIdeaBody(body);
    expect(categoryId).toBeNull();
    expect(description).toBe(body);
  });

  it("returns null category for an unknown category slug", () => {
    const body = "[cat:not-a-real-category]\n\nSome description.";
    const { categoryId, description } = parseIdeaBody(body);
    expect(categoryId).toBeNull();
    expect(description).toBe(body);
  });

  it("handles empty description after prefix", () => {
    const body = "[cat:education-equipping]\n\n";
    const { categoryId, description } = parseIdeaBody(body);
    expect(categoryId).toBe("education-equipping");
    expect(description).toBe("");
  });

  it("preserves multi-line descriptions", () => {
    const body = "[cat:care-recovery]\n\nLine one.\nLine two.\nLine three.";
    const { categoryId, description } = parseIdeaBody(body);
    expect(categoryId).toBe("care-recovery");
    expect(description).toBe("Line one.\nLine two.\nLine three.");
  });
});
