"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/db";

interface MessageWithProfile extends Message {
  profiles?: { full_name: string; avatar_url: string | null } | null;
}

interface Props {
  conversationId: string;
  userId: string;
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

export default function ChatView({ conversationId, userId }: Props) {
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

  // Mark as read
  const markRead = useCallback(async () => {
    await fetch(`/api/conversations/${conversationId}/read`, { method: "PATCH" });
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    markRead();

    // Subscribe to new messages in this conversation
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageWithProfile;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          markRead();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, fetchMessages, markRead]);

  // Auto-scroll to bottom only when new messages are appended
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
    // Re-enable auto-scroll for subsequent new messages
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

  // Pre-compute which messages should display a date separator
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
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-black/10" />
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
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
        <button
          onClick={() => router.push("/messages")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-black/60 transition hover:bg-black/5 md:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--gold-soft) text-sm font-bold uppercase text-black">
          {otherUser?.full_name?.[0] || "?"}
        </div>
        <div className="min-w-0">
          {otherUser?.deleted_at ? (
            <p className="truncate text-sm font-semibold text-black/40">
              <s>{otherUser.full_name}</s>
              <span className="ml-1.5 text-xs font-normal text-black/30">account deleted</span>
            </p>
          ) : (
            <p className="truncate text-sm font-semibold text-black">
              {otherUser?.full_name || "Unknown"}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3">
        {hasMore && (
          <div className="mb-4 text-center">
            <button
              onClick={loadMore}
              className="text-xs text-black/50 transition hover:text-black/70"
            >
              Load earlier messages
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-black/40">
              Send a message to start the conversation
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          const showDateSeparator = dateSeparators.has(msg.id);

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="my-4 flex items-center gap-2">
                  <hr className="flex-1 border-black/10" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-black/30">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                  <hr className="flex-1 border-black/10" />
                </div>
              )}
              <div className={`mb-2 flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                    isMine
                      ? "bg-(--gold) text-black"
                      : "bg-black/[0.06] text-black"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {msg.body}
                  </p>
                  <p className={`mt-0.5 text-right text-[10px] ${isMine ? "text-black/50" : "text-black/35"}`}>
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
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t bg-white px-4 py-3"
      >
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-black/10 bg-black/[0.02] px-3.5 py-2.5 text-sm text-black placeholder:text-black/35 focus:border-(--gold) focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--gold) text-black transition hover:brightness-105 disabled:opacity-40"
        >
          {sending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
