"use client";

import { useState } from "react";
import {
  BROADCAST_REACTION_EMOJI,
  type BroadcastReactionCounts,
  type BroadcastReactionEmoji,
} from "@/lib/broadcasts";

type Props = {
  broadcastId: string;
  /** Aggregate, identity-free counts keyed by emoji. */
  initialCounts?: BroadcastReactionCounts;
};

/**
 * BroadcastReactions — five fixed emoji with aggregate counts beneath a
 * broadcast card. Anonymous: posts to /api/broadcasts/[id]/react which only
 * increments a per-(broadcast, emoji) counter. No identity is shown or stored.
 *
 * Optimistic: the count bumps immediately and rolls back if the request fails.
 */
export default function BroadcastReactions({ broadcastId, initialCounts }: Props) {
  const [counts, setCounts] = useState<BroadcastReactionCounts>(
    initialCounts ?? {},
  );
  const [pending, setPending] = useState<BroadcastReactionEmoji | null>(null);

  async function react(emoji: BroadcastReactionEmoji) {
    if (pending) return;
    setPending(emoji);
    const prev = counts[emoji] ?? 0;
    setCounts((c) => ({ ...c, [emoji]: prev + 1 }));

    try {
      const res = await fetch(`/api/broadcasts/${broadcastId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("react failed");
      const json = (await res.json()) as { count?: number };
      if (typeof json.count === "number") {
        setCounts((c) => ({ ...c, [emoji]: json.count as number }));
      }
    } catch {
      // Roll back the optimistic bump.
      setCounts((c) => ({ ...c, [emoji]: prev }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5"
      role="group"
      aria-label="React to this message"
    >
      {BROADCAST_REACTION_EMOJI.map((emoji) => {
        const count = counts[emoji] ?? 0;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            disabled={pending !== null}
            aria-label={`React with ${emoji}${count > 0 ? `, ${count} so far` : ""}`}
            className="inline-flex items-center gap-1 rounded-full border border-(--gold)/30 bg-white/70 px-2.5 py-1 text-sm leading-none text-black/70 transition hover:border-(--gold)/60 hover:bg-(--gold-soft) active:scale-[0.96] disabled:opacity-60"
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && (
              <span className="text-xs font-medium tabular-nums text-black/60">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
