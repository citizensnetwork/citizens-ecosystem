"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ConversationPreview } from "@/types/db";
import { createClient } from "@/lib/supabase/client";

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
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

interface Props {
  userId: string;
}

export default function ConversationList({ userId }: Props) {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
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

    // Subscribe to new messages for realtime updates
    const channel = supabase
      .channel("conversation-list")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchConversations]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-12 w-12 rounded-full bg-black/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-black/10" />
              <div className="h-3 w-48 rounded bg-black/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/5">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-black/30">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-black/60">No conversations yet</p>
        <p className="mt-1 text-xs text-black/40">
          Start a conversation from an event or someone&apos;s profile
        </p>
      </div>
    );
  }

  return (
    <div>
      {totalUnread > 0 && (
        <div className="border-b px-4 py-2">
          <span className="text-xs font-medium text-black/50">
            {totalUnread} unread message{totalUnread !== 1 ? "s" : ""}
          </span>
        </div>
      )}
      <ul className="divide-y">
        {conversations.map((conv) => (
          <li key={conv.id}>
            <button
              onClick={() => router.push(`/messages/${conv.id}`)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.03]"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--gold-soft) text-sm font-bold uppercase text-black">
                  {conv.other_user.full_name?.[0] || "?"}
                </div>
                {conv.unread_count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-(--gold) text-[10px] font-bold text-black">
                    {conv.unread_count > 9 ? "9+" : conv.unread_count}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className={`truncate text-sm ${conv.unread_count > 0 ? "font-semibold text-black" : "font-medium text-black/80"}`}>
                    {conv.other_user.full_name || "Unknown"}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-black/40">
                    {conv.last_message ? timeAgo(conv.last_message.created_at) : ""}
                  </span>
                </div>
                {conv.last_message && (
                  <p className={`truncate text-xs ${conv.unread_count > 0 ? "text-black/70" : "text-black/45"}`}>
                    {conv.last_message.sender_id === userId ? "You: " : ""}
                    {conv.last_message.body}
                  </p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
