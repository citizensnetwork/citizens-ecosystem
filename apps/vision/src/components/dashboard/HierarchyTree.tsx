"use client";

import { useEffect, useState } from "react";

interface OrgNode {
  id: string;
  name: string;
  slug: string;
  parent_org_id?: string | null;
}

interface HierarchyResponse {
  self: OrgNode;
  ancestors: OrgNode[];
  siblings: OrgNode[];
  children: OrgNode[];
  descendants: OrgNode[];
}

interface HierarchyTreeProps {
  orgId: string;
}

/**
 * Read-only view of an organisation's position in the parent/child
 * hierarchy introduced in Phase 13. Admin controls for reassigning
 * `parent_org_id` are deferred to a later phase.
 */
export function HierarchyTree({ orgId }: HierarchyTreeProps) {
  const [data, setData] = useState<HierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/hierarchy`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to load hierarchy");
        }
        const json = (await res.json()) as HierarchyResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load hierarchy");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
        Loading hierarchy…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-sm text-red-300"
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { self, ancestors, siblings, children } = data;
  const isRoot = ancestors.length === 0;
  const hasChildren = children.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">
          Organisation hierarchy
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          Where <span className="font-medium">{self.name}</span> sits in the
          parent/child organisation tree.
        </p>
      </div>

      {/* Ancestors */}
      <section aria-labelledby="hierarchy-ancestors">
        <h3
          id="hierarchy-ancestors"
          className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary"
        >
          Parent chain
        </h3>
        {isRoot ? (
          <p className="text-sm text-text-secondary">
            This is a top-level organisation.
          </p>
        ) : (
          <ol className="space-y-1">
            {[...ancestors].reverse().map((a, idx) => (
              <li
                key={a.id}
                className="flex items-center gap-2 text-sm text-text-primary"
                style={{ paddingLeft: `${idx * 16}px` }}
              >
                <span className="text-text-secondary">↳</span>
                <span>{a.name}</span>
              </li>
            ))}
            <li
              className="flex items-center gap-2 text-sm font-semibold text-accent"
              style={{ paddingLeft: `${ancestors.length * 16}px` }}
            >
              <span className="text-text-secondary">↳</span>
              <span>{self.name}</span>
            </li>
          </ol>
        )}
      </section>

      {/* Siblings */}
      {siblings.length > 0 && (
        <section aria-labelledby="hierarchy-siblings">
          <h3
            id="hierarchy-siblings"
            className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary"
          >
            Sibling organisations ({siblings.length})
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {siblings.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text-primary"
              >
                {s.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Children */}
      <section aria-labelledby="hierarchy-children">
        <h3
          id="hierarchy-children"
          className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary"
        >
          Sub-organisations ({children.length})
        </h3>
        {hasChildren ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              >
                {c.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            No sub-organisations yet.
          </p>
        )}
      </section>
    </div>
  );
}
