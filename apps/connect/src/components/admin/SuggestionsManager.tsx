"use client";

/**
 * SuggestionsManager — admin-side list of platform suggestions with inline
 * status updates and optional written response.  Each PATCH posts to
 * /api/suggestions/[id]; when status flips to `actioned` or `declined`
 * the server emits a `suggestion_response` notification to the submitter.
 *
 * Page-URL is the most useful context bit: A57 in the plan said capture
 * the surface / event / place the suggestion came from. We render it as a
 * clickable internal link when same-origin, plain text otherwise (an
 * external href on an admin surface is a phishing risk).
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

export type SuggestionRow = {
  id: string;
  title: string;
  body: string;
  page_url: string;
  status: "open" | "in_review" | "actioned" | "declined";
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  submitter_id: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
};

type ActionableStatus = "in_review" | "actioned" | "declined";

const STATUS_LABEL: Record<SuggestionRow["status"], string> = {
  open: "Open",
  in_review: "In review",
  actioned: "Actioned",
  declined: "Declined",
};

const STATUS_PILL: Record<SuggestionRow["status"], string> = {
  open: "bg-amber-50 text-amber-800",
  in_review: "bg-blue-50 text-blue-800",
  actioned: "bg-emerald-50 text-emerald-800",
  declined: "bg-neutral-100 text-neutral-700",
};

export default function SuggestionsManager({ rows }: { rows: SuggestionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-black/10 bg-white p-6 text-center text-sm text-black/60">
        No suggestions in this view.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((s) => (
        <SuggestionCard key={s.id} row={s} />
      ))}
    </ul>
  );
}

function SuggestionCard({ row }: { row: SuggestionRow }) {
  const [status, setStatus] = useState<SuggestionRow["status"]>(row.status);
  const [response, setResponse] = useState(row.admin_response ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isResolved = status === "actioned" || status === "declined";

  // Render the captured page_url as an internal Next link when same-origin,
  // plain text otherwise. Resolved in a post-mount effect to avoid SSR/CSR
  // hydration mismatch (window is undefined during SSR).
  const [internalPath, setInternalPath] = useState<string | null>(null);
  useEffect(() => {
    setInternalPath(safeInternalPath(row.page_url));
  }, [row.page_url]);

  function patchStatus(next: ActionableStatus, withResponse: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const payload: { status: ActionableStatus; admin_response?: string } = {
          status: next,
        };
        if (withResponse && response.trim()) {
          payload.admin_response = response.trim();
        }
        const res = await fetch(`/api/suggestions/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Failed to update suggestion.");
          return;
        }
        setStatus(next);
      } catch {
        setError("Network error.");
      }
    });
  }

  return (
    <li className="rounded-xl border border-black/10 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-black/60">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${STATUS_PILL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <time dateTime={row.created_at}>
          {new Date(row.created_at).toLocaleString()}
        </time>
        {row.resolved_at && (
          <>
            <span>·</span>
            <span className="text-black/55">
              resolved {new Date(row.resolved_at).toLocaleDateString()}
            </span>
          </>
        )}
      </div>

      <h3 className="text-sm font-semibold text-black">{row.title}</h3>

      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-black/80">
        {row.body}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/60">
        <span>Submitted by</span>
        {row.submitter_id ? (
          <Link href={`/profile/${row.submitter_id}`} className="underline">
            {row.submitter_name || row.submitter_email || "User"}
          </Link>
        ) : (
          <span className="italic text-black/50">Anonymous</span>
        )}
        <span>·</span>
        <span>From</span>
        {internalPath ? (
          <Link
            href={internalPath}
            className="underline text-[color:var(--gold,#D4AF37)]"
            title={row.page_url}
          >
            {internalPath}
          </Link>
        ) : (
          <span className="text-black/50" title={row.page_url}>
            (external)
          </span>
        )}
      </div>

      {row.admin_response && isResolved && (
        <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <strong>Response sent:</strong> {row.admin_response}
        </p>
      )}

      {!isResolved && (
        <div className="mt-3 space-y-2">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Optional response (sent to submitter on Action / Decline)…"
            maxLength={1000}
            className="w-full resize-none rounded-lg border border-black/15 px-2 py-1.5 text-sm"
          />
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {status !== "in_review" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => patchStatus("in_review", false)}
                className="rounded-full border border-black/15 px-3 py-1 text-sm text-black hover:bg-black/5 disabled:opacity-50"
              >
                Mark in review
              </button>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={() => patchStatus("declined", true)}
              className="rounded-full border border-black/15 px-3 py-1 text-sm text-black hover:bg-black/5 disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => patchStatus("actioned", true)}
              className="rounded-full bg-black px-3 py-1 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Action"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Returns the same-origin pathname (+ search + hash) when the URL parses
 * and shares this host; null otherwise. Falls back to null on any parse
 * error so we never render an external href on an admin surface.
 */
function safeInternalPath(rawUrl: string): string | null {
  if (typeof window === "undefined") {
    // SSR pass — render as plain text; client effect will re-evaluate.
    return null;
  }
  try {
    const u = new URL(rawUrl, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}
