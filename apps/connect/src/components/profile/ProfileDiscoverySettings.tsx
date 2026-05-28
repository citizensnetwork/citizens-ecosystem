"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, Copy, Link as LinkIcon } from "lucide-react";

interface Props {
  userId: string;
  initialHandle: string | null;
  initialDiscoverable: boolean;
}

/**
 * Handles setting + discoverable toggle + copy profile link.
 * Lives on the own-profile settings page.
 */
export default function ProfileDiscoverySettings({
  userId,
  initialHandle,
  initialDiscoverable,
}: Props) {
  const [handle, setHandle] = useState(initialHandle ?? "");
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/profile/${handle ? `@${handle}` : userId}`
      : `/profile/${handle ? `@${handle}` : userId}`;

  async function handleSave() {
    setError(null);
    setSaving(true);
    setSaved(false);

    const trimmedHandle = handle.trim().toLowerCase() || null;

    if (trimmedHandle) {
      if (trimmedHandle.length < 3 || trimmedHandle.length > 30) {
        setError("Handle must be 3–30 characters.");
        setSaving(false);
        return;
      }
      if (!/^[a-z0-9_]+$/.test(trimmedHandle)) {
        setError("Handle may only contain lowercase letters, numbers and underscores.");
        setSaving(false);
        return;
      }
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ handle: trimmedHandle, discoverable })
      .eq("id", userId);

    setSaving(false);

    if (updateErr) {
      if (updateErr.code === "23505") {
        setError("That handle is already taken. Try another.");
      } else {
        setError("Failed to save. Please try again.");
      }
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="space-y-5">
      {/* @handle */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-black/70">
          Your @handle
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-black/40">@</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="yourhandle"
            maxLength={30}
            className="flex-1 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-black placeholder:text-black/30 focus:border-[var(--gold)] focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-black/40">
          3–30 chars, lowercase, letters, numbers and underscores only.
          Your profile URL will be: <code className="rounded bg-black/5 px-1">/profile/@{handle || "yourhandle"}</code>
        </p>
      </div>

      {/* Discoverable toggle */}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-black/80">Let others at my events find me</p>
          <p className="mt-0.5 text-xs text-black/45">
            Your first name and avatar appear in the &ldquo;People attending&rdquo; section for others at the same event.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={discoverable}
          onClick={() => setDiscoverable((d) => !d)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            discoverable ? "bg-[var(--gold)]" : "bg-black/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              discoverable ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>

        {/* Copy profile link */}
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-sm text-black/60 transition hover:bg-black/[0.03] hover:text-black"
          title="Copy profile link"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-500" />
              <span className="text-green-600">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy profile link
            </>
          )}
        </button>

        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-black/35 hover:text-black/60"
          title="View public profile"
        >
          <LinkIcon size={12} />
          Preview
        </a>
      </div>
    </div>
  );
}
