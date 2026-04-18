"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useOrgStore } from "@/stores/orgStore";

type FlatHit = {
  href: string;
  title: string;
  subtitle?: string;
  group: "Activities" | "Projects" | "Goals";
};

interface ActivityHit {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  type: string | null;
  similarity_score: number;
}
interface ProjectHit {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  similarity_score: number;
}
interface GoalHit {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  similarity_score: number;
}
interface SearchResponse {
  q: string;
  activities?: ActivityHit[];
  projects?: ProjectHit[];
  goals?: GoalHit[];
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Phase 16b: Global trigram search dropdown wired to /api/search.
 *
 * Renders a debounced search input in the Navbar that returns hits
 * grouped by entity type (activities / projects / goals) with deep
 * links into each entity's detail page within the active org.
 */
export function GlobalSearchBar() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params?.orgSlug as string | undefined;
  const currentOrg = useOrgStore((s) => s.currentOrg);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Outside-click closes the dropdown.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced fetch.
  useEffect(() => {
    if (!currentOrg) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search?org_id=${encodeURIComponent(currentOrg.id)}&q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Search failed");
        }
        const json = (await res.json()) as SearchResponse;
        setResults(json);
        setOpen(true);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults(null);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentOrg]);

  // Flatten hits in render order so keyboard nav can step through them.
  const flatHits = useMemo<FlatHit[]>(() => {
    if (!results || !orgSlug) return [];
    const acc: FlatHit[] = [];
    for (const a of results.activities ?? []) {
      acc.push({
        href: `/${orgSlug}/activities/${a.id}`,
        title: a.title,
        subtitle: a.date ?? a.type ?? undefined,
        group: "Activities",
      });
    }
    for (const p of results.projects ?? []) {
      acc.push({
        href: `/${orgSlug}/projects/${p.id}`,
        title: p.name,
        subtitle: p.status ?? undefined,
        group: "Projects",
      });
    }
    for (const g of results.goals ?? []) {
      acc.push({
        href: `/${orgSlug}/goals/${g.id}`,
        title: g.title,
        subtitle: g.status ?? undefined,
        group: "Goals",
      });
    }
    return acc;
  }, [results, orgSlug]);

  // Reset highlight whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || flatHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatHits.length) % flatHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flatHits[activeIndex];
      if (hit) {
        setOpen(false);
        router.push(hit.href);
      }
    }
  }

  if (!orgSlug || !currentOrg) return null;

  const totalHits = flatHits.length;

  return (
    <div ref={containerRef} className="relative w-72">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search activities, projects, goals…"
        aria-label="Global search"
        aria-autocomplete="list"
        aria-controls="gsearch-listbox"
        aria-activedescendant={
          open && flatHits[activeIndex]
            ? `gsearch-hit-${activeIndex}`
            : undefined
        }
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 pl-8 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      {loading && (
        <span
          className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-pulse text-xs text-text-secondary"
          aria-hidden="true"
        >
          …
        </span>
      )}

      {open && (results || error) && (
        <div
          role="listbox"
          id="gsearch-listbox"
          aria-label="Search results"
          className="absolute right-0 z-50 mt-1 max-h-[70vh] w-[28rem] overflow-y-auto rounded-md border border-border bg-surface shadow-xl"
        >
          {error && (
            <p
              role="alert"
              className="px-3 py-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}
          {results && totalHits === 0 && !error && (
            <p className="px-3 py-3 text-sm text-text-secondary">
              No matches for &ldquo;{results.q}&rdquo;.
            </p>
          )}
          {(
            ["Activities", "Projects", "Goals"] as FlatHit["group"][]
          ).map((group) => {
            const groupHits = flatHits
              .map((h, idx) => ({ h, idx }))
              .filter(({ h }) => h.group === group);
            if (groupHits.length === 0) return null;
            return (
              <SearchGroup key={group} label={group}>
                {groupHits.map(({ h, idx }) => (
                  <SearchLink
                    key={`${group}-${idx}`}
                    id={`gsearch-hit-${idx}`}
                    href={h.href}
                    title={h.title}
                    subtitle={h.subtitle}
                    active={idx === activeIndex}
                    onSelect={() => setOpen(false)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  />
                ))}
              </SearchGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="border-b border-border bg-surface-alt/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

function SearchLink({
  id,
  href,
  title,
  subtitle,
  active,
  onSelect,
  onMouseEnter,
}: {
  id?: string;
  href: string;
  title: string;
  subtitle?: string;
  active?: boolean;
  onSelect: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <li>
      <Link
        id={id}
        href={href}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
        role="option"
        aria-selected={active}
        className={`block px-3 py-2 text-sm text-text-primary hover:bg-surface-alt ${
          active ? "bg-surface-alt" : ""
        }`}
      >
        <span className="block truncate font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-text-secondary">
            {subtitle}
          </span>
        )}
      </Link>
    </li>
  );
}
