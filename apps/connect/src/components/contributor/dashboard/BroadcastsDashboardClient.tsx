"use client";

/**
 * BroadcastsDashboardClient — Stage E.1 composer + history.
 *
 * Two view modes:
 *   • Directory: a contributor with no entity selected sees a list of their
 *     events and places, each with broadcast count + a "Compose" link that
 *     swaps into entity mode via search params.
 *   • Entity: composer (500-char text-only) + history list with soft-delete.
 *
 * All mutations go through `/api/contributor/[handle]/broadcasts`, which is
 * the single source of truth for dashboard-access checks, rate limiting,
 * fan-out notifications, and activity logging.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const BROADCAST_MAX = 500;

interface EntityWithCount {
  id: string;
  name: string;
  type: "event" | "place";
  broadcastCount: number;
}

interface EntityRef {
  id: string;
  name: string;
  type: "event" | "place";
}

interface BroadcastRow {
  id: string;
  body: string;
  created_at: string;
}

interface Props {
  slug: string;
  events: EntityWithCount[];
  places: EntityWithCount[];
  initialEntity: EntityRef | null;
  initialHistory: BroadcastRow[];
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BroadcastsDashboardClient({
  slug,
  events,
  places,
  initialEntity,
  initialHistory,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BroadcastRow[]>(initialHistory);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Entity is read fresh from props on every render so navigating between
  // directory ↔ entity via the URL keeps a single source of truth.
  const entity = initialEntity;

  async function send() {
    if (!entity) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/contributor/${encodeURIComponent(slug)}/broadcasts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entity_type: entity.type,
            entity_id: entity.id,
            body: trimmed,
          }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `Failed (${res.status})`);
      }
      const created = (await res.json()) as BroadcastRow;
      // Optimistic prepend — server is the authority but our payload above
      // already includes id/body/created_at returned from the insert.
      setHistory((prev) => [created, ...prev]);
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function softDelete(id: string) {
    if (pendingDelete) return;
    setPendingDelete(id);
    try {
      const res = await fetch(
        `/api/contributor/${encodeURIComponent(slug)}/broadcasts?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `Failed (${res.status})`);
      }
      setHistory((prev) => prev.filter((b) => b.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setPendingDelete(null);
    }
  }

  function entityHref(e: { id: string; type: "event" | "place" }): string {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("entity_type", e.type);
    sp.set("entity_id", e.id);
    return `/c/${slug}/dashboard/broadcasts?${sp.toString()}`;
  }

  // ── Entity mode ─────────────────────────────────────────────
  if (entity) {
    const remaining = BROADCAST_MAX - body.length;
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/c/${slug}/dashboard/broadcasts`}
            className="text-sm text-[--foreground-soft] hover:text-[--gold]"
          >
            ← All broadcasts
          </Link>
          <h2 className="text-base font-semibold">
            {entity.type === "event" ? "Event" : "Place"}: {entity.name}
          </h2>
        </div>

        <section className="surface-card rounded-2xl p-4 space-y-3">
          <label htmlFor="broadcast-body" className="block text-sm font-medium">
            Send a broadcast
          </label>
          <p className="text-xs text-[--foreground-soft]">
            Reaches{" "}
            {entity.type === "event"
              ? "everyone who RSVPed as attending"
              : "everyone who follows this place"}
            . 500 characters max, text only.
          </p>
          <textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BROADCAST_MAX))}
            placeholder="What would you like to share?"
            rows={4}
            maxLength={BROADCAST_MAX}
            aria-describedby="broadcast-remaining"
            className="w-full text-sm border border-[--border] rounded-xl px-3 py-2 bg-[--surface] resize-none focus:outline-none focus:border-[--gold]"
            disabled={sending}
          />
          <div className="flex items-center justify-between">
            <span
              id="broadcast-remaining"
              aria-live="polite"
              className={`text-xs ${remaining < 50 ? "text-amber-600" : "text-[--foreground-soft]"}`}
            >
              {remaining} characters left
            </span>
            <button
              type="button"
              onClick={send}
              disabled={sending || !body.trim()}
              className="text-sm px-4 py-1.5 rounded-xl bg-[--gold] text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {sending ? "Sending…" : "Send broadcast"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Recent broadcasts</h3>
          {history.length === 0 ? (
            <p className="text-sm text-[--foreground-soft]">
              No broadcasts yet for this {entity.type}.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((b) => (
                <li key={b.id} className="surface-card rounded-xl p-3 space-y-2">
                  <p className="text-sm whitespace-pre-wrap wrap-break-word">{b.body}</p>
                  <div className="flex items-center justify-between text-xs text-[--foreground-soft]">
                    <span>{timeAgo(b.created_at)}</span>
                    <button
                      type="button"
                      onClick={() => softDelete(b.id)}
                      disabled={pendingDelete === b.id}
                      className="hover:text-red-600 disabled:opacity-50"
                    >
                      {pendingDelete === b.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ── Directory mode ──────────────────────────────────────────
  const hasContent = events.length > 0 || places.length > 0;
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold">Broadcasts</h2>
        <p className="text-xs text-[--foreground-soft] mt-1">
          Choose an event or place to send a broadcast to your attendees or
          followers.
        </p>
      </div>

      {!hasContent && (
        <p className="text-sm text-[--foreground-soft]">
          You don&apos;t have any events or places yet. Create one to start
          broadcasting.
        </p>
      )}

      {events.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Events</h3>
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={entityHref(e)}
                  className="surface-card rounded-xl p-3 flex items-center justify-between hover:border-[--gold]/40 transition-colors"
                >
                  <span className="text-sm font-medium truncate">{e.name}</span>
                  <span className="text-xs text-[--foreground-soft] shrink-0 ml-3">
                    {e.broadcastCount} sent
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {places.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Places</h3>
          <ul className="space-y-2">
            {places.map((p) => (
              <li key={p.id}>
                <Link
                  href={entityHref(p)}
                  className="surface-card rounded-xl p-3 flex items-center justify-between hover:border-[--gold]/40 transition-colors"
                >
                  <span className="text-sm font-medium truncate">{p.name}</span>
                  <span className="text-xs text-[--foreground-soft] shrink-0 ml-3">
                    {p.broadcastCount} sent
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
