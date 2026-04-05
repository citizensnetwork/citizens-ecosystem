"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@/types/db";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

    // Email confirmation is required → send to login with a notice
    router.push("/login?confirmed=false");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-card fade-rise w-full max-w-md rounded-3xl p-5 sm:p-7 space-y-5"
    >
      <div className="space-y-2 text-center">
        <p className="inline-flex items-center rounded-full border border-black/10 bg-[var(--gold-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/80">
          Join Citizens Connect
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
          Create your account
        </h1>
        <p className="text-sm text-[var(--foreground-soft)]">
          Discover and share faith-centered events in your city.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

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
              value="client"
              checked={role === "client"}
              onChange={() => setRole("client")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Client</span>
              <span className="block text-xs text-[var(--foreground-soft)]">
                Attend events
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="vendor"
              checked={role === "vendor"}
              onChange={() => setRole("vendor")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Vendor</span>
              <span className="block text-xs text-[var(--foreground-soft)]">
                Create events
              </span>
            </span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="gold-glow w-full rounded-xl bg-[var(--gold)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creating account..." : "Sign Up"}
      </button>

      <p className="text-center text-sm text-[var(--foreground-soft)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-black underline-offset-4 hover:underline">
          Log In
        </Link>
      </p>
    </form>
  );
}
