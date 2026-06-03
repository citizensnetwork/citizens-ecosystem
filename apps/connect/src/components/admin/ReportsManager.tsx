"use client";

/**
 * ReportsManager — admin-side list of reports with inline action/dismiss
 * controls.  Each resolution posts to PATCH /api/admin/reports/[id] which
 * writes a row to admin_actions for audit.
 */

import { useState, useTransition } from "react";
import Link from "next/link";

export type ReportRow = {
  id: string;
  target_type: "event" | "user" | "place" | "comment";
  target_id: string;
  reason: string;
  body: string | null;
  status: "open" | "actioned" | "dismissed";
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  sexual_content: "Sexual content",
  violence: "Violence",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  illegal: "Illegal",
  other: "Other",
};

function targetHref(t: ReportRow["target_type"], id: string): string | null {
  switch (t) {
    case "event":
      return `/events/${id}`;
    case "user":
      return `/profile/${id}`;
    case "place":
      return `/places/${id}`;
    case "comment":
      // Comments are rendered inside events; no direct permalink.
      return null;
  }
}

export default function ReportsManager({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-black/10 bg-white p-6 text-center text-sm text-black/60">
        No reports in this view.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <ReportCard key={r.id} row={r} />
      ))}
    </ul>
  );
}

function ReportCard({ row }: { row: ReportRow }) {
  const [status, setStatus] = useState(row.status);
  const [notes, setNotes] = useState(row.resolution_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const href = targetHref(row.target_type, row.target_id);
  const isResolved = status !== "open";

  function resolve(next: "actioned" | "dismissed") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/reports/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: next,
            resolution_notes: notes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setError(payload.error ?? "Failed to update report.");
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
        <span className="rounded-full bg-black/5 px-2 py-0.5 font-semibold uppercase tracking-wide text-black/70">
          {row.target_type}
        </span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
          {REASON_LABELS[row.reason] ?? row.reason}
        </span>
        <span>·</span>
        <time dateTime={row.created_at}>
          {new Date(row.created_at).toLocaleString()}
        </time>
        {isResolved && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {status}
          </span>
        )}
      </div>

      <div className="text-sm text-black">
        Reported by{" "}
        {row.reporter_id ? (
          <Link href={`/profile/${row.reporter_id}`} className="underline">
            {row.reporter_name || row.reporter_email || "User"}
          </Link>
        ) : (
          <span>Unknown</span>
        )}
        {href ? (
          <>
            {" "}·{" "}
            <Link href={href} className="underline text-[color:var(--gold,#C9A84C)]">
              View target
            </Link>
          </>
        ) : (
          <>
            {" "}·{" "}
            <span className="text-black/50">Target id: {row.target_id}</span>
          </>
        )}
      </div>

      {row.body && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-black/80">
          {row.body}
        </p>
      )}

      {row.resolution_notes && (
        <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <strong>Resolution:</strong> {row.resolution_notes}
        </p>
      )}

      {!isResolved && (
        <div className="mt-3 space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Resolution notes (optional)…"
            className="w-full resize-none rounded-lg border border-black/15 px-2 py-1.5 text-sm"
          />
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => resolve("dismissed")}
              className="rounded-full border border-black/15 px-3 py-1 text-sm text-black hover:bg-black/5 disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => resolve("actioned")}
              className="rounded-full bg-black px-3 py-1 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Mark actioned"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
