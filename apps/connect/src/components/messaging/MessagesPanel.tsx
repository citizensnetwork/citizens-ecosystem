"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ConversationPreview } from "@/types/db";
import MessageRequestCard from "./MessageRequestCard";
import ConversationCardActions from "./ConversationCardActions";
import ChatView from "./ChatView";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days < 7
    ? `${days}d`
    : new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

interface Props {
  userId: string;
  /** Total unread count — passed up to parent (Navbar) for the badge */
  onUnreadChange?: (count: number) => void;
  onClose: () => void;
}

/**
 * Floating messages panel — sits below the Navbar and spans to ~50vh.
 * Shows either the conversation list or an inline ChatView when a thread
 * is selected.
 *
 * Style: glassmorphism — 90% white + gold tint, thin black border,
 * backdrop-blur-sm. The blur is applied progressively; on low-end devices
 * the browser degrades gracefully to the solid bg-white/90 fallback.
 */
export default function MessagesPanel({ userId, onUnreadChange, onClose }: Props) {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      const convs: ConversationPreview[] = data.conversations ?? [];
      setConversations(convs);
      const totalUnread = convs.reduce((s, c) => s + c.unread_count, 0);
      onUnreadChange?.(totalUnread);
    }
    setLoading(false);
  }, [onUnreadChange]);

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("messages-panel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchConversations]);

  function removeConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function markAccepted(id: string) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "active" as const } : c))
    );
  }

  function toggleMuted(id: string, nowMuted: boolean) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, muted: nowMuted } : c))
    );
  }

  // Sort: pending requests first, then by updated_at
  const sorted = [...conversations].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);
  const selectedConv = conversations.find((c) => c.id === selectedId);

  return (
    <>
      {/* Backdrop — closes panel on outside click */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      {/* Panel */}
      <div
        className={[
          "fixed right-4 top-14 z-[9999]",
          "w-[360px] max-h-[calc(50vh)] min-h-[200px]",
          "flex flex-col overflow-hidden",
          "rounded-xl border border-black/10",
          // Glassmorphism: backdrop-blur with solid fallback
          "bg-white/90 backdrop-blur-sm",
          // Gold tint via box-shadow + border
          "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12),inset_0_0_0_1px_rgba(184,152,82,0.12)]",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3">
          {selectedId && selectedConv ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedId(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-black/50 transition hover:bg-black/[0.05] hover:text-black"
                aria-label="Back to conversations"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-bold uppercase text-amber-800">
                {selectedConv.other_user.full_name?.[0] || "?"}
              </div>
              {selectedConv.other_user.deleted_at ? (
                <span className="truncate text-sm font-semibold text-black/40">
                  <s>{selectedConv.other_user.full_name}</s>
                </span>
              ) : (
                <span className="truncate text-sm font-semibold text-black">
                  {selectedConv.other_user.full_name || "Unknown"}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-black">Messages</span>
              {totalUnread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/80 px-1.5 text-[10px] font-bold text-black">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-black/30 transition hover:bg-black/[0.05] hover:text-black"
            aria-label="Close messages"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {selectedId ? (
            /* Inline chat view */
            <div className="flex h-[calc(50vh-56px)] flex-col">
              <ChatView conversationId={selectedId} userId={userId} />
            </div>
          ) : loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-black/8" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 rounded bg-black/8" />
                    <div className="h-3 w-44 rounded bg-black/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.04]">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-black/25">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-black/50">No conversations yet</p>
              <p className="mt-1 text-xs text-black/35">
                Message an organiser from an event or profile
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {sorted.map((conv) =>
                conv.status === "pending" ? (
                  /* Message request card */
                  <li key={conv.id} className="p-3">
                    <MessageRequestCard
                      conversation={conv}
                      onAccepted={() => markAccepted(conv.id)}
                      onDenied={() => removeConversation(conv.id)}
                    />
                  </li>
                ) : (
                  /* Regular conversation row */
                  <li key={conv.id} className="group">
                    <div className="flex items-stretch">
                      {/* Clickable area */}
                      <button
                        onClick={() => setSelectedId(conv.id)}
                        className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.025]"
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-xs font-bold uppercase text-amber-800">
                            {conv.other_user.full_name?.[0] || "?"}
                          </div>
                          {conv.unread_count > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
                              {conv.unread_count > 9 ? "9+" : conv.unread_count}
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            {conv.other_user.deleted_at ? (
                              <span className="truncate text-sm font-medium leading-tight text-black/40">
                                <s>{conv.other_user.full_name || "Unknown"}</s>
                              </span>
                            ) : (
                              <span className={`truncate text-sm leading-tight ${conv.unread_count > 0 ? "font-semibold text-black" : "font-medium text-black/75"}`}>
                                {conv.other_user.full_name || "Unknown"}
                              </span>
                            )}
                            {conv.last_message && (
                              <span className="shrink-0 text-[10px] text-black/35">
                                {timeAgo(conv.last_message.created_at)}
                              </span>
                            )}
                          </div>
                          {conv.last_message && (
                            <p className={`mt-0.5 truncate text-xs leading-snug ${conv.unread_count > 0 ? "text-black/60" : "text-black/38"}`}>
                              {conv.last_message.sender_id === userId ? "You: " : ""}
                              {conv.last_message.body}
                            </p>
                          )}
                          {conv.muted && (
                            <span className="mt-0.5 inline-block text-[9px] uppercase tracking-wide text-black/25">
                              Muted
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Actions — slide in on hover */}
                      <div className="flex items-center pr-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <ConversationCardActions
                          conversationId={conv.id}
                          otherUserId={conv.other_user.id}
                          isMuted={conv.muted}
                          onMuteToggled={(nowMuted) => toggleMuted(conv.id, nowMuted)}
                          onDeleted={() => removeConversation(conv.id)}
                          onReported={() => {}}
                          onBlocked={() => removeConversation(conv.id)}
                        />
                      </div>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
