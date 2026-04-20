"use client";

// Admin-side review card. Server parent passes the application data
// (already filtered to pending + admin-verified). This component
// handles the approve/reject flow + optimistic removal from the list.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export interface PendingApplication {
  id: string;
  user_id: string;
  display_name: string;
  contributor_kind: string | null;
  bio: string | null;
  website_url: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  tiktok_handle: string | null;
  youtube_url: string | null;
  physical_address: string | null;
  logo_url: string | null;
  motivation_text: string | null;
  submitted_at: string;
  applicant_email: string | null;
  applicant_name: string | null;
}

export function ContributorReviewCard({ app }: { app: PendingApplication }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rejecting" | "working">("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  const submit = async (action: "approve" | "reject") => {
    if (action === "reject" && rejectReason.trim().length < 5) {
      setError(
        "Please include a short reason — it's sent to the applicant so they know how to improve.",
      );
      return;
    }
    setError(null);
    setMode("working");
    try {
      const res = await fetch("/api/admin/contributors/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: app.id,
          action,
          reason: action === "reject" ? rejectReason.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error.replace(/_/g, " ")
            : "Review failed. Please try again.",
        );
        setMode(action === "reject" ? "rejecting" : "idle");
        return;
      }
      setDone(action === "approve" ? "approved" : "rejected");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
      setMode(action === "reject" ? "rejecting" : "idle");
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-black/60">
        {done === "approved" ? "Approved ✓" : "Rejected ✓"} — {app.display_name}
      </div>
    );
  }

  return (
    <article className="space-y-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <header className="flex items-start gap-4">
        {app.logo_url ? (
          <Image
            src={app.logo_url}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-(--gold,#D4AF37)/15 text-lg font-semibold text-black">
            {app.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-black">
            {app.display_name}
          </h3>
          <p className="text-xs text-black/60">
            {app.contributor_kind ?? "—"} · Applied{" "}
            {new Date(app.submitted_at).toLocaleDateString()}
          </p>
          <p className="mt-1 text-xs text-black/60">
            {app.applicant_name ?? "Unknown applicant"}
            {app.applicant_email ? (
              <>
                {" · "}
                <a
                  href={`mailto:${app.applicant_email}`}
                  className="underline underline-offset-2 hover:opacity-70"
                >
                  {app.applicant_email}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {app.bio ? (
        <p className="whitespace-pre-wrap text-sm text-black/80">{app.bio}</p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {app.website_url && <Row label="Website" value={app.website_url} link />}
        {app.instagram_handle && (
          <Row label="Instagram" value={app.instagram_handle} />
        )}
        {app.facebook_url && <Row label="Facebook" value={app.facebook_url} link />}
        {app.tiktok_handle && <Row label="TikTok" value={app.tiktok_handle} />}
        {app.youtube_url && <Row label="YouTube" value={app.youtube_url} link />}
        {app.physical_address && (
          <Row label="Address" value={app.physical_address} />
        )}
      </dl>

      {app.motivation_text ? (
        <div className="rounded-lg bg-black/3 p-3 text-sm text-black/80">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-black/50">
            Motivation
          </p>
          <p className="whitespace-pre-wrap">{app.motivation_text}</p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {mode === "rejecting" ? (
        <div className="space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Reason (visible to applicant)"
            className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm focus:border-(--gold,#D4AF37) focus:outline-none focus:ring-1 focus:ring-(--gold,#D4AF37)"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setRejectReason("");
                setError(null);
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-black/70 hover:bg-black/6"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit("reject")}
              className="rounded-lg bg-black px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Confirm reject
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setMode("rejecting")}
            disabled={mode === "working"}
            className="rounded-lg border border-black/15 bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-black/6 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => submit("approve")}
            disabled={mode === "working"}
            className="rounded-lg bg-(--gold,#D4AF37) px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {mode === "working" ? "Working…" : "Approve"}
          </button>
        </div>
      )}
    </article>
  );
}

function Row({
  label,
  value,
  link = false,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <>
      <dt className="text-black/50">{label}</dt>
      <dd className="truncate text-black">
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-70"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </>
  );
}
