import { describe, it, expect } from "vitest";
import {
  buildOrgTree,
  findAncestors,
  findDescendants,
  findSiblings,
  type OrgNode,
} from "@/lib/orgs/hierarchy";

function node(id: string, name: string, parent_org_id: string | null = null): OrgNode {
  return { id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), parent_org_id };
}

describe("buildOrgTree", () => {
  it("returns an empty forest for empty input", () => {
    expect(buildOrgTree([])).toEqual([]);
  });

  it("treats orgs with no parent as roots", () => {
    const orgs = [node("a", "Alpha"), node("b", "Beta")];
    const tree = buildOrgTree(orgs);
    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.org.id).sort()).toEqual(["a", "b"]);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("nests children under their parent", () => {
    const orgs = [
      node("root", "Parent Co"),
      node("c1", "Child One", "root"),
      node("c2", "Child Two", "root"),
      node("g1", "Grandchild", "c1"),
    ];
    const tree = buildOrgTree(orgs);
    expect(tree).toHaveLength(1);
    expect(tree[0].org.id).toBe("root");
    expect(tree[0].children.map((c) => c.org.id)).toEqual(["c1", "c2"]);
    expect(tree[0].children[0].children[0].org.id).toBe("g1");
  });

  it("sorts siblings alphabetically by name", () => {
    const orgs = [
      node("root", "Parent Co"),
      node("z", "Zeta", "root"),
      node("a", "Alpha", "root"),
      node("m", "Mu", "root"),
    ];
    const tree = buildOrgTree(orgs);
    expect(tree[0].children.map((c) => c.org.name)).toEqual(["Alpha", "Mu", "Zeta"]);
  });

  it("treats orgs whose parent is missing as roots (partial trees)", () => {
    const orgs = [node("orphan", "Orphan", "missing-parent")];
    const tree = buildOrgTree(orgs);
    expect(tree).toHaveLength(1);
    expect(tree[0].org.id).toBe("orphan");
  });

  it("never infinite-loops on a self-referential row", () => {
    // Should not happen thanks to the SQL CHECK, but the UI must stay safe.
    const orgs = [node("a", "Alpha", "a")];
    const tree = buildOrgTree(orgs);
    expect(tree).toHaveLength(1);
    expect(tree[0].org.id).toBe("a");
    expect(tree[0].children).toEqual([]);
  });
});

describe("findAncestors", () => {
  const orgs = [
    node("root", "Root"),
    node("mid", "Mid", "root"),
    node("leaf", "Leaf", "mid"),
  ];

  it("returns ancestors nearest-first", () => {
    expect(findAncestors(orgs, "leaf").map((o) => o.id)).toEqual(["mid", "root"]);
  });

  it("returns [] for a root", () => {
    expect(findAncestors(orgs, "root")).toEqual([]);
  });

  it("returns [] for an unknown org id", () => {
    expect(findAncestors(orgs, "does-not-exist")).toEqual([]);
  });

  it("is cycle-safe", () => {
    const cyclic = [
      node("a", "A", "b"),
      node("b", "B", "a"),
    ];
    // Must terminate.
    const chain = findAncestors(cyclic, "a");
    expect(chain.length).toBeLessThanOrEqual(2);
  });
});

describe("findDescendants", () => {
  const orgs = [
    node("root", "Root"),
    node("a", "A", "root"),
    node("b", "B", "root"),
    node("a1", "A1", "a"),
    node("a2", "A2", "a"),
  ];

  it("returns every descendant, BFS order", () => {
    const ids = findDescendants(orgs, "root").map((o) => o.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("a1");
    expect(ids).toContain("a2");
    expect(ids).toHaveLength(4);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("a1"));
  });

  it("returns [] for a leaf", () => {
    expect(findDescendants(orgs, "a1")).toEqual([]);
  });
});

describe("findSiblings", () => {
  const orgs = [
    node("root", "Root"),
    node("other-root", "Other Root"),
    node("a", "A", "root"),
    node("b", "B", "root"),
    node("c", "C", "root"),
  ];

  it("returns orgs sharing the same parent, excluding self", () => {
    const siblings = findSiblings(orgs, "a").map((o) => o.id).sort();
    expect(siblings).toEqual(["b", "c"]);
  });

  it("returns no siblings for a root by default", () => {
    expect(findSiblings(orgs, "root")).toEqual([]);
  });

  it("treats other roots as siblings when includeRoots=true", () => {
    const siblings = findSiblings(orgs, "root", true).map((o) => o.id);
    expect(siblings).toEqual(["other-root"]);
  });
});
