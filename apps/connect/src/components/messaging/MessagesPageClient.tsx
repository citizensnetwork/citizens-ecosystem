"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ConversationPreview } from "@/types/db";
import ChatView from "./ChatView";
import MessageRequestCard from "./MessageRequestCard";
import ConversationCardActions from "./ConversationCardActions";

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
  /** If the page was navigated to with a pre-selected conversation (deep link) */
  initialConvId?: string | null;
}

export default function MessagesPageClient({ userId, initialConvId }: Props) {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialConvId ?? null);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConversations();
    const channel = supabase
      .channel("messages-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchConversations())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => fetchConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchConversations]);

  function removeConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function markAccepted(id: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, status: "active" as const } : c)));
  }

  function toggleMuted(id: string, nowMuted: boolean) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, muted: nowMuted } : c)));
  }

  function handleConvClick(convId: string) {
    // On mobile (no split panel): navigate to the thread page
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      router.push(`/messages/${convId}`);
    } else {
      setSelectedId(convId);
    }
  }

  const sorted = [...conversations].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const filtered = search.trim()
    ? sorted.filter((c) => c.other_user.full_name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  return (
    <div className="flex overflow-hidden bg-background" style={{ height: "calc(100dvh - 4rem)", minHeight: 0 }}>
      {/* Conversation list */}
      <div className={`flex flex-col w-full md:w-80 md:border-r border-border bg-background shrink-0 ${selectedId ? "hidden md:flex" : "flex"}`}>
        {/* Header */}
        <div className="px-5 py-5 border-b border-border">
          <h2 className="text-foreground" style={{ fontFamily: "Playfair Display, serif" }}>
            Messages
          </h2>
          <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-muted rounded-xl">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-px">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="h-12 w-12 rounded-xl bg-black/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 rounded bg-black/8" />
                    <div className="h-3 w-44 rounded bg-black/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center mx-auto mb-3 shadow-md">
                <MessageCircle size={22} className="text-white" />
              </div>
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Message someone from their profile or event page
              </p>
            </div>
          ) : (
            filtered.map((conv) =>
              conv.status === "pending" ? (
                <div key={conv.id} className="p-3 border-b border-border/50">
                  <MessageRequestCard
                    conversation={conv}
                    onAccepted={() => markAccepted(conv.id)}
                    onDenied={() => removeConversation(conv.id)}
                  />
                </div>
              ) : (
                <div key={conv.id} className="group">
                  <div className="flex items-stretch border-b border-border/50">
                    <button
                      onClick={() => handleConvClick(conv.id)}
                      className={`flex flex-1 items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/40 ${selectedId === conv.id ? "bg-accent/60" : ""}`}
                    >
                      {/* Avatar with org badge */}
                      <div className="relative shrink-0">
                        {conv.other_user.avatar_url ? (
                          <img
                            src={conv.other_user.avatar_url}
                            alt={conv.other_user.full_name}
                            className="w-12 h-12 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#F2E8CC] flex items-center justify-center text-sm font-bold uppercase text-[#8B6914]">
                            {conv.other_user.full_name?.[0] || "?"}
                          </div>
                        )}
                        {conv.other_user.is_contributor && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#C9A84C] rounded-full border-2 border-background flex items-center justify-center text-[7px] font-bold text-white">
                            ✦
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          {conv.other_user.deleted_at ? (
                            <p className="text-sm font-bold text-foreground/40 truncate">
                              <s>{conv.other_user.full_name}</s>
                            </p>
                          ) : (
                            <p className={`text-sm truncate ${conv.unread_count > 0 ? "font-bold text-foreground" : "font-semibold text-foreground/80"}`}>
                              {conv.other_user.full_name}
                            </p>
                          )}
                          {conv.last_message && (
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                              {timeAgo(conv.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        {conv.last_message && (
                          <p className={`text-xs truncate ${conv.unread_count > 0 ? "text-foreground/70" : "text-muted-foreground"}`}>
                            {conv.last_message.sender_id === userId ? "You: " : ""}
                            {conv.last_message.body}
                          </p>
                        )}
                        {conv.muted && (
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground/50">
                            Muted
                          </span>
                        )}
                      </div>

                      {/* Unread badge */}
                      {conv.unread_count > 0 && (
                        <span className="w-5 h-5 bg-[#C9A84C] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {conv.unread_count > 9 ? "9+" : conv.unread_count}
                        </span>
                      )}
                    </button>

                    {/* Hover actions */}
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
                </div>
              )
            )
          )}
        </div>

        {/* New message CTA */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => router.push("/events")}
            title="Find people on the map to message"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-colors"
          >
            <Plus size={16} /> Find People
          </button>
        </div>
      </div>

      {/* Chat view (desktop split panel) */}
      {selectedId ? (
        <div className="flex-1 flex flex-col overflow-hidden hidden md:flex">
          <ChatView
            conversationId={selectedId}
            userId={userId}
            showBack={false}
            onBack={() => setSelectedId(null)}
          />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center mx-auto mb-4 shadow-lg">
              <MessageCircle size={28} className="text-white" />
            </div>
            <h3 className="text-foreground mb-2" style={{ fontFamily: "Playfair Display, serif" }}>
              Your Messages
            </h3>
            <p className="text-sm text-muted-foreground">Select a conversation to read and reply</p>
          </div>
        </div>
      )}
    </div>
  );
}
