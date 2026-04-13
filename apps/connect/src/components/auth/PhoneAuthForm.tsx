"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Step = "phone" | "otp";

export default function PhoneAuthForm() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Normalize phone: ensure it starts with +
    const normalized = phone.startsWith("+") ? phone : `+${phone}`;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: normalized,
    });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }

    setPhone(normalized);
    setStep("otp");
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {step === "phone" && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="phone"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
            >
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
              placeholder="+27 82 123 4567"
            />
            <p className="text-xs text-black/40">
              Include your country code (e.g. +27 for South Africa)
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || phone.length < 8}
            className="w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending code..." : "Send verification code"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="rounded-xl border border-(--gold)/50 bg-(--gold-soft) px-3 py-2.5 text-sm text-black/85 text-center">
            Code sent to <span className="font-semibold">{phone}</span>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="otp"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
            >
              Verification Code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              maxLength={6}
              className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-center text-lg font-mono tracking-[0.3em] outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
              placeholder="000000"
              autoComplete="one-time-code"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify & Sign In"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setOtp("");
              setError("");
            }}
            className="w-full rounded-xl px-4 py-2.5 text-sm text-(--foreground-soft) transition hover:text-black"
          >
            ← Change phone number
          </button>
        </form>
      )}
    </div>
  );
}
