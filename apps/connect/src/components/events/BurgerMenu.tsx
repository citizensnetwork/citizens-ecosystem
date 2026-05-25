"use client";

import { forwardRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Event, EventCategory, PlaceCategory, FavouriteOrg, FriendAttending, FriendConsidering, Profile, TrendingEvent } from "@/types/db";
import { EVENT_CATEGORIES, CATEGORY_HEX, PLACE_CATEGORIES, PLACE_CATEGORY_HEX, PLACE_CATEGORY_DESCRIPTIONS } from "@/lib/categories";
import { isAdmin, isContributor, isCitizen, isApprovedContributor, isPendingContributor, isRejectedContributor } from "@/lib/profiles/capabilities";
import { getIconSvg } from "@/lib/categoryIcons";
import AccordionSection from "@/components/ui/AccordionSection";
import SuggestionButton from "@/components/ui/SuggestionButton";
import type { User } from "@supabase/supabase-js";

type BurgerTab = "events" | "places";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  displayName: string;
  activeCategories: Set<EventCategory>;
  onToggleCategory: (cat: EventCategory) => void;
  onClearCategories: () => void;
  activePlaceCategories: Set<PlaceCategory>;
  onTogglePlaceCategory: (cat: PlaceCategory) => void;
  onClearPlaceCategories: () => void;
  /** Weekend-only derived filter (S3) — AND-combines with active categories. */
  weekendOnly: boolean;
  onToggleWeekend: () => void;
  trending: TrendingEvent[];
  favouriteOrgs: FavouriteOrg[];
  /** Kept for backward-compat; the Friends-attending list is now surfaced
   *  via notifications instead of a dedicated accordion. */
  friends?: FriendAttending[];
  /** FEAT-04: events friends are currently considering (groupings). */
  friendConsiderings?: FriendConsidering[];
  /** FEAT-04: events the current user is considering. */
  userConsidering?: Event[];
  /** FEAT-04: `${eventId}|${toUserId}` set of convinces already sent. */
  outgoingConvinceKeys?: Set<string>;
  /** FEAT-04: re-fetch after a successful convince / consider toggle. */
  onAfterAction?: () => void;
  menuProfile: Profile | null;
  menuLoading: boolean;
  onSelectEvent: (event: Event) => void;
  filteredCount: number;
  filteredPlacesCount: number;
  onLogout: () => void;
  considerVersion?: number;
  /** Controlled tab value ("events" | "places"). When omitted, BurgerMenu
   *  manages its own tab state. When provided, the parent owns the tab so it
   *  can, for example, drive a places-only map mode. */
  activeTab?: BurgerTab;
  /** Fires whenever the user flips the Event / Place tab toggle. */
  onTabChange?: (tab: BurgerTab) => void;
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
    activePlaceCategories,
    onTogglePlaceCategory,
    onClearPlaceCategories,
    weekendOnly,
    onToggleWeekend,
    favouriteOrgs,
    friendConsiderings,
    userConsidering,
    outgoingConvinceKeys,
    onAfterAction,
    menuProfile,
    menuLoading,
    onSelectEvent,
    filteredCount,
    filteredPlacesCount,
    onLogout,
    activeTab: controlledTab,
    onTabChange,
  },
  ref
) {
  const [uncontrolledTab, setUncontrolledTab] = useState<BurgerTab>("events");
  const activeTab = controlledTab ?? uncontrolledTab;
  const setActiveTab = (tab: BurgerTab) => {
    if (controlledTab === undefined) setUncontrolledTab(tab);
    onTabChange?.(tab);
  };

  function selectAndClose(event: Event) {
    onSelectEvent(event);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="absolute inset-0 z-1500 bg-black/25"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        ref={ref}
        role="dialog"
        aria-label="Menu"
        className={`absolute left-0 top-0 z-1501 flex h-full w-[84vw] max-w-xs flex-col bg-white/60 shadow-2xl backdrop-blur-md transition-transform duration-300 sm:w-80 ${
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

        {/* ── Event / Place tab toggle ── */}
        <div className="flex items-center justify-center gap-3 px-4 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("events")}
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
              activeTab === "events"
                ? "border-(--gold) bg-(--gold)/15 text-black"
                : "border-black/15 bg-white/50 text-black/40 hover:border-black/30 hover:text-black/60"
            }`}
            aria-label="Filter events"
            title="Events"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("places")}
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
              activeTab === "places"
                ? "border-(--gold) bg-(--gold)/15 text-black"
                : "border-black/15 bg-white/50 text-black/40 hover:border-black/30 hover:text-black/60"
            }`}
            aria-label="Filter places"
            title="Places"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {/* Categories section — different per tab */}
          {activeTab === "events" ? (
          <>
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
              {/* Weekend-only derived filter (S3) */}
              <button
                type="button"
                role="switch"
                aria-checked={weekendOnly}
                onClick={onToggleWeekend}
                className={`mt-2 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  weekendOnly
                    ? "border-[#D4AF37]/55 bg-[#D4AF37]/10 font-medium text-black"
                    : "border-transparent text-black/70 hover:bg-black/[.04]"
                }`}
              >
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-all"
                  style={weekendOnly
                    ? { borderColor: "#D4AF37", backgroundColor: "rgba(212,175,55,0.30)" }
                    : { borderColor: "rgba(0,0,0,0.18)", backgroundColor: "transparent" }
                  }
                >
                  {weekendOnly && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#8B7500" strokeWidth="3" strokeLinecap="round" className="h-2.5 w-2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 items-center justify-center text-[#8B7500]"
                  dangerouslySetInnerHTML={{ __html: getIconSvg("weekend-tag") }}
                />
                Weekend only
              </button>
            </AccordionSection>
          </>
          ) : (
            <AccordionSection
              title="Categories"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>}
              defaultOpen
              badge={activePlaceCategories.size > 0 ? activePlaceCategories.size : undefined}
              headerAction={activePlaceCategories.size > 0 ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClearPlaceCategories(); }}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium text-black/45 transition hover:bg-black/5 hover:text-black/70"
                >
                  Clear
                </button>
              ) : undefined}
            >
              <div className="space-y-0.5">
                {PLACE_CATEGORIES.map((c) => {
                  const active = activePlaceCategories.has(c.value);
                  const catColor = PLACE_CATEGORY_HEX[c.value];
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => onTogglePlaceCategory(c.value)}
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
                      <div className="min-w-0 flex-1">
                        <span className="block">{c.label}</span>
                        <span className="block truncate text-[10px] text-black/40">{PLACE_CATEGORY_DESCRIPTIONS[c.value]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </AccordionSection>
          )}

          {/* Shared sections: Favourites + Considerations — always visible in both tabs */}

          {/* Favourites */}
          <AccordionSection
            title="Favourites"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
            badge={favouriteOrgs.length || undefined}
          >
            {!user ? (
              <p className="px-3 py-2 text-xs text-black/40">
                <Link href="/login" onClick={onClose} className="text-(--gold) hover:underline">
                  Log in
                </Link>{" "}
                to see your favourites
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

          {/* FEAT-04 Considerations — unified My / Friends section */}
          <ConsiderationsSection
            user={user}
            menuLoading={menuLoading}
            userConsidering={userConsidering ?? []}
            friendConsiderings={friendConsiderings ?? []}
            outgoingConvinceKeys={outgoingConvinceKeys ?? new Set<string>()}
            onSelectEvent={selectAndClose}
            onClose={onClose}
            onAfterAction={onAfterAction}
          />

          {/* Quick actions (always visible) */}
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
                  href="/messages"
                  onClick={onClose}
                  className="mt-2 block rounded-xl bg-black/5 px-3 py-2 text-center font-medium text-black hover:bg-black/10 transition"
                >
                  Messages
                </Link>
                {/* Contributor-only shortcuts */}
                {isApprovedContributor(menuProfile) && (
                    <Link
                      href="/places/new"
                      onClick={onClose}
                      className="mt-2 block rounded-xl bg-black/5 px-3 py-2 text-center font-medium text-black hover:bg-black/10 transition"
                    >
                      + Add Place
                    </Link>
                  )}
                {/* Citizens without an application see the apply CTA */}
                {isCitizen(menuProfile) &&
                  (!menuProfile?.contributor_status ||
                    menuProfile?.contributor_status === "not_applied" ||
                    isRejectedContributor(menuProfile)) && (
                    <Link
                      href="/contributor/apply"
                      onClick={onClose}
                      className="mt-2 block rounded-xl border border-(--gold) px-3 py-2 text-center font-semibold text-black hover:bg-(--gold-soft) transition"
                    >
                      ★ Apply to Contribute
                    </Link>
                  )}
                <Link
                  href="/events/new"
                  onClick={() => {
                    // Signal the leadership-interest Easter egg — tapped
                    // Create counts as a contributor-action attempt.  Import
                    // lazily so we never block the menu open animation.
                    void import("@/lib/easterEggs/bus").then(({ publishEasterEggEvent }) => {
                      publishEasterEggEvent({ type: "contributor_action_attempted" });
                    });
                    onClose();
                  }}
                  className="mt-2 block rounded-xl bg-(--gold) px-3 py-2 text-center font-semibold text-black"
                >
                  + Create Event
                </Link>
                {isCitizen(menuProfile) && (
                  <p className="mt-1 px-1 text-center text-[11px] leading-tight text-black/55">
                    Citizens can publish 1 community event / month. Apply to
                    contribute for unlimited publishing.
                  </p>
                )}
              </>
            )}
          </div>
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
              {isApprovedContributor(menuProfile) && (
                  <>
                    {menuProfile?.contributor_slug && (
                      <Link
                        href={`/c/${encodeURIComponent(menuProfile.contributor_slug)}`}
                        onClick={onClose}
                        className="block rounded-xl px-3 py-2 text-sm text-black/70 transition hover:bg-black/5"
                      >
                        View my public page
                      </Link>
                    )}
                    <Link
                      href="/profile/contributor"
                      onClick={onClose}
                      className="block rounded-xl px-3 py-2 text-sm text-black/70 transition hover:bg-black/5"
                    >
                      Edit public profile
                    </Link>
                    <Link
                      href="/profile/contributor/dashboard"
                      onClick={onClose}
                      className="block rounded-xl px-3 py-2 text-sm text-black/70 transition hover:bg-black/5"
                    >
                      My contributions
                    </Link>
                  </>
                )}
              {isContributor(menuProfile) &&
                isPendingContributor(menuProfile) && (
                  <div className="rounded-xl border border-(--gold)/40 bg-(--gold-soft)/40 px-3 py-2 text-xs leading-snug text-black/70">
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--gold)" />
                    Application under review
                    <p className="mt-1 text-black/50">
                      We&apos;ll email you once it&apos;s been looked at.
                    </p>
                  </div>
                )}
              {/* Citizens flip to pending on apply while role stays 'citizen' */}
              {/* until approval — surface the same pill so they get feedback. */}
              {isCitizen(menuProfile) &&
                isPendingContributor(menuProfile) && (
                  <div className="rounded-xl border border-(--gold)/40 bg-(--gold-soft)/40 px-3 py-2 text-xs leading-snug text-black/70">
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--gold)" />
                    Contributor application under review
                    <p className="mt-1 text-black/50">
                      We&apos;ll email you once it&apos;s been looked at.
                    </p>
                  </div>
                )}
              {isContributor(menuProfile) &&
                isRejectedContributor(menuProfile) && (
                  <Link
                    href="/contributor/apply"
                    onClick={onClose}
                    className="block rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 transition hover:bg-red-100"
                  >
                    Application not approved — apply again
                  </Link>
                )}
              {isAdmin(menuProfile) && (
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="block rounded-xl border border-(--gold)/40 bg-(--gold-soft)/40 px-3 py-2 text-sm font-medium text-black transition hover:bg-(--gold-soft)/70"
                >
                  Admin panel →
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
          <div className="mt-4 border-t border-black/8 pt-3 text-center">
            <SuggestionButton variant="inline" />
          </div>
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

function ConsiderationsSection({
  user,
  menuLoading,
  userConsidering,
  friendConsiderings,
  outgoingConvinceKeys,
  onSelectEvent,
  onClose,
  onAfterAction,
}: {
  user: User | null;
  menuLoading: boolean;
  userConsidering: Event[];
  friendConsiderings: FriendConsidering[];
  outgoingConvinceKeys: Set<string>;
  onSelectEvent: (e: Event) => void;
  onClose: () => void;
  onAfterAction?: () => void;
}) {
  const [tab, setTab] = useState<"mine" | "friends">("mine");
  const totalBadge =
    (userConsidering?.length ?? 0) + (friendConsiderings?.length ?? 0);
  const friendsBadge = friendConsiderings?.length ?? 0;

  return (
    <AccordionSection
      title="Considerations"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-(--gold)">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      }
      badge={totalBadge || undefined}
    >
      {!user ? (
        <p className="px-3 py-2 text-xs text-black/40">
          <Link href="/login" onClick={onClose} className="text-(--gold) hover:underline">
            Log in
          </Link>{" "}
          to see events you and your friends are considering
        </p>
      ) : (
        <>
          {/* Segmented My / Friends toggle */}
          <div className="mx-1 mb-2 flex rounded-lg bg-black/5 p-0.5">
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                tab === "mine"
                  ? "bg-white text-black shadow-sm"
                  : "text-black/55 hover:text-black/80"
              }`}
            >
              My ({userConsidering.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("friends")}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                tab === "friends"
                  ? "bg-white text-black shadow-sm"
                  : "text-black/55 hover:text-black/80"
              }`}
            >
              Friends ({friendsBadge})
            </button>
          </div>

          {menuLoading ? (
            <p className="px-3 py-2 text-xs text-black/40">Loading…</p>
          ) : tab === "mine" ? (
            userConsidering.length === 0 ? (
              <p className="px-3 py-2 text-xs text-black/40">
                Use the &quot;Consider&quot; action on events to track them here
              </p>
            ) : (
              <div className="space-y-0.5">
                {userConsidering.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onSelectEvent(ev)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-black/80 transition hover:bg-black/5"
                  >
                    <span className="flex-1 truncate">{ev.title}</span>
                    <span className="text-xs text-black/40">
                      {ev.date
                        ? new Date(ev.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : friendConsiderings.length === 0 ? (
            <p className="px-3 py-2 text-xs text-black/40">
              When friends mark events as &quot;considering&quot; they&apos;ll show up here so you can convince them.
            </p>
          ) : (
            <div className="space-y-1.5">
              {friendConsiderings.map((fc) => (
                <FriendConsideringCard
                  key={fc.event.id}
                  fc={fc}
                  outgoingConvinceKeys={outgoingConvinceKeys}
                  onSelectEvent={onSelectEvent}
                  onAfterAction={onAfterAction}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AccordionSection>
  );
}

function FriendConsideringCard({
  fc,
  outgoingConvinceKeys,
  onSelectEvent,
  onAfterAction,
}: {
  fc: FriendConsidering;
  outgoingConvinceKeys: Set<string>;
  onSelectEvent: (e: Event) => void;
  onAfterAction?: () => void;
}) {
  const [sending, setSending] = useState<string | null>(null);
  // Per-friend sent state lets each row flip to "Convinced ✓" without
  // waiting for the next refetch.
  const [localSent, setLocalSent] = useState<Set<string>>(new Set());

  async function sendConvince(toUserId: string) {
    if (sending) return;
    setSending(toUserId);
    try {
      const res = await fetch("/api/convince", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: fc.event.id, to_user_id: toUserId }),
      });
      if (res.ok || res.status === 409) {
        setLocalSent((s) => new Set([...s, toUserId]));
        onAfterAction?.();
      }
    } catch {
      // Silently fail — user can retry; the optimistic state isn't set.
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="rounded-xl border border-black/6 bg-white/55 p-2.5">
      <button
        type="button"
        onClick={() => onSelectEvent(fc.event)}
        className="block w-full text-left"
      >
        <p className="truncate text-sm font-medium text-black">{fc.event.title}</p>
        <p className="mt-0.5 text-[11px] text-black/45">
          {fc.event.date
            ? new Date(fc.event.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : ""}
          {" · "}
          {fc.friends.length} friend{fc.friends.length !== 1 ? "s" : ""}
        </p>
      </button>
      <ul className="mt-2 space-y-1">
        {fc.friends.map((fr) => {
          const key = `${fc.event.id}|${fr.id}`;
          const isSent =
            localSent.has(fr.id) || outgoingConvinceKeys.has(key);
          return (
            <li
              key={fr.id}
              className="flex items-center gap-2 rounded-lg px-1 py-1"
            >
              {fr.avatar_url ? (
                <Image
                  src={fr.avatar_url}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-(--gold-soft) text-[9px] font-bold uppercase">
                  {fr.full_name?.[0] ?? "?"}
                </span>
              )}
              <span className="flex-1 truncate text-xs text-black/75">
                {fr.full_name}
              </span>
              {isSent ? (
                <span
                  className="flex items-center gap-1 rounded-full bg-(--gold-soft) px-2 py-0.5 text-[10px] font-medium text-black/80"
                  aria-label={`Already convinced ${fr.full_name}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="h-2.5 w-2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Convinced
                </span>
              ) : (
                <button
                  type="button"
                  disabled={sending === fr.id}
                  onClick={() => sendConvince(fr.id)}
                  className="rounded-full bg-(--gold) px-2.5 py-0.5 text-[10px] font-semibold text-black transition hover:brightness-105 disabled:opacity-50"
                >
                  {sending === fr.id ? "…" : "Convince"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
