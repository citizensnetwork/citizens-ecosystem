"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { share } from "@/lib/capacitor/share";
import { logShare } from "@/lib/analytics/logShare";

type ConsiderItem = {
  rsvp_id: string;
  event_id: string;
  title: string;
  date: string;
  join_count: number;
  joiners: { full_name: string }[];
};

type Props = {
  userId: string;
};

export default function ConsiderBadge({ userId }: Props) {
  const [items, setItems] = useState<ConsiderItem[]>([]);
  const [open, setOpen] = useState(false);
  const [friendsPopup, setFriendsPopup] = useState<string | null>(null); // rsvp_id
  const [sharePopup, setSharePopup] = useState<string | null>(null); // event_id
  const [removing, setRemoving] = useState<string | null>(null);
  const supabase = createClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchConsiders = useCallback(async () => {
    // Get user's considers — only future/today events (not expired)
    const today = new Date().toISOString().split("T")[0];
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("id, event_id, events(title, date)")
      .eq("user_id", userId)
      .eq("status", "considering")
      .gte("events.date", today);

    if (!rsvps || rsvps.length === 0) {
      setItems([]);
      return;
    }

    // Filter out rsvps where the event join returned null (expired events)
    const validRsvps = rsvps.filter(
      (r) => (r as Record<string, unknown>).events != null
    );

    if (validRsvps.length === 0) {
      setItems([]);
      return;
    }

    // Get join counts for each consider
    const rsvpIds = validRsvps.map((r) => r.id);
    const { data: joins } = await supabase
      .from("consider_joins")
      .select("rsvp_id, profiles(full_name)")
      .in("rsvp_id", rsvpIds);

    const result: ConsiderItem[] = validRsvps.map((r) => {
      const rsvpJoins = (joins ?? []).filter((j) => j.rsvp_id === r.id);
      const ev = (r as Record<string, unknown>).events as {
        title: string;
        date: string;
      } | null;
      return {
        rsvp_id: r.id,
        event_id: r.event_id,
        title: ev?.title ?? "Event",
        date: ev?.date ?? "",
        join_count: rsvpJoins.length,
        joiners: rsvpJoins.map((j) => ({
          full_name:
            (
              (j as Record<string, unknown>).profiles as {
                full_name: string;
              } | null
            )?.full_name ?? "Someone",
        })),
      };
    });

    setItems(result);
  }, [userId, supabase]);

  useEffect(() => {
    fetchConsiders();
  }, [fetchConsiders]);

  async function handleRemove(eventId: string) {
    setRemoving(eventId);
    await fetch("/api/consider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId }),
    });
    setItems((prev) => prev.filter((i) => i.event_id !== eventId));
    setRemoving(null);
  }

  async function handleShare(eventId: string, title: string) {
    const url = `${window.location.origin}/events/${eventId}`;
    await share({ title, url });
    logShare("event", eventId);
    setSharePopup(null);
  }

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-black/60 transition hover:bg-black/5 hover:text-black"
        title="Considering"
        aria-label={`${items.length} events considering`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        {/* Count badge */}
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--gold) px-1 text-[10px] font-bold text-black">
          {items.length}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setFriendsPopup(null);
              setSharePopup(null);
            }}
          />
          <div
            ref={panelRef}
            className="absolute right-0 z-50 mt-1 w-80 rounded-xl border border-black/10 bg-white/30 py-2 shadow-lg backdrop-blur-md"
          >
            <h3 className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-black/50">
              Considering
            </h3>
            {items.map((item) => (
              <div
                key={item.rsvp_id}
                className="group relative flex items-center gap-2 px-4 py-2 transition hover:bg-black/5"
              >
                {/* Event title — links to event page */}
                <a
                  href={`/events/${item.event_id}`}
                  className="min-w-0 flex-1"
                  onClick={() => setOpen(false)}
                >
                  <p className="truncate text-sm font-medium text-black hover:underline">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-black/40">
                    {item.date
                      ? new Date(item.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </p>
                </a>

                {/* Friend join badge (+count in green) */}
                {item.join_count > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFriendsPopup(
                        friendsPopup === item.rsvp_id
                          ? null
                          : item.rsvp_id
                      );
                      setSharePopup(null);
                    }}
                    className="flex h-6 items-center rounded-full bg-green-500/15 px-2 text-xs font-bold text-green-600 transition hover:bg-green-500/25"
                    aria-label="Friends joined"
                  >
                    +{item.join_count}
                  </button>
                )}

                {/* Share button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSharePopup(
                      sharePopup === item.event_id ? null : item.event_id
                    );
                    setFriendsPopup(null);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-black/40 transition hover:bg-black/10 hover:text-black/70"
                  aria-label="Share"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>

                {/* Remove (circled minus) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item.event_id);
                  }}
                  disabled={removing === item.event_id}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-black/15 text-black/40 transition hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  aria-label="Remove consideration"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {/* Friends popup (30% opacity) */}
                {friendsPopup === item.rsvp_id && item.join_count > 0 && (
                  <div className="absolute left-4 top-full z-60 mt-1 w-56 rounded-xl border border-black/10 bg-white/30 p-3 shadow-lg backdrop-blur-md">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-black/50">
                      Friends joined
                    </p>
                    {item.joiners.map((j, i) => (
                      <p
                        key={i}
                        className="py-0.5 text-xs text-black/80"
                      >
                        {j.full_name}
                      </p>
                    ))}
                  </div>
                )}

                {/* Share popup (30% opacity) */}
                {sharePopup === item.event_id && (
                  <div className="absolute right-4 top-full z-60 mt-1 w-52 rounded-xl border border-black/10 bg-white/30 p-3 shadow-lg backdrop-blur-md">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-black/50">
                      Share event
                    </p>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleShare(item.event_id, item.title)
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-black/80 transition hover:bg-black/5"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line
                            x1="8.59"
                            y1="13.51"
                            x2="15.42"
                            y2="17.49"
                          />
                          <line
                            x1="15.41"
                            y1="6.51"
                            x2="8.59"
                            y2="10.49"
                          />
                        </svg>
                        Native Share
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/events/${item.event_id}`;
                          window.open(
                            `https://wa.me/?text=${encodeURIComponent(`${item.title} ${url}`)}`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                          logShare("event", item.event_id);
                          setSharePopup(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-black/80 transition hover:bg-black/5"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="#25D366"
                          aria-hidden="true"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.6-1.472A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.78 9.78 0 0 1-5.09-1.42l-.365-.217-2.731.874.728-2.655-.238-.378A9.78 9.78 0 0 1 2.182 12 9.818 9.818 0 1 1 12 21.818z" />
                        </svg>
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/events/${item.event_id}`;
                          navigator.clipboard.writeText(url);
                          logShare("event", item.event_id);
                          setSharePopup(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-black/80 transition hover:bg-black/5"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                          />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
