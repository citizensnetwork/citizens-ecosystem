"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OAuthButtons from "./OAuthButtons";
import VerificationPending from "./VerificationPending";
import type { UserRole, ContributorKind } from "@/types/db";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
} from "@/components/ui/shadcn";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // Two-stage role pick:
  //   - `role`: citizen vs contributor (the only thing the trigger respects)
  //   - `contributorKind`: ministry / organization / business (only meaningful
  //     when role === "contributor"; ignored otherwise)
  // Defaults to citizen — most new accounts are attendees, not organisers.
  const [role, setRole] = useState<UserRole>("citizen");
  const [contributorKind, setContributorKind] =
    useState<ContributorKind>("ministry");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!termsAccepted) {
      setError(
        "Please accept the Terms & Community Agreement to create an account.",
      );
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          // Only forward the kind when relevant; keeps raw_user_meta_data clean.
          ...(role === "contributor"
            ? { contributor_kind: contributorKind }
            : {}),
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Instant session (e.g. email confirmation disabled) — record acceptance
      // immediately. For the email-verify flow the TermsAcceptanceGate picks it
      // up on first authenticated visit.
      try {
        await fetch("/api/terms/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName }),
        });
      } catch {
        // Non-blocking: gate will retry on first visit.
      }
      router.push("/events");
      router.refresh();
      return;
    }

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
        <Badge variant="eyebrow">Join Citizens Connect</Badge>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black">
          Create your account
        </h1>
        <p className="text-sm text-[var(--foreground-soft)]">
          Discover and share faith-centered events in your city.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <OAuthButtons />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs font-medium uppercase tracking-wider text-black/40">
          or
        </span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          placeholder="John Doe"
        />
      </div>

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
      </div>

      <div className="space-y-2">
        <Label>I am joining as</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="citizen"
              checked={role === "citizen"}
              onChange={() => setRole("citizen")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Citizen</span>
              <span className="block text-xs text-[var(--foreground-soft)]">
                Discover events, RSVP, review &amp; connect
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition hover:border-black/50">
            <input
              type="radio"
              name="role"
              value="contributor"
              checked={role === "contributor"}
              onChange={() => setRole("contributor")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-black">Contributor</span>
              <span className="block text-xs text-[var(--foreground-soft)]">
                Host events, manage places &amp; share content
              </span>
            </span>
          </label>
        </div>

        {role === "contributor" && (
          <div className="mt-2 space-y-1.5 rounded-xl border border-dashed border-black/15 bg-[var(--gold-soft)]/40 p-3">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-black/65">
              Contributing as
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(["ministry", "organization", "business"] as const).map(
                (kind) => (
                  <label
                    key={kind}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      contributorKind === kind
                        ? "border-black bg-black text-white"
                        : "border-black/15 bg-white text-black/80 hover:border-black/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="contributor_kind"
                      value={kind}
                      checked={contributorKind === kind}
                      onChange={() => setContributorKind(kind)}
                      className="sr-only"
                    />
                    <span className="capitalize">
                      {kind === "organization" ? "Org" : kind}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2.5 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-black/80 transition hover:border-black/30">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-black"
          aria-describedby="terms-help"
          required
        />
        <span id="terms-help" className="leading-snug">
          I have read and agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="font-semibold text-black underline-offset-4 hover:underline"
          >
            Terms &amp; Community Agreement
          </Link>
          .
        </span>
      </label>

      <Button
        type="submit"
        variant="gold"
        size="lg"
        disabled={loading || !termsAccepted}
        className="w-full"
      >
        {loading ? "Creating account..." : "Sign Up"}
      </Button>

      <p className="text-center text-sm text-[var(--foreground-soft)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-black underline-offset-4 hover:underline"
        >
          Log In
        </Link>
      </p>
    </form>
  );
}