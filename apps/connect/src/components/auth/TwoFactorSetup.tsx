"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MfaStatus = "loading" | "not-enrolled" | "enrolling" | "verifying" | "enrolled";

export default function TwoFactorSetup() {
  const supabaseRef = useRef(createClient());
  const [status, setStatus] = useState<MfaStatus>("loading");
  const [phone, setPhone] = useState("");
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const checkEnrollment = useCallback(async () => {
    const supabase = supabaseRef.current;
    const { data, error: listError } = await supabase.auth.mfa.listFactors();

    if (listError) {
      setError(listError.message);
      setStatus("not-enrolled");
      return;
    }

    // Check for verified phone or TOTP factors
    const phoneFactors = data.phone ?? [];
    const totpFactors = data.totp ?? [];
    const verifiedPhone = phoneFactors.filter((f) => f.status === "verified");
    const verifiedTotp = totpFactors.filter((f) => f.status === "verified");

    if (verifiedPhone.length > 0 || verifiedTotp.length > 0) {
      setStatus("enrolled");
    } else {
      setStatus("not-enrolled");
    }
  }, []);

  useEffect(() => {
    checkEnrollment();
  }, [checkEnrollment]);

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const normalized = phone.startsWith("+") ? phone : `+${phone}`;
    if (normalized.replace(/\D/g, "").length < 8) {
      setError("Please enter a valid phone number with country code.");
      return;
    }

    setSaving(true);
    const supabase = supabaseRef.current;

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "phone",
      phone: normalized,
    });

    if (enrollError) {
      setError(enrollError.message);
      setSaving(false);
      return;
    }

    setFactorId(data.id);
    setPhone(normalized);

    // Auto-challenge to send SMS
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: data.id });

    if (challengeError) {
      setError(challengeError.message);
      setSaving(false);
      return;
    }

    setChallengeId(challenge.id);
    setStatus("verifying");
    setSaving(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const supabase = supabaseRef.current;

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (verifyError) {
      setError(verifyError.message);
      setSaving(false);
      return;
    }

    setStatus("enrolled");
    setCode("");
    setPhone("");
    setSaving(false);
  }

  async function handleResendCode() {
    if (resendCooldown > 0) return;
    setError("");
    setSaving(true);
    const supabase = supabaseRef.current;

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError(challengeError.message);
      setSaving(false);
      return;
    }

    setChallengeId(challenge.id);
    setSaving(false);
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleUnenroll() {
    setError("");
    setSaving(true);
    const supabase = supabaseRef.current;
    const { data } = await supabase.auth.mfa.listFactors();
    const verifiedPhone = (data?.phone ?? []).filter((f) => f.status === "verified");
    const verifiedTotp = (data?.totp ?? []).filter((f) => f.status === "verified");

    for (const factor of [...verifiedPhone, ...verifiedTotp]) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) {
        setError(unenrollError.message);
        setSaving(false);
        return;
      }
    }

    setStatus("not-enrolled");
    setSaving(false);
  }

  if (status === "loading") {
    return <div className="skeleton h-12 rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-black">Two-Factor Authentication</h3>
          <p className="text-xs text-black/50 mt-0.5">
            {status === "enrolled"
              ? "Your account is protected with 2FA."
              : "Link your phone number for extra security via SMS codes."}
          </p>
        </div>
        {status === "enrolled" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            ✓ Active
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {status === "not-enrolled" && (
        <form onSubmit={handleEnroll} className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="mfa-phone"
              className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
            >
              Phone Number
            </label>
            <input
              id="mfa-phone"
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
          <button
            type="submit"
            disabled={saving || phone.length < 8}
            className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? "Sending code..." : "Enable 2FA via SMS"}
          </button>
        </form>
      )}

      {status === "verifying" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-(--gold)/50 bg-(--gold-soft) px-3 py-2.5 text-sm text-black/85 text-center">
            Verification code sent to <span className="font-semibold">{phone}</span>
          </div>

          <form onSubmit={handleVerify} className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="mfa-code"
                className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
              >
                Verification Code
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                required
                className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-center text-lg font-mono tracking-[0.3em] outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              disabled={saving || code.length !== 6}
              className="w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Verifying..." : "Confirm & Enable 2FA"}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResendCode}
            disabled={saving || resendCooldown > 0}
            className="w-full rounded-xl px-4 py-2 text-xs text-(--foreground-soft) transition hover:text-black disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStatus("not-enrolled");
              setCode("");
              setError("");
            }}
            className="w-full rounded-xl px-4 py-1 text-xs text-(--foreground-soft) transition hover:text-black"
          >
            ← Change phone number
          </button>
        </div>
      )}

      {status === "enrolled" && (
        <button
          type="button"
          onClick={handleUnenroll}
          disabled={saving}
          className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {saving ? "Removing..." : "Disable 2FA"}
        </button>
      )}
    </div>
  );
}
