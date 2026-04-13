"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { share } from "@/lib/capacitor/share";
import type { Event } from "@/types/db";

type Props = {
  event: Event;
  onClose: () => void;
  position: { x: number; y: number };
};

/**
 * 5-button quick-action popup on map marker click:
 * 1. View — open event detail
 * 2. Join — RSVP to event
 * 3. Share — native share / clipboard copy
 * 4. Consider — add to consider list
 * 5. Visit — open website
 */
export default function QuickActionPopup({ event, onClose, position }: Props) {
  const router = useRouter();
  const [joinStatus, setJoinStatus] = useState<"idle" | "loading" | "done">("idle");
  const [considerStatus, setConsiderStatus] = useState<"idle" | "loading" | "done">("idle");
  const [shareStatus, setShareStatus] = useState<"idle" | "done">("idle");

  const eventUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${event.id}`;

  // Check if event has already started
  const now = new Date();
  const eventStart = new Date(event.date);
  const hasStarted = eventStart <= now;

  async function handleJoin() {
    if (hasStarted) return;
    setJoinStatus("loading");
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setJoinStatus("done");
    } catch {
      setJoinStatus("idle");
    }
  }

  async function handleConsider() {
    setConsiderStatus("loading");
    try {
      const res = await fetch("/api/consider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setConsiderStatus("done");
    } catch {
      setConsiderStatus("idle");
    }
  }

  async function handleShare() {
    const opened = await share({ title: event.title, url: eventUrl });
    if (!opened) {
      setShareStatus("done");
      setTimeout(() => setShareStatus("idle"), 1500);
    }
  }

  function handleView() {
    router.push(`/events/${event.id}`);
    onClose();
  }

  function handleVisit() {
    if (event.website_url && /^https?:\/\//i.test(event.website_url)) {
      window.open(event.website_url, "_blank", "noopener,noreferrer");
    }
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      {/* Popup */}
      <div
        className="fixed z-[9999] flex gap-1.5 rounded-2xl border border-black/10 bg-white/97 p-1.5 shadow-2xl backdrop-blur"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: "translate(-50%, -120%)",
        }}
      >
        {/* View */}
        <button
          type="button"
          onClick={handleView}
          className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition hover:bg-black/5"
          title="View event"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="text-[10px] font-medium">View</span>
        </button>

        {/* Join */}
        <button
          type="button"
          onClick={handleJoin}
          disabled={hasStarted || joinStatus !== "idle"}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition ${
            hasStarted
              ? "cursor-not-allowed opacity-40"
              : joinStatus === "done"
                ? "bg-green-50 text-green-700"
                : "hover:bg-black/5"
          }`}
          title={hasStarted ? "Event already started" : "Join event"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          <span className="text-[10px] font-medium">
            {joinStatus === "loading" ? "..." : joinStatus === "done" ? "Joined" : "Join"}
          </span>
        </button>

        {/* Share */}
        <button
          type="button"
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition hover:bg-black/5"
          title="Share event"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span className="text-[10px] font-medium">
            {shareStatus === "done" ? "Copied" : "Share"}
          </span>
        </button>

        {/* Consider */}
        <button
          type="button"
          onClick={handleConsider}
          disabled={considerStatus !== "idle"}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition ${
            considerStatus === "done"
              ? "bg-amber-50 text-amber-700"
              : "hover:bg-black/5"
          }`}
          title="Add to consider list"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          <span className="text-[10px] font-medium">
            {considerStatus === "loading" ? "..." : considerStatus === "done" ? "Added" : "Consider"}
          </span>
        </button>

        {/* Visit */}
        <button
          type="button"
          onClick={handleVisit}
          disabled={!event.website_url}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition ${
            !event.website_url ? "cursor-not-allowed opacity-40" : "hover:bg-black/5"
          }`}
          title={event.website_url ? "Visit website" : "No website"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span className="text-[10px] font-medium">Visit</span>
        </button>
      </div>
    </>
  );
}
