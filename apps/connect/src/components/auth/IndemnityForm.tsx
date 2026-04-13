"use client";

import { useCallback, useEffect, useState } from "react";
import type { IndemnityTemplate } from "@/types/db";

type Props = {
  appliesTo: "events" | "places";
  eventId?: string;
  /** Called when all required indemnities are signed */
  onAllSigned: () => void;
  /** Called when the form is not needed (no required templates) */
  onSkip?: () => void;
};

export default function IndemnityForm({
  appliesTo,
  eventId,
  onAllSigned,
  onSkip,
}: Props) {
  const [templates, setTemplates] = useState<IndemnityTemplate[]>([]);
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchTemplates = useCallback(async () => {
    const params = new URLSearchParams({ applies_to: appliesTo });
    if (eventId) params.set("event_id", eventId);

    const res = await fetch(`/api/indemnity?${params}`);
    const data = await res.json();

    if (data.allSigned) {
      onAllSigned();
      onSkip?.();
      setLoading(false);
      return;
    }

    const signed = new Set<string>((data.signatures ?? []).map((s: { template_id: string }) => s.template_id));
    const unsigned = (data.templates ?? []).filter((t: IndemnityTemplate) => !signed.has(t.id));

    setTemplates(unsigned);
    setSignedIds(signed);
    setLoading(false);

    if (unsigned.length === 0) {
      onAllSigned();
      onSkip?.();
    }
  }, [appliesTo, eventId, onAllSigned, onSkip]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleSign() {
    const template = templates[currentIdx];
    if (!template || !agreed || fullName.trim().length < 2) return;

    setSaving(true);
    setError("");

    const res = await fetch("/api/indemnity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: template.id,
        full_name: fullName.trim(),
        event_id: eventId || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to sign");
      setSaving(false);
      return;
    }

    const newSigned = new Set(signedIds);
    newSigned.add(template.id);
    setSignedIds(newSigned);

    // Move to next or complete
    if (currentIdx + 1 >= templates.length) {
      onAllSigned();
    } else {
      setCurrentIdx(currentIdx + 1);
      setAgreed(false);
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="skeleton h-40 rounded-xl" />;
  }

  if (templates.length === 0) {
    return null;
  }

  const template = templates[currentIdx];
  if (!template) return null;

  return (
    <div className="rounded-xl border border-black/10 bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-(--gold-soft) px-5 py-3 border-b border-(--gold)/20">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-black">{template.title}</h3>
          <span className="text-xs text-black/50">
            {currentIdx + 1} of {templates.length}
          </span>
        </div>
        <p className="text-xs text-black/60 mt-0.5">
          Please read and sign below to continue.
        </p>
      </div>

      {/* Legal body */}
      <div className="px-5 py-4 max-h-64 overflow-y-auto text-sm text-black/80 leading-relaxed whitespace-pre-wrap">
        {template.body.replace(/^##\s+.+\n\n/, "")}
      </div>

      {/* Signature area */}
      <div className="border-t border-black/5 px-5 py-4 space-y-3">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="indemnity-name"
            className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/75"
          >
            Full Legal Name (as signature)
          </label>
          <input
            id="indemnity-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
            placeholder="Your full name"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-black/75 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span>
            I have read, understood, and agree to the terms above.
          </span>
        </label>

        <button
          type="button"
          onClick={handleSign}
          disabled={saving || !agreed || fullName.trim().length < 2}
          className="w-full rounded-xl bg-(--gold) px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Signing..." : "Sign & Continue"}
        </button>
      </div>
    </div>
  );
}
