"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WaiverTemplate {
  id: string;
  slug: string;
  title: string;
  body: string;
  version: number;
}

/**
 * First-time attendee waiver modal shown the first time a user RSVPs to any
 * event. Subsequent RSVPs are silent because the signature is keyed by
 * (template_id, user_id) — any event_id works.
 *
 * Accepts a full name, posts the signature to /api/indemnity, and calls
 * onAccepted on success.
 */
export default function AttendeeWaiverModal({
  eventId,
  onAccepted,
  onCancel,
  defaultFullName,
}: {
  eventId: string;
  onAccepted: () => void;
  onCancel: () => void;
  defaultFullName?: string;
}) {
  const [template, setTemplate] = useState<WaiverTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState(defaultFullName ?? "");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/indemnity/template?slug=attendee-participation-waiver");
        if (!res.ok) throw new Error("Failed to load waiver");
        const { template: t } = await res.json();
        if (!cancelled) setTemplate(t);
      } catch {
        if (!cancelled) setError("Could not load the participation waiver. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!template) {
      setError("Waiver not loaded yet.");
      return;
    }
    if (!agreed) {
      setError("Please tick the box to agree.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/indemnity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          full_name: fullName.trim(),
          event_id: eventId,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        setError(msg || "Could not record your agreement. Please try again.");
        setSubmitting(false);
        return;
      }
      onAccepted();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendee-waiver-title"
    >
      <div className="surface-card w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-black/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">
            Before you RSVP
          </p>
          <h2
            id="attendee-waiver-title"
            className="mt-1 text-xl font-semibold text-black"
          >
            {template?.title ?? "Event Participation Waiver"}
          </h2>
        </div>

        <div className="max-h-72 overflow-y-auto border-b border-black/10 bg-neutral-50 px-6 py-4 text-sm leading-relaxed text-neutral-800">
          {loading ? (
            <p className="text-neutral-500">Loading waiver…</p>
          ) : template ? (
            <div className="whitespace-pre-wrap">{template.body}</div>
          ) : (
            <p className="text-red-600">Could not load waiver.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label
              htmlFor="attendee-name"
              className="block text-sm font-medium text-black"
            >
              Your full name
            </label>
            <input
              id="attendee-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={200}
              autoComplete="name"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black"
              placeholder="e.g. Thandi Mokoena"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-black/80">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-black"
              required
            />
            <span className="leading-snug">
              I have read and agree to this participation waiver. See our full{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-semibold text-black underline-offset-4 hover:underline"
              >
                Terms &amp; Community Agreement
              </Link>
              .
            </span>
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:border-black/40 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || !template}
              className="rounded-xl bg-[var(--gold)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Agree & RSVP"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
