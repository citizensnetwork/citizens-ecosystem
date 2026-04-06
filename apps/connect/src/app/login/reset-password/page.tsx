"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => {
      router.push("/events");
      router.refresh();
    }, 2000);
  }

  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden px-4 py-8 sm:py-10">
      <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-(--gold)/18 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-12 h-64 w-64 rounded-full bg-black/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-md items-center justify-center">
        <div className="surface-card fade-rise w-full rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="space-y-2 text-center">
            <p className="inline-flex items-center rounded-full border border-black/10 bg-(--gold-soft) px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/80">
              New Password
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
              Reset your password
            </h1>
            <p className="text-sm text-(--foreground-soft)">
              Choose a new password for your account.
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50/90 px-3 py-2.5 text-sm text-green-800">
                Password updated successfully! Redirecting...
              </div>
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
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
                >
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="gold-glow w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>

              <p className="text-center text-sm text-(--foreground-soft)">
                <Link
                  href="/login"
                  className="font-semibold text-black underline-offset-4 hover:underline"
                >
                  Back to Log In
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
