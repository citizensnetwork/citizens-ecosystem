"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Event, Place } from "@/types/db";
import dynamic from "next/dynamic";

const EventMap = dynamic(() => import("@/components/map/EventMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black" />,
});

type Props = {
  events: Event[];
  places: Place[];
};

/** Rotating taglines for the "Connecting …" scroller.
 *  Word "Connecting" stays fixed; the phrase on its right cycles every 2s.
 *  The first entry ("THE KINGDOM") is the anchor line — it renders in gold
 *  uppercase matching the static "Connecting" label so the full line reads
 *  as the brand promise on cold start. All other entries read as
 *  sentence-case completions of "Connecting ___".
 */
const CONNECTING_PHRASES = [
  { text: "THE KINGDOM", anchor: true },
  { text: "Leaders to Purpose", anchor: false },
  { text: "Families to Fun", anchor: false },
  { text: "Entrepreneurs to Networks", anchor: false },
  { text: "Lonely to Community", anchor: false },
  { text: "Fire to Forests", anchor: false },
  { text: "Spenders to Believers", anchor: false },
  { text: "Students to Miagi's", anchor: false },
  { text: "Energy to the Streets!", anchor: false },
  { text: "Seekers to Christ", anchor: false },
] as const;

/**
 * Kingdom subtitle shown beneath the Connect CTA.
 * Middle dots already separate the three phrases, so per design feedback we
 * dropped the trailing full stops to declutter the line and let the bullets
 * carry the rhythm.
 */
const KINGDOM_TAGLINE = "By the Kingdom · With the Kingdom · For the Kingdom";

// Citizens platform channels — Connect is live, others are upcoming
const PLATFORM_CHANNELS = [
  {
    id: "connect",
    name: "Connect",
    tagline: "Community map & events",
    active: true,
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="11" r="3" />
        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" />
      </svg>
    ),
  },
  {
    id: "wear",
    name: "Wear",
    tagline: "Faith-inspired fashion",
    active: false,
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z" />
      </svg>
    ),
  },
  {
    id: "central",
    name: "Central",
    tagline: "Kingdom directory",
    active: false,
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "impact",
    name: "Impact",
    tagline: "Community projects",
    active: false,
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
];

