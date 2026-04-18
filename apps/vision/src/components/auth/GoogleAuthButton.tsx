"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Google OAuth button. Shared between /auth/login and /auth/signup — with
 * OAuth there's no meaningful difference between the two flows (Supabase
 * will create the user on first sign-in and reuse the same user id
 * thereafter).
 *
 * The redirect target must match the Redirect URLs list configured in
 * Supabase Auth → URL Configuration. We always send users through our
 * server-side callback so the session cookie is written by middleware.
 */
export function GoogleAuthButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Request the standard profile + email scopes. Supabase maps
        // these onto user.user_metadata.full_name / .avatar_url / .email
        // so they appear in auth.users without any extra work on our end.
        scopes: "openid email profile",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser is redirected away — no further UI needed.
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-50"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="#EA4335"
            d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
          />
        </svg>
        {loading ? "Redirecting to Google…" : label}
      </button>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
