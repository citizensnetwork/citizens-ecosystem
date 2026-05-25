"use client";

import { useState } from "react";
import { CONTRIBUTOR_KIND_LABELS, type ContributorKind } from "@/types/db";

const VALID_KINDS: ContributorKind[] = ["ministry", "organization", "business"];
const MAX_REASON = 1000;

interface Props {
  currentKind: ContributorKind | null;
}

export default function ContributorTypeChangeRequest({ currentKind }: Props) {
  const [requestedKind, setRequestedKind] = useState<ContributorKind | "">(
    ""
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestedKind) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/contributor/type-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requested_kind: requestedKind, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Request failed."
        );
      }
      setMessage({
        type: "success",
        text: "Your request has been submitted. An admin will review it shortly.",
      });
      setRequestedKind("");
      setReason("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-semibold mb-1">Change Contributor Type</h2>
      <p className="text-sm text-black/60 mb-4">
        Changing your contributor type requires admin review. Submit a request
        below and we&apos;ll process it as soon as possible. Your current type
        remains active until the request is approved.
      </p>
      {currentKind && (
        <p className="text-sm text-black/50 mb-4">
          Current type:{" "}
          <span className="font-medium text-black">
            {CONTRIBUTOR_KIND_LABELS[currentKind]}
          </span>
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="requested-kind" className="block text-sm font-medium text-black/70">
            Request type change to
          </label>
          <select
            id="requested-kind"
            value={requestedKind}
            onChange={(e) =>
              setRequestedKind(e.target.value as ContributorKind | "")
            }
            className="w-full rounded-lg border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-black/30"
          >
            <option value="">Select new type…</option>
            {VALID_KINDS.filter((k) => k !== currentKind).map((k) => (
              <option key={k} value={k}>
                {CONTRIBUTOR_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="type-change-reason" className="block text-sm font-medium text-black/70">
            Reason{" "}
            <span className="font-normal text-black/40">(optional)</span>
          </label>
          <textarea
            id="type-change-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON}
            rows={3}
            placeholder="Briefly explain why you'd like to change your contributor type…"
            className="w-full rounded-lg border border-black/12 px-3 py-2 text-sm resize-none outline-none focus:border-black/30"
          />
          <p className="text-right text-xs text-black/30">
            {reason.length}/{MAX_REASON}
          </p>
        </div>
        {message && (
          <p
            role="alert"
            className={`text-sm ${
              message.type === "error" ? "text-red-600" : "text-green-700"
            }`}
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !requestedKind}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
        >
          {saving ? "Submitting…" : "Submit Request"}
        </button>
      </form>
    </>
  );
}
