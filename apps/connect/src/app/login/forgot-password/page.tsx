"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden px-4 py-8 sm:py-10">
      <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-md items-center justify-center">
        <div className="glass-panel fade-rise w-full p-5 sm:p-7 space-y-5">
          <div className="space-y-2 text-center">
            <p className="inline-flex items-center rounded-full border border-black/10 bg-(--gold-soft) px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/80">
              Password Reset
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
              Forgot your password?
            </h1>
            <p className="text-sm text-(--foreground-soft)">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-(--gold)/50 bg-(--gold-soft) px-3 py-2.5 text-sm text-black/85">
                ✉️ Check your email for a password reset link. It may take a
                minute to arrive.
              </div>
              <Link
                href="/login"
                className="block text-center text-sm font-semibold text-black underline-offset-4 hover:underline"
              >
                Back to Log In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="gold-glow w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <p className="text-center text-sm text-(--foreground-soft)">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-black underline-offset-4 hover:underline"
                >
                  Log In
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
