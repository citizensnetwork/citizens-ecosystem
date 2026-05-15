"use client";

/**
 * FEAT-03 — Organisations search panel.
 *
 * Renders inside the bottom search bar when the user toggles into
 * "Organisations" mode. Talks to `/api/contributors/search` (which calls
 * the `search_contributors` RPC) and renders compact contributor cards
 * that link into the contributor profile drawer (`/c/[slug]`).
 *
 * Match tolerance: the RPC uses pg_trgm `word_similarity >= 0.3` so a
 * roughly 30% typo is still matched (e.g. "evry naton" → "Every Nation
 * Mooikloof"). The UI itself is just a debounced query + filters; the
 * fuzzy logic lives in Postgres.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type ContributorKind = "ministry" | "organization" | "business";

/**
 * Compact contributor-kind labels for tight UI rows. Intentionally
 * different from the canonical `CONTRIBUTOR_KIND_LABELS` in `types/db.ts`
 * (which expands "organization" to "Organization") because in this dense
 * search list "Org" reads better and keeps the row from wrapping on
 * narrow phones. If you change one, consider whether the other should
 * change too.
 */
const KIND_BADGE_LABEL: Record<ContributorKind, string> = {
  organization: "Org",
  ministry: "Ministry",
  business: "Business",
};

type SearchHit = {
  id: string;
  full_name: string | null;
  contributor_slug: string | null;
  contributor_kind: ContributorKind | null;
  logo_url: string | null;
  avatar_url: string | null;
  physical_address: string | null;
  bio: string | null;
  followers_count: number;
  similarity: number;
};

const KIND_OPTIONS: Array<{ value: ContributorKind; label: string }> = [
  { value: "ministry", label: "Ministry" },
  { value: "organization", label: "Organisation" },
  { value: "business", label: "Business" },
];

type Props = {
  /** Free-text query coming from the bottom search input. */
  query: string;
  /** Called when the user opens a contributor (so the parent can close
   *  the search bar / collapse the panel). Optional. */
  onSelect?: () => void;
};

export default function OrgSearchPanel({ query, onSelect }: Props) {
  // Filters live entirely inside the panel — the parent only owns the
  // free-text input. Keeping filter state local means the parent's
  // existing search-vs-category logic isn't disturbed.
  const [kinds, setKinds] = useState<Set<ContributorKind>>(new Set());
  const [location, setLocation] = useState("");
  const [sort, setSort] = useState<"auto" | "followers" | "similarity">("auto");

  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the query + location filter so each keystroke doesn't fire a
  // request. 220ms feels responsive while collapsing typing bursts.
  const debouncedQ = useDebounced(query, 220);
  const debouncedLocation = useDebounced(location, 220);

  // Abort in-flight fetch when the inputs change again — prevents stale
  // results from overwriting fresh ones if the network is slow.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (kinds.size > 0) params.set("kinds", [...kinds].join(","));
    if (debouncedLocation.trim()) params.set("location", debouncedLocation.trim());
    if (sort !== "auto") params.set("sort", sort);
    params.set("limit", "25");

    setLoading(true);
    setError(null);

    fetch(`/api/contributors/search?${params.toString()}`, {
      signal: ctrl.signal,
      // No credentials needed — endpoint is anon-readable. Default `same-origin`
      // is fine; we don't pass `cache: 'no-store'` so the browser can re-use
      // the response within its 15s `private` cache window.
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(res.status === 429 ? "Slow down a moment…" : "Search failed");
        }
        return res.json() as Promise<{ data: SearchHit[] }>;
      })
      .then((body) => {
        setResults(body.data ?? []);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [debouncedQ, kinds, debouncedLocation, sort]);

  const hasFilters =
    debouncedQ.trim().length > 0 ||
    kinds.size > 0 ||
    debouncedLocation.trim().length > 0;

  const empty = !loading && !error && results.length === 0;

  return (
    <div
      className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-(--gold)/35 bg-white/95 p-3 shadow-xl backdrop-blur"
      role="region"
      aria-label="Organisation search results"
    >
      {/* ── Filter row ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {KIND_OPTIONS.map((opt) => {
          const active = kinds.has(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setKinds((prev) => {
                  const next = new Set(prev);
                  if (next.has(opt.value)) next.delete(opt.value);
                  else next.add(opt.value);
                  return next;
                });
              }}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${
                active
                  ? "border-(--gold) bg-(--gold)/15 text-black"
                  : "border-black/10 bg-white text-black/70 hover:bg-black/5"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          aria-label="Filter by location (city, suburb, address)"
          className="ml-auto min-w-0 max-w-[42%] flex-1 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] text-black placeholder:text-black/40 focus:border-black/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            setSort((s) => (s === "followers" ? "similarity" : s === "similarity" ? "auto" : "followers"))
          }
          aria-label={`Sort: ${sortLabel(sort)}`}
          className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-black/70 transition hover:bg-black/5 active:scale-95"
        >
          ↕ {sortLabel(sort)}
        </button>
      </div>

      {/* ── Results ─────────────────────────────────────────────── */}
      <div
        className="flex max-h-[42dvh] flex-col gap-1 overflow-y-auto pr-1"
        role="list"
        aria-busy={loading}
      >
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {error}
          </div>
        )}
        {loading && results.length === 0 && (
          <div className="px-2 py-1 text-[11px] italic text-black/50">
            Searching…
          </div>
        )}
        {empty && (
          <div className="px-2 py-2 text-[11px] italic text-black/60">
            {hasFilters
              ? "No organisations match that search."
              : "Start typing to find an organisation, or pick a filter."}
          </div>
        )}
        {results.map((hit) => (
          <OrgRow key={hit.id} hit={hit} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function sortLabel(s: "auto" | "followers" | "similarity"): string {
  if (s === "followers") return "Most followed";
  if (s === "similarity") return "Best match";
  return "Auto";
}

function OrgRow({ hit, onSelect }: { hit: SearchHit; onSelect?: () => void }) {
  if (!hit.contributor_slug) return null;
  const name = hit.full_name ?? "Unnamed contributor";
  const logo = hit.logo_url || hit.avatar_url || null;
  const kindLabel = hit.contributor_kind
    ? KIND_BADGE_LABEL[hit.contributor_kind]
    : null;

  return (
    <Link
      href={`/c/${encodeURIComponent(hit.contributor_slug)}`}
      onClick={onSelect}
      role="listitem"
      className="flex items-center gap-2.5 rounded-xl border border-black/5 bg-white px-2 py-1.5 text-left transition hover:border-(--gold)/40 hover:bg-(--gold)/5 active:scale-[0.99]"
    >
      <span className="relative flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full border border-black/5 bg-black/5">
        {logo ? (
          <Image
            src={logo}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-(--gold)"
            aria-hidden="true"
          >
            <polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2" />
          </svg>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-black">
            {name}
          </span>
          {kindLabel && (
            <span className="rounded-full bg-black/5 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-black/60">
              {kindLabel}
            </span>
          )}
        </span>
        <span className="truncate text-[10.5px] text-black/55">
          {hit.physical_address ?? "Location not set"}
        </span>
      </span>
      <span className="flex flex-none items-center gap-1 text-[10.5px] text-black/60">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="h-3 w-3 text-(--gold)"
        >
          <path d="M12 21s-8-5-8-11a8 8 0 1 1 16 0c0 6-8 11-8 11z" />
        </svg>
        {formatFollowers(hit.followers_count)}
      </span>
    </Link>
  );
}

function formatFollowers(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n / 1_000)}k`;
}

/** Local debounce helper — kept inline to avoid yet another shared hook. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
