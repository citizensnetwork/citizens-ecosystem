"use client";

/**
 * ReportButton — small flag icon that opens a modal to file a report
 * against an event / user / place / comment.
 *
 * Anyone signed in can report. Rate-limited server-side (5/hour).
 * Non-signed-in users see a prompt directing them to log in.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export type ReportTargetType = "event" | "user" | "place" | "comment";

type ReportReason =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "sexual_content"
  | "violence"
  | "misinformation"
  | "impersonation"
  | "illegal"
  | "other";

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or scam",
  harassment: "Harassment or bullying",
  hate_speech: "Hate speech",
  sexual_content: "Sexual or inappropriate content",
  violence: "Violence or danger",
  misinformation: "Misinformation",
  impersonation: "Impersonation",
  illegal: "Illegal activity",
  other: "Something else",
};

const BODY_MAX = 1000;

type Variant = "icon" | "text";

export function ReportButton({
  targetType,
  targetId,
  isAuthenticated,
  variant = "icon",
  className = "",
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** When false, clicking opens a sign-in prompt instead of the form. */
  isAuthenticated: boolean;
  variant?: Variant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const containerRef = useFocusTrap<HTMLDivElement>(open);
  const dialogTitleId = useRef(`report-dialog-${Math.random().toString(36).slice(2, 8)}`);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSubmitting(false);
    setDone(false);
    setReason("");
    setBody("");
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function submit() {
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reason,
          body: body.trim() ? body.trim() : undefined,
        }),
      });
      if (res.status === 201) {
        setDone(true);
      } else if (res.status === 409) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "You've already reported this.");
      } else if (res.status === 429) {
        setError("You've reached the hourly report limit. Try again later.");
      } else {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "Failed to file report.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const triggerClasses =
    variant === "icon"
      ? `inline-flex h-8 w-8 items-center justify-center rounded-full text-black/50 transition hover:bg-black/5 hover:text-black ${className}`
      : `inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-black/60 transition hover:bg-black/5 hover:text-black ${className}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClasses}
        aria-label="Report this"
        title="Report"
      >
        <FlagIcon className={variant === "icon" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {variant === "text" && <span>Report</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId.current}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={containerRef}
            className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <h2 id={dialogTitleId.current} className="text-base font-semibold text-black">
                Report
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1 text-black/50 hover:bg-black/5 hover:text-black"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {!isAuthenticated ? (
              <div className="space-y-3 px-5 py-5 text-sm text-black/70">
                <p>You need to be signed in to report content.</p>
                <Link
                  href="/login"
                  className="inline-block rounded-full bg-[color:var(--gold,#D4AF37)] px-4 py-2 text-sm font-medium text-black hover:brightness-95"
                  onClick={close}
                >
                  Sign in
                </Link>
              </div>
            ) : done ? (
              <div className="space-y-3 px-5 py-6 text-sm text-black/70">
                <p className="font-medium text-black">Thanks — your report has been filed.</p>
                <p>Our team will review it shortly.</p>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-black hover:bg-black/5"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-4">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-black">Why are you reporting this?</legend>
                  <div className="space-y-1.5">
                    {(Object.keys(REASON_LABELS) as ReportReason[]).map((r) => (
                      <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-black/80 hover:bg-black/5">
                        <input
                          type="radio"
                          name="report-reason"
                          value={r}
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          className="h-4 w-4"
                        />
                        {REASON_LABELS[r]}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="report-body" className="mb-1 block text-sm font-medium text-black">
                    Additional details (optional)
                  </label>
                  <textarea
                    id="report-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                    rows={3}
                    maxLength={BODY_MAX}
                    placeholder="Share any context that will help our review…"
                    className="w-full resize-none rounded-lg border border-black/15 px-3 py-2 text-sm text-black placeholder:text-black/40 focus:border-black/40 focus:outline-none"
                  />
                  <p className="mt-1 text-right text-xs text-black/40">
                    {body.length}/{BODY_MAX}
                  </p>
                </div>

                {error && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || !reason}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
                  >
                    {submitting ? "Sending…" : "Submit report"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FlagIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 21V4h12l-2 4 2 4H4" />
    </svg>
  );
}
