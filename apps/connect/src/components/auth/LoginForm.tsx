"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OAuthButtons from "./OAuthButtons";
import PhoneAuthForm from "./PhoneAuthForm";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
} from "@/components/ui/shadcn";

type AuthMode = "email" | "phone";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("email");
  const router = useRouter();
  const searchParams = useSearchParams();
  const needsConfirmation = searchParams.get("confirmed") === "false";
  const reauthRequired = searchParams.get("reauth") === "1";
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
        <Badge variant="eyebrow">Welcome Back</Badge>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
          Log in to Connect
        </h1>
        <p className="text-sm text-[var(--foreground-soft)]">
          Continue discovering community events near you.
        </p>
      </div>

      {needsConfirmation && (
        <Alert variant="gold">
          ✉️ Account created! Please check your email to confirm your address,
          then log in below.
        </Alert>
      )}

      {reauthRequired && (
        <Alert variant="gold">
          For security, please sign in again. Your role was updated, so a fresh
          login is required.
        </Alert>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      <OAuthButtons />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs font-medium uppercase tracking-wider text-black/40">
          or
        </span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      {/* Auth mode toggle.  Two buttons sharing a rounded-xl pill container —
          kept as a bespoke segment because shadcn Tabs would introduce a
          heavier Radix pattern than warranted here. */}
      <div className="flex overflow-hidden rounded-xl border border-black/10">
        <button
          type="button"
          onClick={() => {
            setAuthMode("email");
            setError("");
          }}
          className={`flex-1 py-2 text-xs font-semibold transition ${
            authMode === "email"
              ? "bg-black text-white"
              : "bg-white text-black/60 hover:bg-black/5"
          }`}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode("phone");
            setError("");
          }}
          className={`flex-1 py-2 text-xs font-semibold transition ${
            authMode === "phone"
              ? "bg-black text-white"
              : "bg-white text-black/60 hover:bg-black/5"
          }`}
        >
          Phone
        </button>
      </div>

      {authMode === "phone" ? (
        <PhoneAuthForm />
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
            />
            <div className="flex justify-end pt-0.5">
              <Link
                href="/login/forgot-password"
                className="text-xs text-[var(--foreground-soft)] transition hover:text-black"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            variant="gold"
            size="lg"
            disabled={loading}
            className="w-full"
          >
            {loading ? "Logging in..." : "Log In"}
          </Button>
        </>
      )}

      <p className="text-center text-sm text-[var(--foreground-soft)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-semibold text-black underline-offset-4 hover:underline"
        >
          Sign Up
        </Link>
      </p>
    </form>
  );
}
