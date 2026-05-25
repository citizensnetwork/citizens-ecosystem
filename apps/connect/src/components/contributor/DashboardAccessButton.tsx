// DashboardAccessButton — header CTA on public contributor profile.
//
// States:
//   - Owner viewing own profile:      "Open Dashboard" (link)
//   - Admin with active access grant: "Open Dashboard" (link)
//   - Admin without grant:            "Open Dashboard" with white-label overlay reading
//                                     "Request access" — click submits POST /access-requests
//   - Anyone else (Citizen, signed-out): button is not rendered
//
// All gating data is computed on the server (ProfileDetailServer) and
// passed in as props; this component never trusts client-side role checks.
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Mode = "owner" | "admin-granted" | "admin-no-grant";

interface Props {
  /** Contributor's vanity slug for dashboard route + access-request API. */
  slug: string;
  /** Pre-computed mode from server side. */
  mode: Mode;
  /** Optional pending request id — when present, button shows "Requested". */
  pendingRequestId?: string | null;
}

const DASHBOARD_PATH = (slug: string) => `/c/${slug}/dashboard`;

export default function DashboardAccessButton({
  slug,
  mode,
  pendingRequestId = null,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(pendingRequestId);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (mode === "owner" || mode === "admin-granted") {
    return (
      <Link
        href={DASHBOARD_PATH(slug)}
        className="inline-flex items-center justify-center rounded-full bg-(--gold,#D4AF37) px-4 py-1.5 text-sm font-semibold text-black shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold,#D4AF37)"
      >
        Open Dashboard
      </Link>
    );
  }

  // admin-no-grant — either pending or callable
  if (pending) {
    return (
      <div className="relative inline-flex">
        <button
          type="button"
          disabled
          aria-label="Dashboard access request pending"
          className="inline-flex items-center justify-center rounded-full bg-(--gold,#D4AF37) px-4 py-1.5 text-sm font-semibold text-black/40 opacity-60"
        >
          Open Dashboard
        </button>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-white/80 text-xs font-semibold text-black"
        >
          Request pending
        </span>
      </div>
    );
  }

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/contributor/${encodeURIComponent(slug)}/access-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(typeof body?.error === "string" ? body.error : "Failed to request access");
          return;
        }
        const body = (await res.json()) as { id?: string };
        setPending(body.id ?? "submitted");
        router.refresh();
      } catch {
        setError("Network error");
      }
    });
  };

  return (
    <div className="relative inline-flex flex-col items-end gap-1">
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={onClick}
          disabled={submitting}
          aria-label="Request dashboard access"
          className="inline-flex items-center justify-center rounded-full bg-(--gold,#D4AF37) px-4 py-1.5 text-sm font-semibold text-black shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold,#D4AF37) disabled:opacity-60"
        >
          Open Dashboard
        </button>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-white/85 text-xs font-semibold text-black ring-1 ring-black/10"
        >
          {submitting ? "Submitting…" : "Request access"}
        </span>
      </div>
      {/* Visually-hidden live region — announces successful submission to screen readers. */}
      <span role="status" aria-live="polite" className="sr-only">
        {submitting ? "Submitting dashboard access request" : ""}
      </span>
      {error && (
        <p role="alert" className="text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
