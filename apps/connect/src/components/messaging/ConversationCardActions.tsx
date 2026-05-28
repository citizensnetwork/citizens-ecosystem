"use client";

import { useState } from "react";
import { BellOff, Bell, Trash2, Flag, Ban } from "lucide-react";

interface Props {
  conversationId: string;
  otherUserId: string;
  isMuted: boolean;
  onMuteToggled: (nowMuted: boolean) => void;
  onDeleted: () => void;
  onReported: () => void;
  onBlocked: () => void;
}

/**
 * Mute · Delete · Report · Block action row for any conversation card.
 * Rendered at the end of each conversation row in the floating panel
 * and inline in ChatView.
 */
export default function ConversationCardActions({
  conversationId,
  otherUserId,
  isMuted,
  onMuteToggled,
  onDeleted,
  onReported,
  onBlocked,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMute() {
    setLoading("mute");
    const action = isMuted ? "unmute" : "mute";
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    if (res.ok) onMuteToggled(!isMuted);
    else setError("Failed to update mute.");
  }

  async function handleDelete() {
    if (!confirm("Remove this conversation from your inbox?")) return;
    setLoading("delete");
    const res = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    setLoading(null);
    if (res.ok) onDeleted();
    else setError("Failed to delete conversation.");
  }

  async function handleReport(reason: string) {
    setLoading("report");
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_type: "conversation",
        target_id: conversationId,
        reason,
      }),
    });
    setLoading(null);
    setReportOpen(false);
    if (res.ok) onReported();
    else if (res.status === 409) setError("Already reported.");
    else setError("Failed to report.");
  }

  async function handleBlock() {
    if (!confirm("Block this user? They won't be able to message you.")) return;
    setLoading("block");
    const res = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocked_id: otherUserId }),
    });
    setLoading(null);
    if (res.ok) {
      // Also delete the conversation thread from this user's view
      await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      onBlocked();
    } else {
      setError("Failed to block user.");
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1 px-1">
        {/* Mute */}
        <ActionButton
          onClick={handleMute}
          disabled={loading !== null}
          title={isMuted ? "Unmute" : "Mute"}
          icon={isMuted
            ? <Bell size={14} className="text-black/50" />
            : <BellOff size={14} className="text-black/50" />
          }
        />

        {/* Delete */}
        <ActionButton
          onClick={handleDelete}
          disabled={loading !== null}
          title="Delete"
          icon={<Trash2 size={14} className="text-black/50" />}
        />

        {/* Report */}
        <ActionButton
          onClick={() => setReportOpen((o) => !o)}
          disabled={loading !== null}
          title="Report"
          icon={<Flag size={14} className="text-black/50" />}
        />

        {/* Block */}
        <ActionButton
          onClick={handleBlock}
          disabled={loading !== null}
          title="Block"
          icon={<Ban size={14} className="text-red-400" />}
        />
      </div>

      {/* Report reason picker */}
      {reportOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-black/10 bg-white py-1 shadow-lg">
          {(["spam", "harassment", "hate_speech", "other"] as const).map((reason) => (
            <button
              key={reason}
              onClick={() => handleReport(reason)}
              disabled={loading === "report"}
              className="w-full px-3 py-2 text-left text-xs capitalize text-black/70 hover:bg-black/[0.04]"
            >
              {reason.replace("_", " ")}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-1 text-center text-[10px] text-red-400">{error}</p>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  title,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/[0.05] disabled:opacity-40"
    >
      {icon}
    </button>
  );
}
