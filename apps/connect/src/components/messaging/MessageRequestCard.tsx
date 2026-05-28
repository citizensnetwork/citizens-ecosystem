"use client";

import { useState } from "react";
import type { ConversationPreview } from "@/types/db";

interface Props {
  conversation: ConversationPreview;
  /** Called after the user allows the request (conversation is now active). */
  onAccepted: () => void;
  /** Called after the user denies the request (conversation is deleted). */
  onDenied: () => void;
}

/**
 * Renders an incoming message request card.
 * When a Contributor initiates contact with a Citizen the conversation is
 * created with status='pending'. This component shows the Allow / Deny UI
 * until the recipient makes a choice.
 */
export default function MessageRequestCard({ conversation, onAccepted, onDenied }: Props) {
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "accept" | "reject") {
    setLoading(action);
    setError(null);

    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      setError("Something went wrong. Please try again.");
      setLoading(null);
      return;
    }

    if (action === "accept") {
      onAccepted();
    } else {
      onDenied();
    }
    setLoading(null);
  }

  const orgName = conversation.other_user.full_name || "An organisation";
  const preview = conversation.last_message?.body;

  return (
    <div className="relative overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
      {/* Request overlay */}
      <div className="flex flex-col gap-3 p-4">
        {/* Avatar + name row */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-sm font-bold uppercase text-amber-800">
            {orgName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-black/50">New message request</p>
            <p className="truncate text-sm font-semibold text-black">{orgName}</p>
          </div>
        </div>

        {/* Request message */}
        <div className="rounded-lg bg-black/[0.03] px-3 py-2.5">
          <p className="text-sm text-black/60">
            <span className="font-medium text-black">{orgName}</span> has reached out to you.
          </p>
          {preview && (
            <p className="mt-1 line-clamp-2 text-xs text-black/40">{preview}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction("accept")}
            disabled={loading !== null}
            className="flex-1 rounded-lg bg-black py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
          >
            {loading === "accept" ? "Allowing…" : "Allow"}
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading !== null}
            className="flex-1 rounded-lg border border-black/15 py-2 text-sm font-medium text-black/70 transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            {loading === "reject" ? "Declining…" : "Decline"}
          </button>
        </div>

        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
