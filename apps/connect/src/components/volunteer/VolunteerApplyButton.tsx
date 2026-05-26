"use client";

import { useState } from "react";
import Link from "next/link";

export type VolunteerStatus =
  | "none"
  | "pending"
  | "approved"
  | "declined"
  | "withdrawn";

interface Props {
  entityType: "event" | "place";
  entityId: string;
  /** The contributor's contributor_slug, used in the API route path. */
  contributorHandle: string;
  userId: string | null;
  initialStatus: VolunteerStatus;
  initialApplicationId: string | null;
  /** The owner should not be able to apply to their own asset. */
  isOwner?: boolean;
}

const MAX_MESSAGE = 500;

export default function VolunteerApplyButton({
  entityType,
  entityId,
  contributorHandle,
  userId,
  initialStatus,
  initialApplicationId,
  isOwner = false,
}: Props) {
  const [status, setStatus] = useState<VolunteerStatus>(initialStatus);
  const [applicationId, setApplicationId] = useState<string | null>(
    initialApplicationId
  );
  const [phase, setPhase] = useState<
    "idle" | "form" | "submitting" | "withdrawing"
  >("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Owner should not see the volunteer CTA for their own entity.
  if (isOwner) return null;

  const apiBase = `/api/contributor/${contributorHandle}/volunteers`;

  async function handleApply() {
    setPhase("submitting");
    setError("");
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          entity_type: entityType,
          entity_id: entityId,
          ...(message.trim() ? { message: message.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as Record<string, string>).error ?? "Failed to submit application");
        setPhase("form");
        return;
      }
      const data = (await res.json()) as { id: string };
      setApplicationId(data.id);
      setStatus("pending");
      setPhase("idle");
      setMessage("");
    } catch {
      setError("Network error. Please try again.");
      setPhase("form");
    }
  }

  async function handleWithdraw() {
    if (!applicationId) return;
    setPhase("withdrawing");
    setError("");
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdraw",
          application_id: applicationId,
        }),
      });
      if (!res.ok) {
        setError("Failed to withdraw application. Please try again.");
        setPhase("idle");
        return;
      }
      setStatus("withdrawn");
      setApplicationId(null);
      setPhase("idle");
    } catch {
      setError("Network error. Please try again.");
      setPhase("idle");
    }
  }

  // Not logged in — link to login
  if (!userId) {
    return (
      <Link
        href="/login"
        className="inline-block rounded-full bg-(--gold) px-3 py-1 text-xs font-semibold text-black transition hover:brightness-95"
      >
        Volunteer
      </Link>
    );
  }

  // Can (re-)apply
  if (status === "none" || status === "withdrawn") {
    if (phase === "form" || phase === "submitting") {
      const remaining = MAX_MESSAGE - message.length;
      return (
        <div className="mt-1 space-y-2" aria-label="Volunteer application form">
          <textarea
            className="w-full rounded-xl border border-black/15 bg-white/80 p-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-(--gold)"
            rows={3}
            maxLength={MAX_MESSAGE}
            placeholder="Tell us why you'd like to volunteer (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Volunteer message"
            aria-describedby="vol-char-count"
          />
          <p
            id="vol-char-count"
            className={`text-[10px] ${remaining < 50 ? "text-amber-600" : "text-black/40"}`}
            aria-live="polite"
          >
            {remaining} chars remaining
          </p>
          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={phase === "submitting"}
              className="rounded-full bg-(--gold) px-4 py-1.5 text-xs font-semibold text-black transition disabled:opacity-50 hover:brightness-95"
            >
              {phase === "submitting" ? "Submitting…" : "Submit application"}
            </button>
            <button
              onClick={() => {
                setPhase("idle");
                setError("");
              }}
              className="rounded-full border border-black/20 px-4 py-1.5 text-xs text-black/60 transition hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        onClick={() => setPhase("form")}
        className="inline-block rounded-full bg-(--gold) px-3 py-1 text-xs font-semibold text-black transition hover:brightness-95"
      >
        Volunteer{status === "withdrawn" ? " again" : ""}
      </button>
    );
  }

  // Application pending — show badge + withdraw option
  if (status === "pending") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          Application pending
        </span>
        <button
          onClick={handleWithdraw}
          disabled={phase === "withdrawing"}
          className="text-xs text-black/40 underline transition hover:text-black/70 disabled:opacity-50"
          aria-label="Withdraw volunteer application"
        >
          {phase === "withdrawing" ? "Withdrawing…" : "Withdraw"}
        </button>
        {error && (
          <p className="w-full text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Approved — show badge + withdraw option
  if (status === "approved") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
          Volunteer approved ✓
        </span>
        <button
          onClick={handleWithdraw}
          disabled={phase === "withdrawing"}
          className="text-xs text-black/40 underline transition hover:text-black/70 disabled:opacity-50"
          aria-label="Withdraw volunteer approval"
        >
          {phase === "withdrawing" ? "Withdrawing…" : "Withdraw"}
        </button>
        {error && (
          <p className="w-full text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Declined — no further action available
  if (status === "declined") {
    return (
      <span className="inline-block rounded-full bg-black/10 px-2.5 py-0.5 text-xs font-medium text-black/50">
        Not selected this time
      </span>
    );
  }

  return null;
}
