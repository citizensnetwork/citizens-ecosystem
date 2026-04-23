"use client";

/**
 * TagModerator — admin-only UI for the moderation queue.  Lists all
 * tags with usage counts, supports search, and exposes hide/unhide +
 * official-flag toggles.  All writes go through `/api/admin/tags/[id]`
 * which checks the admin role at the API layer in addition to DB RLS.
 */

import { useMemo, useState } from "react";
import type { EventTag } from "@/types/db";

type Props = {
  initialTags: EventTag[];
};

export default function TagModerator({ initialTags }: Props) {
  const [tags, setTags] = useState<EventTag[]>(initialTags);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q),
    );
  }, [tags, filter]);

  async function patchTag(id: string, patch: Partial<Pick<EventTag, "is_hidden" | "is_official">>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "Update failed");
        return;
      }
      const updated = json.tag as EventTag;
      setTags((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.warn("[TagModerator] patch failed", err);
      setError("Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Tags</h2>
        <p className="text-xs text-black/50">
          Hidden tags stay on their assigned events (for audit history) but
          disappear from search and new assignment.
        </p>
      </div>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search tags…"
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-black/30"
      />

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/40">No tags.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
          {filtered.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${tag.is_hidden ? "text-black/40 line-through" : "text-black"}`}>
                    {tag.label}
                  </span>
                  {tag.is_official && (
                    <span className="rounded bg-(--gold-soft,#f5ecd3) px-1.5 text-[10px] uppercase tracking-wider text-black/70">
                      Official
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-black/45">
                  /{tag.slug} · {tag.usage_count} uses
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === tag.id}
                  onClick={() => patchTag(tag.id, { is_official: !tag.is_official })}
                  className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70 hover:bg-black/5 disabled:opacity-50"
                >
                  {tag.is_official ? "Unofficial" : "Make Official"}
                </button>
                <button
                  type="button"
                  disabled={busyId === tag.id}
                  onClick={() => patchTag(tag.id, { is_hidden: !tag.is_hidden })}
                  className={`rounded-md px-2 py-1 text-xs text-white disabled:opacity-50 ${
                    tag.is_hidden
                      ? "bg-black/60 hover:bg-black/70"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {tag.is_hidden ? "Unhide" : "Hide"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
