"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/db";

interface MessageWithProfile extends Message {
  profiles?: { full_name: string; avatar_url: string | null } | null;
}

interface Props {
  conversationId: string;
  userId: string;
  /** When true, render a mobile-style back button in the header */
  showBack?: boolean;
  onBack?: () => void;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
}

export default function ChatView({ conversationId, userId, showBack, onBack }: Props) {
  const [messages, setMessages] = useState<MessageWithProfile[]>([]);
  const [otherUser, setOtherUser] = useState<{ id: string; full_name: string; avatar_url: string | null; deleted_at?: string | null } | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setOtherUser(data.other_user);
      setHasMore(data.has_more);
    } else if (res.status === 403) {
      router.push("/messages");
    }
    setLoading(false);
  }, [conversationId, router]);

  const markRead = useCallback(async () => {
    await fetch(`/api/conversations/${conversationId}/read`, { method: "PATCH" });
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    markRead();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const newMsg = payload.new as MessageWithProfile;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        markRead();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, fetchMessages, markRead]);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function loadMore() {
    if (!hasMore || messages.length === 0) return;
    shouldAutoScroll.current = false;
    const oldestId = messages[0].id;
    const res = await fetch(`/api/conversations/${conversationId}/messages?before=${oldestId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(data.has_more);
    }
    shouldAutoScroll.current = true;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = newMessage.trim();
    if (!body || sending) return;
    setSending(true);
    setNewMessage("");
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const { message } = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    }
    setSending(false);
  }

  const dateSeparators = useMemo(() => {
    const separators = new Set<string>();
    let lastDate = "";
    for (const msg of messages) {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== lastDate) {
        separators.add(msg.id);
        lastDate = msgDate;
      }
    }
    return separators;
  }, [messages]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 glass">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-black/10" />
          <div className="h-4 w-28 animate-pulse rounded bg-black/10" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : ""}`}>
              <div className="h-10 w-48 animate-pulse rounded-2xl bg-black/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 glass">
        {(showBack || onBack) && (
          <button
            onClick={onBack ?? (() => router.push("/messages"))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/60 transition hover:bg-muted md:hidden"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {otherUser?.avatar_url ? (
          <img
            src={otherUser.avatar_url}
            alt={otherUser.full_name}
            className="h-9 w-9 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2E8CC] text-sm font-bold uppercase text-[#8B6914]">
            {otherUser?.full_name?.[0] || "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {otherUser?.deleted_at ? (
            <p className="truncate text-sm font-bold text-foreground/40">
              <s>{otherUser.full_name}</s>
              <span className="ml-1.5 text-xs font-normal text-foreground/30">deleted account</span>
            </p>
          ) : (
            <p className="truncate text-sm font-bold text-foreground">{otherUser?.full_name || "Unknown"}</p>
          )}
          {!otherUser?.deleted_at && (
            <p className="text-[10px] font-semibold text-[#16A34A]">● Active</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasMore && (
          <div className="mb-2 text-center">
            <button onClick={loadMore} className="text-xs text-muted-foreground transition hover:text-foreground">
              Load earlier messages
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Send a message to start the conversation</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          const showDateSeparator = dateSeparators.has(msg.id);
          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="my-4 flex items-center gap-2">
                  <hr className="flex-1 border-border" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                  <hr className="flex-1 border-border" />
                </div>
              )}
              <div className={`flex fade-in ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMine
                    ? "bg-foreground text-background rounded-br-sm"
                    : "glass border border-white/60 text-foreground rounded-bl-sm"
                }`}>
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p className={`text-[9px] mt-1 text-right ${isMine ? "text-white/50" : "text-muted-foreground"}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-4 border-t border-border glass">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
              }}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 max-h-32 min-h-[24px] resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              newMessage.trim() ? "bg-foreground text-background hover:bg-foreground/90" : "bg-muted text-muted-foreground"
            }`}
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
