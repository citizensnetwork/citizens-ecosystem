"use client";

import { useState } from "react";
import Link from "next/link";

interface Place {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  status: string | null;
  created_at: string;
  place_follows: { count: number }[];
}

interface Props {
  slug: string;
  places: Place[];
}

export default function PlacesDashboardClient({ slug, places }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = places.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[400px]">
      {/* Left: list (60%) */}
      <div className="w-full lg:w-3/5 overflow-y-auto pr-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Your places ({places.length})</h2>
          <Link
            href="/places/new"
            className="text-sm px-3 py-1.5 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
          >
            + New place
          </Link>
        </div>

        {places.length === 0 ? (
          <div className="text-center py-16 text-[--foreground-soft]">
            <p className="text-sm">No places yet.</p>
            <Link
              href="/places/new"
              className="mt-3 inline-block text-sm text-[--gold] hover:underline"
            >
              Create your first place →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {places.map((place) => {
              const followers = place.place_follows?.[0]?.count ?? 0;
              return (
                <li key={place.id}>
                  <button
                    onClick={() => setSelectedId(place.id === selectedId ? null : place.id)}
                    className={[
                      "w-full text-left surface-card rounded-xl p-3 flex gap-3 items-start transition-colors",
                      place.id === selectedId
                        ? "border-[--gold] bg-[--gold-soft]"
                        : "hover:border-[--gold]/40",
                    ].join(" ")}
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-[--surface-muted] flex-shrink-0">
                      {place.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={place.image_url}
                          alt={place.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">
                          📍
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{place.name}</div>
                      {place.address && (
                        <div className="text-xs text-[--foreground-soft] truncate">{place.address}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {place.category && (
                          <span className="text-xs bg-[--surface-muted] px-2 py-0.5 rounded-full">
                            {place.category}
                          </span>
                        )}
                        <span className="text-xs text-[--foreground-soft]">
                          {followers} follower{followers !== 1 ? "s" : ""}
                        </span>
                        {place.status && place.status !== "published" && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full capitalize">
                            {place.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Right: preview panel (40%) — desktop only */}
      <aside className="hidden lg:flex w-2/5 flex-col surface-card rounded-2xl overflow-hidden">
        {selected ? (
          <>
            <div className="h-44 bg-[--surface-muted] overflow-hidden flex-shrink-0">
              {selected.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.image_url}
                  alt={selected.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">
                  📍
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              {selected.address && (
                <p className="text-sm text-[--foreground-soft]">{selected.address}</p>
              )}
              {selected.category && (
                <p className="text-sm">
                  <span className="font-medium">Category:</span>{" "}
                  <span className="text-[--foreground-soft]">{selected.category}</span>
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Link
                  href={`/places/${selected.id}`}
                  className="flex-1 text-center text-sm py-2 rounded-xl border border-[--border] hover:border-[--gold] transition-colors"
                >
                  View
                </Link>
                <Link
                  href={`/places/${selected.id}/edit`}
                  className="flex-1 text-center text-sm py-2 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
                >
                  Edit
                </Link>
              </div>
              <div className="pt-2 border-t border-[--border]">
                <Link
                  href={`/c/${slug}/dashboard/places/${selected.id}/services`}
                  className="text-sm text-[--gold] hover:underline"
                >
                  Manage services →
                </Link>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[--foreground-soft]">
            Select a place to preview
          </div>
        )}
      </aside>
    </div>
  );
}
