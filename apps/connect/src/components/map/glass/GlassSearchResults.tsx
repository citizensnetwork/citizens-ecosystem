"use client";

import type { ReactNode } from "react";
import { CalendarDays, MapPin, Building2, Search } from "lucide-react";
import type { Event, Place, Profile } from "@/types/db";
import { CATEGORY_HEX } from "@/lib/categories";

type Props = {
  query: string;
  events: Event[];
  places: Place[];
  contributors: Profile[];
  onSelectEvent: (event: Event) => void;
  onSelectPlace: (place: Place) => void;
  onSelectContributor: (slug: string) => void;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Figma-styled glass results dropdown for the Community Map header search.
 * Renders the already-ranked events, places and contributor (organisation)
 * matches. Uses onMouseDown so selection fires before the input blur closes
 * the panel.
 */
export default function GlassSearchResults({
  query,
  events,
  places,
  contributors,
  onSelectEvent,
  onSelectPlace,
  onSelectContributor,
}: Props) {
  const empty = events.length === 0 && places.length === 0 && contributors.length === 0;

  return (
    <div
      className="cc-glass cc-glass-enter absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl p-1.5 scrollbar-hide"
      role="listbox"
      aria-label="Search results"
    >
      {empty ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-black/45">
          <Search className="h-4 w-4" />
          No matches for “{query.trim()}”
        </div>
      ) : (
        <>
          {events.length > 0 && (
            <Section label="Events">
              {events.map((e) => (
                <Row
                  key={`e-${e.id}`}
                  onSelect={() => onSelectEvent(e)}
                  icon={
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        background: `${e.category ? CATEGORY_HEX[e.category] : "#C9A84C"}1f`,
                        color: e.category ? CATEGORY_HEX[e.category] : "#C9A84C",
                      }}
                    >
                      <CalendarDays className="h-4 w-4" />
                    </span>
                  }
                  title={e.title}
                  meta={formatDate(e.date)}
                />
              ))}
            </Section>
          )}

          {places.length > 0 && (
            <Section label="Places">
              {places.map((p) => (
                <Row
                  key={`p-${p.id}`}
                  onSelect={() => onSelectPlace(p)}
                  icon={
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--gold)/12 text-(--gold)">
                      <MapPin className="h-4 w-4" />
                    </span>
                  }
                  title={p.name}
                  meta="Place"
                />
              ))}
            </Section>
          )}

          {contributors.length > 0 && (
            <Section label="Organisations">
              {contributors.map((c) => (
                <Row
                  key={`c-${c.id}`}
                  onSelect={() => c.contributor_slug && onSelectContributor(c.contributor_slug)}
                  icon={
                    c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--gold)/12 text-(--gold)">
                        <Building2 className="h-4 w-4" />
                      </span>
                    )
                  }
                  title={c.full_name}
                  meta="Organisation"
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  onSelect,
  icon,
  title,
  meta,
}: {
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  meta?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-black/[0.04]"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-black">{title}</span>
      {meta && <span className="flex-shrink-0 text-xs text-black/45">{meta}</span>}
    </button>
  );
}