export default function LandingPage({ events, places }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false); // overlay removed

  // Auth error (only used by Google OAuth path now)
  const [error, setError] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);

  // Rotating "Connecting …" phrase index
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % CONNECTING_PHRASES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = useCallback(() => {
    if (!user) return;
    router.prefetch("/events");
    setDismissed(true);
    setTimeout(() => router.push("/events"), 300);
  }, [user, router]);

  const handleBrowse = useCallback(() => {
    router.prefetch("/events");
    setDismissed(true);
    setTimeout(() => router.push("/events"), 300);
  }, [router]);

  async function handleGoogleAuth() {
    setError("");
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback?next=${encodeURIComponent("/events")}`;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (err) setError(err.message);
  }

  // Prevent body scroll while overlay is visible
  useEffect(() => {
    if (!dismissed) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [dismissed]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* ── Background map (always visible, blurred behind overlay) ── */}
      <div className={`absolute inset-0${dismissed ? "" : " pointer-events-none"}`}>
        <EventMap
          events={events}
          places={places}
          onSelectPlace={() => {}}
          onQuickAction={() => {}}
          autoLocate
          flyTo={null}
          flyToZoom={undefined}
        />
      </div>

      {/* ── Frosted glass overlay ── */}
      <div
        ref={overlayRef}
        className={`absolute inset-0 z-50 flex flex-col items-center justify-between transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          dismissed ? "-translate-y-full" : "translate-y-0"
        }`}
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(12px) saturate(1.1)",
          WebkitBackdropFilter: "blur(12px) saturate(1.1)",
        }}
      >
        {/* ── Top section: scripture excerpt, title, scrolling tagline ──
         *  Spacing widened (mb-3 → mb-5 on the verse, mt-2 → mt-3 on the
         *  scripture ref, mt-5 → mt-7 on the rotating tagline) to give the
         *  hero more breathing room and stop it reading as a tightly stacked
         *  paragraph. */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 sm:px-8">
          {/* Italicised verse excerpt (styled like the "Citizens platform" label: tiny uppercase gold) */}
          <p
            className="mb-5 max-w-md text-center text-[10px] font-semibold italic tracking-[0.14em] sm:text-[11px]"
            style={{ color: "#000" }}
          >
            &ldquo;<sup className="mr-0.5 text-[8px] font-bold not-italic" style={{ color: "var(--gold)" }}>19</sup>
            Now, therefore, you are no longer strangers and foreigners, but fellow —&rdquo;
          </p>

          {/* Citizens title (unchanged) */}
          <h1
            className="text-center text-5xl font-semibold uppercase tracking-widest sm:text-6xl"
            style={{ color: "var(--gold)" }}
          >
            Citizens
          </h1>

          {/* Scripture reference (kept where the logo sits) */}
          <p className="mt-3 text-[10px] font-semibold tracking-wider" style={{ color: "var(--gold)" }}>
            Eph. 2:19-22
          </p>

          {/* Rotating "Connecting …" tagline — the fixed left-hand label uses
           *  the same Montserrat semibold / tight-tracking treatment as the
           *  "Citizens Connect" title in the burger-menu bar, so cold-boot
           *  visitors see a consistent brand voice across surfaces. The
           *  first rotating entry ("THE KINGDOM") is rendered as a gold
           *  uppercase anchor to reinforce the brand promise; subsequent
           *  entries read as sentence-case completions. */}
          <div
            className="mt-7 flex w-full max-w-md items-center justify-center gap-2 text-sm font-semibold tracking-tight sm:text-base"
            aria-live="polite"
          >
            <span style={{ color: "#000" }}>Connecting</span>
            <span
              key={phraseIdx}
              className={
                CONNECTING_PHRASES[phraseIdx].anchor
                  ? "cc-phrase-rotate inline-block text-left font-semibold uppercase tracking-tight"
                  : "cc-phrase-rotate inline-block text-left font-semibold tracking-tight"
              }
              style={{ color: "var(--gold)" }}
            >
              {CONNECTING_PHRASES[phraseIdx].text}
            </span>
          </div>
        </div>

        {/* ── Middle section: auth forms ── */}
        <div className="w-full max-w-sm px-6 pb-2">
          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-red-200/50 bg-red-50/40 px-3 py-2 text-center text-xs text-red-700 backdrop-blur"
            >
              {error}
            </div>
          )}

          {!authChecked ? (
            <div className="flex justify-center py-8">
              <div className="skeleton h-10 w-40 rounded-xl" />
            </div>
          ) : user ? (
            /* Logged in — Connect button with Kingdom tagline */
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleConnect}
                className="gold-glow w-full rounded-2xl border-2 border-(--gold) bg-white px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-(--gold) transition-all hover:bg-(--gold) hover:text-black active:scale-95"
              >
                Connect
              </button>
              <p
                className="text-center text-[11px] font-medium tracking-[0.25em]"
                style={{ color: "#4a2f1a" }}
              >
                {KINGDOM_TAGLINE}
              </p>
            </div>
          ) : (
            /* Not logged in \u2014 single Google CTA above a gray "Browse as Guest"
             *  button that promotes itself to gold "Connect" after sign-in.
             *  Manual email auth was retired to keep the first-run surface
             *  clean and skip the email-confirmation friction. */
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleAuth}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/20 bg-white/75 px-4 py-2.5 text-sm font-semibold text-black backdrop-blur transition hover:bg-white active:scale-[0.97]"
                aria-label="Continue with Google"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              {/* "Connect" in its dormant state: gray, labelled "Browse as Guest",\n               *  still clickable so curious visitors can explore the map without\n               *  signing in. Once the user signs in this button lights up gold\n               *  and switches to "Connect" (see the user-branch above). */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleBrowse}
                  aria-describedby="connect-hint"
                  className="w-full rounded-2xl border-2 border-black/15 bg-white/40 px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-black/45 backdrop-blur transition hover:border-black/25 hover:bg-white/60 hover:text-black/65 active:scale-[0.97]"
                >
                  Browse as Guest
                </button>
                <p
                  id="connect-hint"
                  className="text-center text-[11px] font-medium tracking-[0.25em]"
                  style={{ color: "#4a2f1a" }}
                >
                  {KINGDOM_TAGLINE}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* \u2500\u2500 Bottom: platform channels \u2500\u2500
         *  The "Citizens Platform" caption that used to sit above this grid
         *  was removed per design feedback \u2014 it doubled the labelling already
         *  carried by the channel buttons themselves and made the bottom of
         *  the panel feel cramped. The grid now breathes inside its own
         *  region with a generous top pad. */}
        <div className="w-full px-4 pb-6 pt-4">
          {/* Platform channels row */}
          <div className="mb-1">
            <div className="grid grid-cols-4 gap-2">
              {PLATFORM_CHANNELS.map((ch) =>
                ch.active ? (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={handleBrowse}
                    className="flex flex-col items-center gap-1 rounded-xl border border-(--gold)/60 bg-(--gold)/15 px-1 py-2.5 text-center backdrop-blur transition hover:bg-(--gold)/25 active:scale-[0.96]"
                    aria-label={`Open Citizens ${ch.name}`}
                  >
                    <span className="text-(--gold)">{ch.icon}</span>
                    <span className="text-[11px] font-semibold text-(--gold)">{ch.name}</span>
                    <span className="text-[9px] leading-tight text-black/50">{ch.tagline}</span>
                  </button>
                ) : (
                  <div
                    key={ch.id}
                    className="flex flex-col items-center gap-1 rounded-xl border border-black/10 bg-white/30 px-1 py-2.5 text-center"
                    aria-label={`Citizens ${ch.name} \u2014 coming soon`}
                  >
                    <span className="text-black/30">{ch.icon}</span>
                    <span className="text-[11px] font-medium text-black/40">{ch.name}</span>
                    <span className="text-[9px] leading-tight text-black/25">Soon</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

