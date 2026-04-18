import type { Organisation } from "@/types/db";

/**
 * Subset of {@link Organisation} fields needed for hierarchy traversal.
 * Lets callers pass lean projections without selecting every column.
 */
export type OrgNode = Pick<Organisation, "id" | "name" | "slug"> & {
  parent_org_id?: string | null;
};

export interface OrgTreeNode<T extends OrgNode = OrgNode> {
  org: T;
  children: OrgTreeNode<T>[];
}

const MAX_DEPTH = 50;

/**
 * Builds a forest of rooted trees from a flat list of organisations.
 *
 * - Orgs with `parent_org_id` pointing to an org that is not in the
 *   input list are treated as roots (so partial trees work).
 * - Cycles are defensively broken: any parent chain longer than
 *   {@link MAX_DEPTH} is cut so we never infinite-loop in the UI.
 */
export function buildOrgTree<T extends OrgNode>(orgs: readonly T[]): OrgTreeNode<T>[] {
  const byId = new Map<string, OrgTreeNode<T>>();
  for (const org of orgs) {
    byId.set(org.id, { org, children: [] });
  }

  const roots: OrgTreeNode<T>[] = [];
  for (const node of byId.values()) {
    const parentId = node.org.parent_org_id ?? null;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Stable sort by name at every level for deterministic rendering.
  const sortNodesByNameRecursively = (nodes: OrgTreeNode<T>[]) => {
    nodes.sort((a, b) => a.org.name.localeCompare(b.org.name));
    for (const n of nodes) sortNodesByNameRecursively(n.children);
  };
  sortNodesByNameRecursively(roots);

  return roots;
}

/**
 * Walks the `parent_org_id` chain and returns ancestors nearest-first.
 * Defensive against cycles / broken references.
 */
export function findAncestors<T extends OrgNode>(
  orgs: readonly T[],
  orgId: string,
): T[] {
  const byId = new Map(orgs.map((o) => [o.id, o] as const));
  const out: T[] = [];
  const seen = new Set<string>([orgId]);
  let current = byId.get(orgId)?.parent_org_id ?? null;
  let depth = 0;
  while (current && depth < MAX_DEPTH) {
    if (seen.has(current)) break;
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    out.push(node);
    current = node.parent_org_id ?? null;
    depth += 1;
  }
  return out;
}

/**
 * Returns every descendant of `orgId` (excluding `orgId` itself),
 * in breadth-first order. Cycle-safe via visited set.
 */
export function findDescendants<T extends OrgNode>(
  orgs: readonly T[],
  orgId: string,
): T[] {
  const byParent = new Map<string, T[]>();
  for (const o of orgs) {
    const pid = o.parent_org_id ?? null;
    if (!pid) continue;
    const bucket = byParent.get(pid);
    if (bucket) bucket.push(o);
    else byParent.set(pid, [o]);
  }

  const out: T[] = [];
  const visited = new Set<string>([orgId]);
  const queue: string[] = [orgId];
  let depth = 0;
  while (queue.length > 0 && depth < MAX_DEPTH) {
    const levelSize = queue.length;
    for (let i = 0; i < levelSize; i += 1) {
      const currentId = queue.shift()!;
      const children = byParent.get(currentId) ?? [];
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        out.push(child);
        queue.push(child.id);
      }
    }
    depth += 1;
  }
  return out;
}

/**
 * Returns the immediate siblings of `orgId`: orgs that share its
 * `parent_org_id`, excluding the org itself. Root orgs are considered
 * siblings of each other only when explicitly requested via
 * `includeRoots=true`.
 */
export function findSiblings<T extends OrgNode>(
  orgs: readonly T[],
  orgId: string,
  includeRoots = false,
): T[] {
  const self = orgs.find((o) => o.id === orgId);
  if (!self) return [];
  const parentId = self.parent_org_id ?? null;
  if (parentId === null && !includeRoots) return [];
  return orgs.filter(
    (o) => o.id !== orgId && (o.parent_org_id ?? null) === parentId,
  );
}
