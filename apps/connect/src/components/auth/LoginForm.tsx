"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const needsConfirmation = searchParams.get("confirmed") === "false";
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-card fade-rise w-full max-w-md rounded-3xl p-5 sm:p-7 space-y-5"
    >
      <div className="space-y-2 text-center">
        <p className="inline-flex items-center rounded-full border border-black/10 bg-(--gold-soft) px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/80">
          Welcome Back
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
          Log in to Connect
        </h1>
        <p className="text-sm text-(--foreground-soft)">
          Continue discovering community events near you.
        </p>
      </div>

      {needsConfirmation && (
        <div className="rounded-xl border border-(--gold)/50 bg-(--gold-soft) px-3 py-2.5 text-sm text-black/85">
          ✉️ Account created! Please check your email to confirm your address,
          then log in below.
        </div>
      )}

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

      <button
        type="submit"
        disabled={loading}
        className="gold-glow w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Logging in..." : "Log In"}
      </button>

      <p className="text-center text-sm text-(--foreground-soft)">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-black underline-offset-4 hover:underline">
          Sign Up
        </Link>
      </p>
    </form>
  );
}
