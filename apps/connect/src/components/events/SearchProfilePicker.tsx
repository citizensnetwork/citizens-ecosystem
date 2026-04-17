"use client";

/**
 * Discovery-tags picker — compact multi-select used by event / place forms.
 *
 * Presents the `AUDIENCES` / `NEEDS` / `VIBES` taxonomy from
 * `@/lib/searchProfile` as three collapsible groups of pill chips. The parent
 * owns the `SearchProfile` state and receives updates via `onChange`.
 *
 * Intentionally plain and stateless — no data fetching, no side effects,
 * so it can be dropped into any form without altering submit handlers.
 */

import { useMemo } from "react";
import {
  AUDIENCES,
  NEEDS,
  VIBES,
  type SearchProfile,
  type TagDef,
  type TagSlug,
} from "@/lib/searchProfile";

type Props = {
  value: SearchProfile | null | undefined;
  onChange: (next: SearchProfile) => void;
  className?: string;
};

export default function SearchProfilePicker({ value, onChange, className }: Props) {
  const sel = useMemo(
    () => ({
      audience: new Set(value?.audience ?? []),
      needs: new Set(value?.needs ?? []),
      vibe: new Set(value?.vibe ?? []),
    }),
    [value],
  );

  function toggle(group: "audience" | "needs" | "vibe", slug: TagSlug) {
    const nextSet = new Set(sel[group]);
    if (nextSet.has(slug)) nextSet.delete(slug);
    else nextSet.add(slug);
    const next: SearchProfile = {
      audience: [...(group === "audience" ? nextSet : sel.audience)],
      needs: [...(group === "needs" ? nextSet : sel.needs)],
      vibe: [...(group === "vibe" ? nextSet : sel.vibe)],
      summary: value?.summary,
    };
    // Drop empty arrays so the jsonb value stays tidy.
    if (next.audience && next.audience.length === 0) delete next.audience;
    if (next.needs && next.needs.length === 0) delete next.needs;
    if (next.vibe && next.vibe.length === 0) delete next.vibe;
    onChange(next);
  }

  return (
    <div className={className ?? "space-y-3"}>
      <p className="text-[11px] text-black/60">
        Optional — help people discover this when they search by need or audience.
      </p>
      <TagGroup title="Audience" defs={AUDIENCES} selected={sel.audience} onToggle={(s) => toggle("audience", s)} />
      <TagGroup title="Needs met" defs={NEEDS} selected={sel.needs} onToggle={(s) => toggle("needs", s)} />
      <TagGroup title="Vibe" defs={VIBES} selected={sel.vibe} onToggle={(s) => toggle("vibe", s)} />
    </div>
  );
}

function TagGroup({
  title,
  defs,
  selected,
  onToggle,
}: {
  title: string;
  defs: readonly TagDef[];
  selected: Set<TagSlug>;
  onToggle: (slug: TagSlug) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-black/60">
        {title}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {defs.map((def) => {
          const isActive = selected.has(def.slug);
          return (
            <button
              key={def.slug}
              type="button"
              onClick={() => onToggle(def.slug)}
              aria-pressed={isActive}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] transition " +
                (isActive
                  ? "border-(--gold) bg-(--gold)/15 text-black"
                  : "border-black/15 bg-white/70 text-black/70 hover:bg-white")
              }
            >
              {def.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
