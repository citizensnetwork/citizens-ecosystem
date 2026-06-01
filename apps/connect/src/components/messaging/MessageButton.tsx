"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openMessageThread } from "@/lib/messaging/messagePanelBus";

type Props = {
  recipientId: string;
  recipientName: string;
  variant?: "button" | "icon";
};

export default function MessageButton({
  recipientId,
  recipientName,
  variant = "button",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: recipientId }),
      });

      if (res.ok) {
        const { conversation_id } = await res.json();
        openMessageThread(conversation_id);
      } else if (res.status === 401) {
        router.push("/login");
      } else {
        setError("Could not start conversation");
      }
    } catch {
      setError("Network error");
    }

    setLoading(false);
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        title={error || `Message ${recipientName}`}
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition hover:bg-black/5 disabled:opacity-50 ${error ? "border-red-300 text-red-500" : "border-black/10 text-black/60 hover:text-black"}`}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-black/80 transition hover:bg-black/5 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {loading ? "Opening…" : `Message ${recipientName.split(" ")[0]}`}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
