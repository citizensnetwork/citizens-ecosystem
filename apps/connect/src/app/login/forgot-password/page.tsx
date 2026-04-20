"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
} from "@/components/ui/shadcn";

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
        <div className="surface-card fade-rise w-full rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="space-y-2 text-center">
            <Badge variant="eyebrow">Password Reset</Badge>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
              Forgot your password?
            </h1>
            <p className="text-sm text-[var(--foreground-soft)]">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <Alert variant="gold">
                ✉️ Check your email for a password reset link. It may take a
                minute to arrive.
              </Alert>
              <Button asChild variant="link" className="w-full">
                <Link href="/login">Back to Log In</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <Alert variant="destructive">{error}</Alert>}

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

              <Button
                type="submit"
                variant="gold"
                size="lg"
                disabled={loading}
                className="w-full"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>

              <p className="text-center text-sm text-[var(--foreground-soft)]">
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
