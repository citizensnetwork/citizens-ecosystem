"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  onBack: () => void;
};

const POLL_INTERVAL = 5_000; // 5 seconds
const TIMEOUT_MS = 120_000; // 2 minutes

export default function VerificationPending({ email, onBack }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(TIMEOUT_MS / 1000));
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    // Countdown timer
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Poll for session (becomes valid once email is confirmed)
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        cleanup();
        router.push("/events");
        router.refresh();
      }
    }, POLL_INTERVAL);

    // Beforeunload guard
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cleanup();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [cleanup, router, supabase.auth]);

  async function handleResend() {
    setResending(true);
    setError("");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    if (resendError) {
      setError(resendError.message);
    } else {
      setResent(true);
      setExpired(false);
      setSecondsLeft(Math.floor(TIMEOUT_MS / 1000));
    }
    setResending(false);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="surface-card fade-rise w-full max-w-md rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-(--gold-soft)">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8 text-(--gold)"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
          Check your email
        </h1>
        <p className="text-sm text-(--foreground-soft)">
          We sent a verification link to{" "}
          <span className="font-semibold text-black">{email}</span>
        </p>
      </div>

      {/* Countdown / spinner */}
      {!expired ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative h-12 w-12">
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="var(--border)"
                strokeWidth="4"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="var(--gold)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 20}
                strokeDashoffset={
                  2 * Math.PI * 20 * (1 - secondsLeft / (TIMEOUT_MS / 1000))
                }
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-black">
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
          </div>
          <p className="text-xs text-(--foreground-soft)">
            Waiting for confirmation…
          </p>
          <div className="soft-pulse flex items-center gap-1.5 text-xs text-(--gold)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--gold)" />
            Listening for verification
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-center text-sm text-amber-800">
          Didn&apos;t receive the email? Check your spam folder or resend below.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {resent && !error && (
        <div className="rounded-xl border border-green-200 bg-green-50/80 px-3 py-2.5 text-sm text-green-700 text-center">
          Verification email resent!
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || (!expired && secondsLeft > 90)}
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resending ? "Resending…" : "Resend verification email"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-xl px-4 py-2.5 text-sm text-(--foreground-soft) transition hover:text-black"
        >
          ← Back to sign up
        </button>
      </div>
    </div>
  );
}
