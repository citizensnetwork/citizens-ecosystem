"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConsiderItem = {
  rsvp_id: string;
  event_id: string;
  title: string;
  join_count: number;
  joiners: { full_name: string }[];
};

type Props = {
  userId: string;
};

export default function ConsiderBadge({ userId }: Props) {
  const [items, setItems] = useState<ConsiderItem[]>([]);
  const [open, setOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchConsiders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function fetchConsiders() {
    // Get user's considers (RSVPs with status 'considering')
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("id, event_id, events(title)")
      .eq("user_id", userId)
      .eq("status", "considering");

    if (!rsvps || rsvps.length === 0) {
      setItems([]);
      return;
    }

    // Get join counts for each consider
    const rsvpIds = rsvps.map((r) => r.id);
    const { data: joins } = await supabase
      .from("consider_joins")
      .select("rsvp_id, profiles(full_name)")
      .in("rsvp_id", rsvpIds);

    const result: ConsiderItem[] = rsvps.map((r) => {
      const rsvpJoins = (joins ?? []).filter((j) => j.rsvp_id === r.id);
      return {
        rsvp_id: r.id,
        event_id: r.event_id,
        title: ((r as Record<string, unknown>).events as { title: string } | null)?.title ?? "Event",
        join_count: rsvpJoins.length,
        joiners: rsvpJoins.map((j) => ({
          full_name: ((j as Record<string, unknown>).profiles as { full_name: string } | null)?.full_name ?? "Someone",
        })),
      };
    });

    setItems(result);
  }

  const totalJoins = items.reduce((acc, i) => acc + i.join_count, 0);

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
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        {/* Count badge */}
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--gold) px-1 text-[10px] font-bold text-black">
          {totalJoins > 0 ? `${items.length}·${totalJoins}` : items.length}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-72 rounded-xl border bg-white py-2 shadow-lg">
            <h3 className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-black/50">
              Considering
            </h3>
            {items.map((item) => (
              <a
                key={item.rsvp_id}
                href={`/events/${item.event_id}`}
                className="block px-4 py-2 hover:bg-black/5 transition"
                onClick={() => setOpen(false)}
              >
                <p className="text-sm font-medium text-black">{item.title}</p>
                {item.join_count > 0 && (
                  <p className="text-xs text-(--gold) mt-0.5">
                    {item.joiners.map((j) => `+1 ${j.full_name}`).join(", ")}
                  </p>
                )}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
