"use client";

/**
 * MyEventsTabs — tabbed shell for /events/manage exposing two lenses
 * on the viewer's events:
 *   1. "Created" — events the user organised (analytics + editing).
 *   2. "Joined"  — events the user RSVPed to (attending + considering).
 *
 * Tabs are client-side to keep navigation instant; each lens lazy-
 * mounts its own data fetch. Active tab is reflected in the hash
 * (`#created` / `#joined`) so deep-links share cleanly.
 *
 * Keyboard support follows the WAI-ARIA Authoring Practices tab
 * pattern: roving `tabIndex`, `ArrowLeft` / `ArrowRight` / `Home`
 * / `End` move between tabs and activate them on focus.
 */

import { useEffect, useRef, useState } from "react";
import ManageEventsView from "@/components/events/ManageEventsView";
import JoinedEventsView from "@/components/events/JoinedEventsView";

type Tab = "created" | "joined";
const TABS: { id: Tab; label: string }[] = [
  { id: "created", label: "Created" },
  { id: "joined", label: "Joined" },
];

function readHashTab(): Tab {
  if (typeof window === "undefined") return "created";
  const h = window.location.hash.replace("#", "");
  return h === "joined" ? "joined" : "created";
}

export default function MyEventsTabs() {
  // Initialise lazily so deep-links to `#joined` paint the correct
  // tab on first render (avoids a hydration flicker).
  const [tab, setTab] = useState<Tab>(() => readHashTab());
  const buttonRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // Keep state in sync with external hash changes (e.g. back/forward).
  useEffect(() => {
    const onHash = () => setTab(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const select = (next: Tab, { focus = false }: { focus?: boolean } = {}) => {
    setTab(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
    }
    if (focus) {
      // Defer to after React commits so the ref exists.
      requestAnimationFrame(() => {
        buttonRefs.current[next]?.focus();
      });
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    let nextIdx: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        nextIdx = (idx + 1) % TABS.length;
        break;
      case "ArrowLeft":
        nextIdx = (idx - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        nextIdx = 0;
        break;
      case "End":
        nextIdx = TABS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(TABS[nextIdx].id, { focus: true });
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="My events"
        className="mb-5 inline-flex rounded-xl border border-black/10 bg-white p-1 text-xs font-semibold"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                buttonRefs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              id={`tab-${t.id}`}
              tabIndex={active ? 0 : -1}
              onKeyDown={handleKey}
              onClick={() => select(t.id)}
              className={`rounded-lg px-4 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold) ${
                active
                  ? "bg-black text-white"
                  : "text-black/60 hover:text-black"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-created`}
        aria-labelledby={`tab-created`}
        hidden={tab !== "created"}
      >
        {tab === "created" && <ManageEventsView isVendor />}
      </div>
      <div
        role="tabpanel"
        id={`panel-joined`}
        aria-labelledby={`tab-joined`}
        hidden={tab !== "joined"}
      >
        {tab === "joined" && <JoinedEventsView />}
      </div>
    </div>
  );
}
