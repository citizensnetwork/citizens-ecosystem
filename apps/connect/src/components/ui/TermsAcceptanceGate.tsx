"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Full-screen blocking modal that appears when an authenticated user has not
 * yet accepted the current platform Terms & Community Agreement. Reads
 * `profiles.terms_accepted_at` on mount; if null, locks the UI until the
 * user accepts.
 *
 * Mounted globally from the root layout. Renders nothing for signed-out
 * users or users who have already accepted.
 */
export default function TermsAcceptanceGate() {
  const supabase = createClient();
  const [needed, setNeeded] = useState(false);
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(needed);

  const check = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNeeded(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("terms_accepted_at, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.terms_accepted_at) {
      setNeeded(true);
      if (profile?.full_name) setFullName(profile.full_name);
    } else {
      setNeeded(false);
    }
  }, [supabase]);

  useEffect(() => {
    check();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [check, supabase]);

  // Lock body scroll while the gate is open and autofocus the name input.
  useEffect(() => {
    if (!needed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => nameInputRef.current?.focus({ preventScroll: true }), 50);
    return () => {
      document.body.style.overflow = previousOverflow;
      clearTimeout(t);
    };
  }, [needed]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!agreed) {
      setError("Please tick the box to confirm your agreement.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        setError(msg || "Could not record acceptance. Please try again.");
        setSubmitting(false);
        return;
      }
      setNeeded(false);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (!needed) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
      aria-describedby="terms-gate-desc"
    >
      <div
        ref={dialogRef}
        className="surface-card w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="border-b border-black/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">
            One quick thing
          </p>
          <h2
            id="terms-gate-title"
            className="mt-1 text-xl font-semibold text-black"
          >
            Accept the Terms &amp; Community Agreement
          </h2>
        </div>

        <form onSubmit={handleAccept} className="space-y-4 px-6 py-5">
          <p id="terms-gate-desc" className="text-sm leading-relaxed text-neutral-700">
            Before continuing, please confirm you&apos;ve read and agree to our{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold text-black underline-offset-4 hover:underline"
            >
              Terms &amp; Community Agreement
            </Link>
            . It covers how we operate, how members treat each other, and how
            liability is handled for events and places listed here.
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="terms-gate-name"
              className="block text-sm font-medium text-black"
            >
              Your full name
            </label>
            <input
              id="terms-gate-name"
              ref={nameInputRef}
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

          <label className="flex items-start gap-2.5 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-sm text-black/80">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-black"
              required
            />
            <span className="leading-snug">
              I have read and agree to the Terms &amp; Community Agreement.
            </span>
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !agreed || fullName.trim().length < 2}
            className="w-full rounded-xl bg-[var(--gold)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Agree & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
