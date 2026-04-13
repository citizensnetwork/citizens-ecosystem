"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import VerificationPending from "./VerificationPending";
import OAuthButtons from "./OAuthButtons";
import type { UserRole } from "@/types/db";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("individual");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If a session exists, email confirmation is disabled → auto sign-in
    if (data.session) {
      router.push("/events");
      router.refresh();
      return;
    }

    // Email confirmation is required → show in-app verification polling screen
    setLoading(false);
    setPendingVerification(true);
  }

  if (pendingVerification) {
    return (
      <VerificationPending
        email={email}
        onBack={() => setPendingVerification(false)}
      />
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-card fade-rise w-full max-w-md rounded-3xl p-5 sm:p-7 space-y-5"
    >
      <div className="space-y-2 text-center">
        <p className="inline-flex items-center rounded-full border border-black/10 bg-(--gold-soft) px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/80">
          Join Citizens Connect
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
          Create your account
        </h1>
        <p className="text-sm text-(--foreground-soft)">
          Discover and share faith-centered events in your city.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <OAuthButtons />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-(--border)" />
        <span className="text-xs font-medium text-black/40 uppercase tracking-wider">or</span>
        <div className="h-px flex-1 bg-(--border)" />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="fullName"
          className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
        >
          Full Name
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
          placeholder="John Doe"
        />
      </div>

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

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
        >
          Password
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

      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75">
          I am a
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="individual"
              checked={role === "individual"}
              onChange={() => setRole("individual")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Individual</span>
              <span className="block text-xs text-(--foreground-soft)">
                Discover events, RSVP, review &amp; connect
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="ministry"
              checked={role === "ministry"}
              onChange={() => setRole("ministry")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Ministry</span>
              <span className="block text-xs text-(--foreground-soft)">
                Church or ministry — host events &amp; share content
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="organization"
              checked={role === "organization"}
              onChange={() => setRole("organization")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Organization</span>
              <span className="block text-xs text-(--foreground-soft)">
                Community org — create &amp; manage events
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="business"
              checked={role === "business"}
              onChange={() => setRole("business")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Business</span>
              <span className="block text-xs text-(--foreground-soft)">
                Promote events &amp; list your place
              </span>
            </span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="gold-glow w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creating account..." : "Sign Up"}
      </button>

      <p className="text-center text-sm text-(--foreground-soft)">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-black underline-offset-4 hover:underline">
          Log In
        </Link>
      </p>
    </form>
  );
}
