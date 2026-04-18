"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { findDescendants } from "@/lib/orgs/hierarchy";
import type { Organisation } from "@/types/db";

type Candidate = Pick<Organisation, "id" | "name" | "slug" | "parent_org_id">;

interface HierarchySettingsClientProps {
  org: Organisation;
  candidates: Candidate[];
  canEdit: boolean;
}

export function HierarchySettingsClient({
  org,
  candidates,
  canEdit,
}: HierarchySettingsClientProps) {
  const router = useRouter();
  const [parentId, setParentId] = useState<string>(org.parent_org_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Exclude self and any descendant — picking either would create a cycle
  // and the DB trigger would reject it. Filter client-side too so the
  // option simply isn't visible.
  const validCandidates = useMemo(() => {
    const descendants = new Set(
      findDescendants(candidates, org.id).map((c) => c.id),
    );
    return candidates.filter(
      (c) => c.id !== org.id && !descendants.has(c.id),
    );
  }, [candidates, org.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_org_id: parentId === "" ? null : parentId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to save");
      }
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <label
          htmlFor="parent_org_id"
          className="block text-sm font-medium text-text-primary"
        >
          Parent organisation
        </label>
        <select
          id="parent_org_id"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={!canEdit || saving}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        >
          <option value="">— Top-level organisation —</option>
          {validCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-secondary">
          You can only choose orgs that wouldn&apos;t create a cycle.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-700/50 bg-green-900/30 p-3 text-sm text-green-300">
          Hierarchy updated.
        </p>
      )}

      {!canEdit && (
        <p className="text-xs text-text-secondary">
          Only org admins can change the parent organisation.
        </p>
      )}

      <button
        type="submit"
        disabled={!canEdit || saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
