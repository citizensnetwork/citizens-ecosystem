"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MfaStatus = "loading" | "not-enrolled" | "enrolling" | "enrolled";

export default function TwoFactorSetup() {
  const supabaseRef = useRef(createClient());
  const [status, setStatus] = useState<MfaStatus>("loading");
  const [qrUri, setQrUri] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const checkEnrollment = useCallback(async () => {
    const supabase = supabaseRef.current;
    const { data, error: listError } = await supabase.auth.mfa.listFactors();

    if (listError) {
      setError(listError.message);
      setStatus("not-enrolled");
      return;
    }

    const totp = data.totp ?? [];
    const verified = totp.filter((f) => f.status === "verified");

    if (verified.length > 0) {
      setStatus("enrolled");
    } else {
      setStatus("not-enrolled");
    }
  }, []);

  useEffect(() => {
    checkEnrollment();
  }, [checkEnrollment]);

  async function handleEnroll() {
    setError("");
    setSaving(true);
    const supabase = supabaseRef.current;

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Citizens Connect Authenticator",
    });

    if (enrollError) {
      setError(enrollError.message);
      setSaving(false);
      return;
    }

    setQrUri(data.totp.uri);
    setFactorId(data.id);
    setStatus("enrolling");
    setSaving(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
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

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) {
      setError(verifyError.message);
      setSaving(false);
      return;
    }

    setStatus("enrolled");
    setCode("");
    setSaving(false);
  }

  async function handleUnenroll() {
    setError("");
    setSaving(true);
    const supabase = supabaseRef.current;
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = (data?.totp ?? []).filter((f) => f.status === "verified");

    for (const factor of verified) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
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
              : "Add an authenticator app for extra security."}
          </p>
        </div>
        {status === "enrolled" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            ✓ Active
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {status === "not-enrolled" && (
        <button
          type="button"
          onClick={handleEnroll}
          disabled={saving}
          className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? "Setting up..." : "Enable 2FA"}
        </button>
      )}

      {status === "enrolling" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-black/8 bg-white p-4 text-center">
            <p className="text-xs text-black/50 mb-3">
              Scan this QR code with your authenticator app:
            </p>
            {/* QR code rendered as an image via Google Charts API */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
              alt="2FA QR Code"
              width={200}
              height={200}
              className="mx-auto rounded-lg"
            />
            <p className="mt-2 text-xs text-black/40 break-all max-w-xs mx-auto">
              Or enter this key manually: {qrUri.split("secret=")[1]?.split("&")[0] ?? ""}
            </p>
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
