"use client";

/**
 * PersonalizationPanel — user-facing display of their computed interest
 * percentages.  Replaces the old static ProfileInterests section (April
 * 2026 — "maybe storing this changing data ... kills a few birds").
 *
 * The values come from `profiles.preferences.percentages`, which is
 * maintained by the server's percentage engine (Phase E).  This component
 * is purely presentational — it never writes, just displays.
 *
 * If the user hasn't interacted enough for the engine to produce values,
 * we surface a friendly empty state that nudges them toward the map.
 */

import Link from "next/link";
import type { EventCategory, PlaceCategory } from "@/types/db";
import { CATEGORY_LABELS, CATEGORY_HEX } from "@/lib/categories";

type CategorySlug = EventCategory | PlaceCategory;

type Props = {
  percentages: Partial<Record<CategorySlug, number>> | null | undefined;
};

export default function PersonalizationPanel({ percentages }: Props) {
  const entries = Object.entries(percentages ?? {})
    .filter(([, v]) => typeof v === "number" && (v as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 8) as [CategorySlug, number][];

  return (
    <section className="mb-8 rounded-xl border border-black/8 bg-white/50 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">What we&apos;ve learned about you</h2>
          <p className="mt-1 text-xs text-black/50">
            Builds up quietly as you explore.  Powers the &quot;For me in this
            area&quot; pill on the map.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 bg-white/50 p-4 text-center">
          <p className="text-sm text-black/60">
            Nothing yet — tap a few events on the map and we&apos;ll start
            matching the kind of gatherings you lean toward.
          </p>
          <Link
            href="/events"
            className="mt-3 inline-block text-sm text-(--gold) hover:underline"
          >
            Open the map →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {entries.map(([slug, pct]) => {
            const label =
              (CATEGORY_LABELS as Record<string, string>)[slug] ??
              slug.replace(/-/g, " ");
            const color =
              (CATEGORY_HEX as Record<string, string>)[slug] ?? "#C9A84C";
            const width = Math.max(4, Math.min(100, Math.round(pct)));
            return (
              <li key={slug}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-black/80">
                    {label}
                  </span>
                  <span className="tabular-nums text-black/60">{width}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
