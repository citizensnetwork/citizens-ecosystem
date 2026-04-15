"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Identity = {
  id: string;
  provider: string;
  identity_data?: Record<string, unknown>;
  created_at: string;
};

export default function LinkedAccounts() {
  const supabaseRef = useRef(createClient());
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = supabaseRef.current;
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.identities) {
        setIdentities(user.identities as unknown as Identity[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const hasGoogle = identities.some((i) => i.provider === "google");
  const hasEmail = identities.some((i) => i.provider === "email");

  async function handleLinkGoogle() {
    setLinkingGoogle(true);
    setError("");
    const supabase = supabaseRef.current;

    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
      },
    });

    if (linkError) {
      setError(linkError.message);
      setLinkingGoogle(false);
    }
    // Browser redirects to Google OAuth on success
  }

  if (loading) {
    return <div className="skeleton h-12 rounded-xl" />;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-black">Linked Accounts</h3>
      <p className="text-xs text-black/50">
        Sign in with any linked account. Accounts with the same email are automatically linked.
      </p>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {/* Email provider */}
        {hasEmail && (
          <div className="flex items-center gap-3 rounded-xl border border-black/8 bg-white px-4 py-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black/60">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black">Email &amp; Password</p>
              <p className="text-xs text-black/40 truncate">
                {(identities.find((i) => i.provider === "email")?.identity_data?.email as string) ?? ""}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Linked
            </span>
          </div>
        )}

        {/* Google provider */}
        {hasGoogle ? (
          <div className="flex items-center gap-3 rounded-xl border border-black/8 bg-white px-4 py-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black">Google</p>
              <p className="text-xs text-black/40 truncate">
                {(identities.find((i) => i.provider === "google")?.identity_data?.email as string) ?? "Connected"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Linked
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLinkGoogle}
            disabled={linkingGoogle}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-black/15 bg-white px-4 py-3 text-left transition hover:border-black/30 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black">
                {linkingGoogle ? "Redirecting…" : "Link Google Account"}
              </p>
              <p className="text-xs text-black/50">
                Sign in faster with your Google account
              </p>
            </div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-black/30">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
