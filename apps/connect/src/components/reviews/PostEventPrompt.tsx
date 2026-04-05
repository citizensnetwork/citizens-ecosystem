"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PromptEvent = {
  id: string;
  title: string;
  date: string;
};

export default function PostEventPrompt() {
  const supabase = createClient();
  const [event, setEvent] = useState<PromptEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const eventLabel = useMemo(() => {
    if (!event) return "";
    return `${event.title} (${new Date(event.date).toLocaleDateString()})`;
  }, [event]);

  useEffect(() => {
    let active = true;

    async function findPromptEvent() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (active) setLoading(false);
        return;
      }

      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("event_id")
        .eq("user_id", user.id);

      const eventIds = (rsvps ?? []).map((row) => row.event_id);
      if (eventIds.length === 0) {
        if (active) setLoading(false);
        return;
      }

      const { data: events } = await supabase
        .from("events")
        .select("id,title,date")
        .in("id", eventIds)
        .lt("date", new Date().toISOString())
        .order("date", { ascending: false })
        .limit(6);

      if (!events || events.length === 0) {
        if (active) setLoading(false);
        return;
      }

      const { data: reviews } = await supabase
        .from("reviews")
        .select("event_id")
        .eq("user_id", user.id)
        .in(
          "event_id",
          events.map((e) => e.id)
        );

      const reviewedIds = new Set((reviews ?? []).map((review) => review.event_id));
      const pending = events.find((candidate) => !reviewedIds.has(candidate.id));

      if (active) {
        setEvent(pending ?? null);
        setLoading(false);
      }
    }

    findPromptEvent();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function submitRating(rating: number) {
    if (!event) return;
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("reviews").upsert(
      {
        event_id: event.id,
        place_id: null,
        user_id: user.id,
        rating,
        body: "",
        still_exists: true,
      },
      { onConflict: "event_id,user_id" }
    );

    setSubmitting(false);

    if (!error) {
      setDone(true);
      setEvent(null);
    }
  }

  if (loading || done || !event) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--gold)]/35 bg-[var(--gold-soft)] px-4 py-3">
      <p className="text-sm font-semibold text-black">How was {eventLabel}?</p>
      <p className="text-xs text-black/70">Rate your attendance so others can trust what is active and worth joining.</p>

      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={submitting}
            onClick={() => submitRating(value)}
            className="text-xl text-[var(--gold)] transition hover:brightness-90 disabled:opacity-50"
            aria-label={`Rate ${value} stars`}
          >
            ★
          </button>
        ))}
      </div>

      <Link
        href={`/events/${event.id}`}
        className="mt-2 inline-block text-xs font-semibold text-black/70 underline"
      >
        Add a full review
      </Link>
    </div>
  );
}
