"use client";

import { forwardRef, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { Event, EventCategory, FavouriteOrg, FriendAttending, Profile, TrendingEvent } from "@/types/db";
import { EVENT_CATEGORIES, CATEGORY_HEX } from "@/lib/categories";
import AccordionSection from "@/components/ui/AccordionSection";
import type { User } from "@supabase/supabase-js";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  displayName: string;
  activeCategories: Set<EventCategory>;
  onToggleCategory: (cat: EventCategory) => void;
  onClearCategories: () => void;
  trending: TrendingEvent[];
  favouriteOrgs: FavouriteOrg[];
  friends: FriendAttending[];
  menuProfile: Profile | null;
  menuLoading: boolean;
  onSelectEvent: (event: Event) => void;
  filteredCount: number;
  filteredPlacesCount: number;
  onLogout: () => void;
};

const BurgerMenu = forwardRef<HTMLElement, Props>(function BurgerMenu(
  {
    isOpen,
    onClose,
    user,
    displayName,
    activeCategories,
    onToggleCategory,
    onClearCategories,
    trending,
    favouriteOrgs,
    friends,
    menuProfile,
    menuLoading,
    onSelectEvent,
    filteredCount,
    filteredPlacesCount,
    onLogout,
  },
  ref
) {
  function selectAndClose(event: Event) {
    onSelectEvent(event);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="absolute inset-0 z-1001 bg-black/25"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        ref={ref}
        role="dialog"
        aria-label="Menu"
        className={`absolute left-0 top-0 z-1002 flex h-full w-[84vw] max-w-xs flex-col bg-white/60 shadow-2xl backdrop-blur-md transition-transform duration-300 sm:w-80 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-black/70">
            Menu
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-black/60 hover:bg-black/5"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {/* Categories */}
          <AccordionSection
            title="Categories"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
            defaultOpen
            badge={activeCategories.size > 0 ? activeCategories.size : undefined}
            headerAction={activeCategories.size > 0 ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClearCategories(); }}
                className="rounded-md px-2 py-0.5 text-[10px] font-medium text-black/45 transition hover:bg-black/5 hover:text-black/70"
              >
                Clear
              </button>
            ) : undefined}
          >
            <div className="space-y-0.5">
              {EVENT_CATEGORIES.map((c) => {
                const active = activeCategories.has(c.value);
                const catColor = CATEGORY_HEX[c.value];
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => onToggleCategory(c.value)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                      active
                        ? "font-medium text-black"
                        : "text-black/70 hover:bg-black/[.04]"
                    }`}
                    style={active ? { backgroundColor: `${catColor}15` } : undefined}
                  >
                    <span
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-all"
                      style={active
                        ? { borderColor: catColor, backgroundColor: `${catColor}30` }
                        : { borderColor: "rgba(0,0,0,0.18)", backgroundColor: "transparent" }
                      }
                    >
                      {active && (
                        <svg viewBox="0 0 24 24" fill="none" stroke={catColor} strokeWidth="3" strokeLinecap="round" className="h-2.5 w-2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </AccordionSection>

          {/* Trending */}
          <AccordionSection title="Trending" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} badge={trending.length || undefined}>
            {menuLoading ? (
              <p className="px-3 py-2 text-xs text-black/40">Loading…</p>
            ) : trending.length === 0 ? (
              <p className="px-3 py-2 text-xs text-black/40">No trending events yet</p>
            ) : (
              <div className="space-y-1">
                {trending.map((te) => (
                  <button
                    key={te.id}
                    type="button"
                    onClick={() => selectAndClose(te)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-black/80 transition hover:bg-black/5"
                  >
                    <span className="flex-1 truncate">{te.title}</span>
                    <span className="text-xs text-black/40">{te.rsvp_count} attending</span>
                  </button>
                ))}
              </div>
            )}
          </AccordionSection>

          {/* Favourite Orgs */}
          <AccordionSection
            title="Favourite Orgs"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            badge={favouriteOrgs.length || undefined}
          >
            {!user ? (
              <p className="px-3 py-2 text-xs text-black/40">
                <Link href="/login" onClick={onClose} className="text-(--gold) hover:underline">
                  Log in
                </Link>{" "}
                to see your favourite organisers
              </p>
            ) : menuLoading ? (
              <p className="px-3 py-2 text-xs text-black/40">Loading…</p>
            ) : favouriteOrgs.length === 0 ? (
              <p className="px-3 py-2 text-xs text-black/40">Follow organisers to see them here</p>
            ) : (
              <div className="space-y-1">
                {favouriteOrgs.map((org) => (
                  <OrgAccordion key={org.id} org={org} onSelectEvent={selectAndClose} />
                ))}
              </div>
            )}
          </AccordionSection>

          {/* Friends */}
          <AccordionSection title="Friends" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} badge={friends.length || undefined}>
            {!user ? (
              <p className="px-3 py-2 text-xs text-black/40">
                <Link href="/login" onClick={onClose} className="text-(--gold) hover:underline">
                  Log in
                </Link>{" "}
                to see friends
              </p>
            ) : menuLoading ? (
              <p className="px-3 py-2 text-xs text-black/40">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="px-3 py-2 text-xs text-black/40">Your mutual follows will appear here</p>
            ) : (
              <div className="space-y-1">
                {friends.map((fr) => (
                  <FriendAccordion key={fr.id} friend={fr} onSelectEvent={selectAndClose} />
                ))}
              </div>
            )}
          </AccordionSection>

          {/* Quick actions */}
          <div className="mt-4 border-t border-black/8 pt-4 text-sm text-black/65">
            <p>
              {filteredCount} event{filteredCount !== 1 ? "s" : ""}
              {filteredPlacesCount > 0 &&
                ` · ${filteredPlacesCount} place${filteredPlacesCount !== 1 ? "s" : ""}`}
            </p>
            {user && (
              <>
                <Link
                  href="/events/manage"
                  onClick={onClose}
                  className="mt-3 block rounded-xl bg-black/5 px-3 py-2 text-center font-medium text-black hover:bg-black/10 transition"
                >
                  My Events
                </Link>
                <Link
                  href="/events/new"
                  onClick={onClose}
                  className="mt-2 block rounded-xl bg-(--gold) px-3 py-2 text-center font-semibold text-black"
                >
                  + Create Event
                </Link>
              </>
            )}
          </div>

          {/* Consider section */}
          {user && (
            <BurgerConsiderSection userId={user.id} onClose={onClose} />
          )}
        </div>

        {/* Profile section */}
        <div className="border-t border-black/10 px-4 py-4">
          {user ? (
            <div className="space-y-2">
              <Link
                href="/profile"
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-black/5"
              >
                {menuProfile?.avatar_url ? (
                  <Image
                    src={menuProfile.avatar_url}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--gold-soft) text-sm font-bold uppercase text-black">
                    {displayName[0]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-black">{displayName}</p>
                  <p className="truncate text-xs text-black/50">{user.email}</p>
                </div>
              </Link>
              {menuProfile?.role === "admin" && (
                <Link
                  href="/admin/categories"
                  onClick={onClose}
                  className="block rounded-xl px-3 py-2 text-sm text-black/70 transition hover:bg-black/5"
                >
                  Manage Categories
                </Link>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
              >
                Log Out
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href="/login"
                onClick={onClose}
                className="block rounded-xl bg-black/5 px-3 py-2 text-center text-sm font-medium text-black transition hover:bg-black/10"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                onClick={onClose}
                className="block rounded-xl bg-(--gold) px-3 py-2 text-center text-sm font-semibold text-black transition hover:brightness-105"
              >
                Sign Up — It&apos;s Free
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
});

export default BurgerMenu;

/* ── Sub-components for nested accordion items ─────────── */

function OrgAccordion({
  org,
  onSelectEvent,
}: {
  org: FavouriteOrg;
  onSelectEvent: (e: Event) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-black/80 transition hover:bg-black/5"
      >
        {org.avatar_url ? (
          <Image
            src={org.avatar_url}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--gold-soft) text-[10px] font-bold uppercase">
            {org.full_name?.[0] ?? "?"}
          </span>
        )}
        <span className="flex-1 truncate">{org.full_name}</span>
        <span className="text-xs text-black/40">{org.upcoming_events.length}</span>
        <span
          className={`text-xs text-black/30 transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
      </button>
      {open && (
        <div className="ml-8 space-y-0.5 pb-1">
          {org.upcoming_events.length === 0 ? (
            <p className="px-2 py-1 text-xs text-black/40">No upcoming events</p>
          ) : (
            org.upcoming_events.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelectEvent(e)}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-black/70 transition hover:bg-black/5"
              >
                {e.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FriendAccordion({
  friend,
  onSelectEvent,
}: {
  friend: FriendAttending;
  onSelectEvent: (e: Event) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-black/80 transition hover:bg-black/5"
      >
        {friend.avatar_url ? (
          <Image
            src={friend.avatar_url}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--gold-soft) text-[10px] font-bold uppercase">
            {friend.full_name?.[0] ?? "?"}
          </span>
        )}
        <span className="flex-1 truncate">{friend.full_name}</span>
        <span className="text-xs text-black/40">{friend.attending_events.length}</span>
        <span
          className={`text-xs text-black/30 transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
      </button>
      {open && (
        <div className="ml-8 space-y-0.5 pb-1">
          {friend.attending_events.length === 0 ? (
            <p className="px-2 py-1 text-xs text-black/40">Not attending any upcoming events</p>
          ) : (
            friend.attending_events.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelectEvent(e)}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-black/70 transition hover:bg-black/5"
              >
                {e.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── BurgerConsiderSection: shows "Considering" events in burger menu ── */

type ConsiderItem = {
  event_id: string;
  title: string;
  date: string;
};

function BurgerConsiderSection({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [items, setItems] = useState<ConsiderItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchConsiders = useCallback(async () => {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("event_id, events(title, date)")
      .eq("user_id", userId)
      .eq("status", "considering")
      .gte("events.date", today);

    const validRsvps = (rsvps ?? []).filter(
      (r) => (r as Record<string, unknown>).events != null
    );

    setItems(
      validRsvps.map((r) => {
        const ev = (r as Record<string, unknown>).events as { title: string; date: string } | null;
        return {
          event_id: r.event_id,
          title: ev?.title ?? "Event",
          date: ev?.date ?? "",
        };
      })
    );
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    fetchConsiders();
  }, [fetchConsiders]);

  if (!loaded || items.length === 0) return null;

  return (
    <div className="mt-3 border-t border-black/8 pt-3">
      <div className="flex items-center gap-2 px-1 pb-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider text-black/50">
          Considering ({items.length})
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.event_id}
            href={`/events/${item.event_id}`}
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-black/80 transition hover:bg-black/5"
          >
            <span className="flex-1 truncate">{item.title}</span>
            <span className="text-xs text-black/40">
              {item.date
                ? new Date(item.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
