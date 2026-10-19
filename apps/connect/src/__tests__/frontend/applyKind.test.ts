/**
 * Issue #143: the Apply wizard asks what kind of Contributor someone is.
 *
 * The four values are the database's (migration 173). The words are the
 * citizen-facing ones already on the card and the map. An individual is
 * spoken to as a person; the other three kinds keep the wizard's old copy.
 * "Your ministry" is the empty-name fallback for the ministry kind only.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Kind = "ministry" | "organization" | "business" | "individual";
type About = { title: string; nameLabel: string; namePlaceholder: string; fallbackName: string };
type Parts = {
  contributorKind: (value: unknown) => Kind;
  contributorKindLabel: (value: unknown) => string;
  aboutCopy: (kind: unknown) => About;
  CONTRIBUTOR_KINDS: { value: Kind; label: string }[];
};

let parts: Parts;
beforeAll(() => {
  const win = loadFrontend("apply.jsx", {
    UI: {
      cx: () => "",
      Field: () => null,
      Input: () => null,
      Textarea: () => null,
      Button: () => null,
      Toggle: () => null,
      MediaPicker: () => null,
      Stepper: () => null,
      Avatar: () => null,
      inputCls: "",
    },
    Icon: () => null,
    DATA: { SOCIAL_PLATFORMS: [] },
  });
  parts = win.ApplyParts as Parts;
});

const OLD_COPY: About = {
  title: "About your ministry",
  nameLabel: "Organisation / ministry name",
  namePlaceholder: "e.g. New Wine Fellowship",
  fallbackName: "Your ministry",
};

describe("ApplyParts contributor kind", () => {
  it("offers the four kinds, with the citizen-facing spelling of organisation", () => {
    expect(parts.CONTRIBUTOR_KINDS.map((k) => k.value)).toEqual([
      "ministry",
      "organization",
      "business",
      "individual",
    ]);
    expect(parts.contributorKindLabel("organization")).toBe("Organisation");
    expect(parts.contributorKindLabel("individual")).toBe("Individual");
  });

  it("treats a missing or unknown kind as ministry", () => {
    expect(parts.contributorKind(undefined)).toBe("ministry");
    expect(parts.contributorKind(null)).toBe("ministry");
    expect(parts.contributorKind("")).toBe("ministry");
    expect(parts.contributorKind("church")).toBe("ministry");
    expect(parts.contributorKind("individual")).toBe("individual");
  });

  it("keeps the old step-1 copy for ministry, organisation and business", () => {
    for (const kind of ["ministry", "organization", "business"] as const) {
      const copy = parts.aboutCopy(kind);
      expect(copy.title).toBe(OLD_COPY.title);
      expect(copy.nameLabel).toBe(OLD_COPY.nameLabel);
      expect(copy.namePlaceholder).toBe(OLD_COPY.namePlaceholder);
    }
  });

  it("speaks to an individual as a person", () => {
    expect(parts.aboutCopy("individual")).toEqual({
      title: "About you",
      nameLabel: "Your name",
      namePlaceholder: "e.g. your name",
      fallbackName: "Your name",
    });
  });

  it('uses "Your ministry" as the empty-name fallback only for a ministry', () => {
    expect(parts.aboutCopy("ministry").fallbackName).toBe("Your ministry");
    expect(parts.aboutCopy("organization").fallbackName).toBe("Your organisation");
    expect(parts.aboutCopy("business").fallbackName).toBe("Your business");
    expect(parts.aboutCopy("individual").fallbackName).not.toBe("Your ministry");
    expect(parts.aboutCopy("nope").fallbackName).toBe("Your ministry");
  });
});

describe("the wizard sends the kind, and does not grow a step", () => {
  const app = join(process.cwd(), "src/frontend/app");
  const read = (file: string) => readFileSync(join(app, file), "utf8");

  it("posts contributor_kind from submitApplication", () => {
    const store = read("store.jsx");
    const start = store.indexOf("const submitApplication");
    const body = store.slice(start, store.indexOf("const reviewApplication", start));
    expect(body).toContain("contributor_kind: kind");
    expect(body).toContain("contributorKindValue(form.kind)");
  });

  it("the pending editor saves the same field the PATCH route already accepts", () => {
    const pending = read("pending-application.jsx");
    expect(pending).toContain("contributor_kind: kind");
    expect(pending).toContain("ApplyParts.KindSelect");
    expect(pending).toContain("aboutCopy(f.kind).nameLabel");
  });
});
