"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
} from "@/components/ui/shadcn";

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
      <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-md items-center justify-center">
        <div className="surface-card fade-rise w-full rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="space-y-2 text-center">
            <Badge variant="eyebrow">New Password</Badge>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
              Reset your password
            </h1>
            <p className="text-sm text-[var(--foreground-soft)]">
              Choose a new password for your account.
            </p>
          </div>

          {success ? (
            <Alert variant="success">
              Password updated successfully! Redirecting...
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <Alert variant="destructive">{error}</Alert>}

              <div className="space-y-1.5">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                />
              </div>

              <Button
                type="submit"
                variant="gold"
                size="lg"
                disabled={loading}
                className="w-full"
              >
                {loading ? "Updating..." : "Update Password"}
              </Button>

              <p className="text-center text-sm text-[var(--foreground-soft)]">
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
