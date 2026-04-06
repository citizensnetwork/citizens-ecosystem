"use client";

import { useRef, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Comment } from "@/types/db";
import type { User } from "@supabase/supabase-js";

type Props = {
  eventId: string;
  user: User | null;
};

export default function CommentSection({ eventId, user }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    let cancelled = false;
    async function fetchComments() {
      const { data } = await supabase
        .from("comments")
        .select("*, profiles(full_name)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setComments((data as Comment[]) ?? []);
        setFetching(false);
      }
    }
    fetchComments();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !user) return;
    setLoading(true);

    await supabase.from("comments").insert({
      event_id: eventId,
      user_id: user.id,
      body: body.trim(),
    });

    setBody("");
    const { data } = await supabase
      .from("comments")
      .select("*, profiles(full_name)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("comments").delete().eq("id", id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        Comments{" "}
        {!fetching && (
          <span className="text-sm font-normal text-gray-400">
            ({comments.length})
          </span>
        )}
      </h2>

      {/* Comment list */}
      {fetching ? (
        <p className="text-sm text-gray-400">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-500">
          No comments yet. Be the first to say something!
        </p>
      ) : (
        <ul className="space-y-4 mb-6">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-(--gold-soft) text-black flex items-center justify-center text-xs font-bold uppercase shrink-0">
                {c.profiles?.full_name?.[0] ?? "?"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {c.profiles?.full_name ?? "User"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {user?.id === c.user_id && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="ml-auto text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Comment form */}
      {user ? (
        <form onSubmit={handleSubmit} className="flex gap-2 items-start">
          <div className="w-8 h-8 rounded-full bg-(--gold-soft) text-black flex items-center justify-center text-xs font-bold uppercase shrink-0 mt-1">
            {(user.user_metadata?.full_name?.[0] ?? user.email?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              maxLength={1000}
              className="w-full border rounded-md px-3 py-2 text-sm resize-none"
            />
            <button
              type="submit"
              disabled={loading || !body.trim()}
              className="mt-1.5 px-4 py-1.5 bg-(--gold) text-black text-sm rounded-md hover:brightness-95 disabled:opacity-50"
            >
              {loading ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-gray-500">
          <Link href="/login" className="text-(--gold) hover:underline">
            Log in
          </Link>{" "}
          to leave a comment.
        </p>
      )}
    </div>
  );
}
