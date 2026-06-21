"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface LinkConnectAccountProps {
  orgId: string;
}

/**
 * Links a Vision org to its Citizens Connect contributor by vanity slug. Once
 * linked, the org's Connect events/places surface here for claiming.
 */
export function LinkConnectAccount({ orgId }: LinkConnectAccountProps) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, slug: slug.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not link account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-primary">
        Connect your Citizens Connect account
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Link this organisation to its Citizens Connect contributor to surface the
        events and places you publish there — ready to claim and fold into your
        Vision activity.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="cc-slug" className="sr-only">
          Citizens Connect contributor slug
        </label>
        <input
          id="cc-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="your-contributor-slug"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !slug.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Linking…" : "Link account"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
