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

type AuthView = "idle" | "login" | "signup";

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

  // Auth form state
  const [authView, setAuthView] = useState<AuthView>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Swipe state
  const swipeStartY = useRef(0);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    // User state updates via onAuthStateChange
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || undefined },
      },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    setSuccess("Check your email to confirm your account.");
  }

  async function handleGoogleAuth() {
    setError("");
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback?next=${encodeURIComponent("/events")}`;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (err) setError(err.message);
  }

  // Swipe up to browse without login
  function handleTouchStart(e: React.TouchEvent) {
    swipeStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const delta = swipeStartY.current - e.changedTouches[0].clientY;
    if (delta > 80) {
      handleBrowse();
    }
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`absolute inset-0 z-50 flex flex-col items-center justify-between transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          dismissed ? "-translate-y-full" : "translate-y-0"
        }`}
        style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(10px) saturate(1.2)",
          WebkitBackdropFilter: "blur(10px) saturate(1.2)",
        }}
      >
        {/* ── Top section: logo & crown ── */}
        <div className="flex flex-1 flex-col items-center justify-center px-8">
          <h1
            className="text-center text-5xl font-semibold uppercase tracking-widest sm:text-6xl"
            style={{ color: "var(--gold)" }}
          >
            Citizens
          </h1>
          <p
            className="mt-2 text-xs font-semibold uppercase tracking-widest text-white/70"
            style={{ WebkitTextStroke: "0.5px rgba(0,0,0,0.5)" }}
          >
            CONNECTING THE KINGDOM
          </p>
          <p className="mt-1.5 text-[10px] font-medium tracking-wider" style={{ color: "var(--gold)" }}>
            Eph. 2:19-22
          </p>
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
          {/* Success message */}
          {success && (
            <div
              role="status"
              className="mb-3 rounded-xl border border-green-200/50 bg-green-50/40 px-3 py-2 text-center text-xs text-green-700 backdrop-blur"
            >
              {success}
            </div>
          )}

          {!authChecked ? (
            <div className="flex justify-center py-8">
              <div className="skeleton h-10 w-40 rounded-xl" />
            </div>
          ) : user ? (
            /* Logged in — show Connect button */
            <button
              type="button"
              onClick={handleConnect}
              className="gold-glow w-full rounded-2xl border-2 border-(--gold) bg-white px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-(--gold) transition-all hover:bg-(--gold) hover:text-black active:scale-95"
            >
              Connect
            </button>
          ) : (
            /* Not logged in — show auth options */
            <div className="space-y-4">
              {authView === "idle" && (
                <>
                  {/* Continue with Google */}
                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/20 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white backdrop-blur transition hover:bg-white/30 active:scale-[0.97]"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
                    </svg>
                    Continue with Google
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/25" />
                    <span className="text-xs font-medium text-white/60">or</span>
                    <div className="h-px flex-1 bg-white/25" />
                  </div>

                  {/* Email login / signup toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setAuthView("login"); setError(""); setSuccess(""); }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/20 px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-white backdrop-blur transition hover:bg-white/30 active:scale-[0.97]"
                    >
                      Log in
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAuthView("signup"); setError(""); setSuccess(""); }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-xs font-medium uppercase tracking-widest text-white/80 backdrop-blur transition hover:bg-white/20 active:scale-[0.97]"
                    >
                      Sign up
                    </button>
                  </div>

                  {/* Disabled Connect button with explanation */}
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled
                      aria-describedby="connect-hint"
                      className="w-full rounded-2xl border-2 border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-white/30 backdrop-blur cursor-not-allowed"
                    >
                      Connect
                    </button>
                    <p id="connect-hint" className="text-center text-[11px] text-white/40">
                      Log in or sign up to connect
                    </p>
                  </div>

                  {/* Browse as guest */}
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="mx-auto block text-xs font-medium text-white/50 underline underline-offset-2 transition hover:text-white/80"
                  >
                    Browse as guest →
                  </button>
                </>
              )}

              {authView === "login" && (
                <form onSubmit={handleEmailLogin} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => { setAuthView("idle"); setError(""); setSuccess(""); }}
                    className="mb-1 text-xs font-medium text-white/60 transition hover:text-white"
                  >
                    ← Back
                  </button>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    aria-label="Email address"
                    required
                    className="w-full rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none backdrop-blur transition focus:border-white/50 focus:bg-white/20"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none backdrop-blur transition focus:border-white/50 focus:bg-white/20"
                  />
                  <a
                    href="/login/forgot-password"
                    className="block text-right text-[11px] font-medium text-white/50 transition hover:text-white/80"
                  >
                    Forgot password?
                  </a>
                  <button
                    type="submit"
                    disabled={loading}
                    className="gold-glow w-full rounded-2xl border-2 border-(--gold) bg-white px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-(--gold) transition-all hover:bg-(--gold) hover:text-black active:scale-95 disabled:opacity-50"
                  >
                    {loading ? "Logging in..." : "Connect"}
                  </button>
                </form>
              )}

              {authView === "signup" && (
                <form onSubmit={handleEmailSignup} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => { setAuthView("idle"); setError(""); setSuccess(""); }}
                    className="mb-1 text-xs font-medium text-white/60 transition hover:text-white"
                  >
                    ← Back
                  </button>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                    aria-label="Full name"
                    className="w-full rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none backdrop-blur transition focus:border-white/50 focus:bg-white/20"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    aria-label="Email address"
                    required
                    className="w-full rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none backdrop-blur transition focus:border-white/50 focus:bg-white/20"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    aria-label="Password"
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none backdrop-blur transition focus:border-white/50 focus:bg-white/20"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl border-2 border-white/30 bg-white/20 px-6 py-3 text-base font-bold text-white backdrop-blur transition-all hover:bg-white/30 active:scale-95 disabled:opacity-50"
                  >
                    {loading ? "Creating account..." : "Create Account"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom: platform channels + browse hint ── */}
        <div className="w-full px-4 pb-6 pt-1">
          {/* Platform channels row */}
          <div className="mb-3">
            <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Citizens Platform
            </p>
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
                    <span className="text-[9px] leading-tight text-white/50">{ch.tagline}</span>
                  </button>
                ) : (
                  <div
                    key={ch.id}
                    className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1 py-2.5 text-center"
                    aria-label={`Citizens ${ch.name} — coming soon`}
                  >
                    <span className="text-white/30">{ch.icon}</span>
                    <span className="text-[11px] font-medium text-white/40">{ch.name}</span>
                    <span className="text-[9px] leading-tight text-white/25">Soon</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Swipe / browse hint */}
          <div className="flex flex-col items-center gap-1.5 pt-1">
            {!user && (
              <p
                className="text-[11px] font-medium tracking-wide text-white/40"
                style={{ WebkitTextStroke: "0.3px rgba(0,0,0,0.3)" }}
              >
                swipe up or tap to browse
              </p>
            )}
            <button
              type="button"
              onClick={handleBrowse}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white/40 transition hover:border-white/60 hover:text-white active:scale-90"
              aria-label="Browse without logging in"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
