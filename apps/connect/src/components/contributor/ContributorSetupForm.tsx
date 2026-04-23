"use client";

/**
 * Minimum-bio gate form shown to citizens who have just been promoted
 * to Contributor. Posts to /api/contributor/setup which clears
 * profiles.bio_setup_required on success. After save we navigate to
 * /events — middleware will no longer redirect because the flag is off.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type Defaults = {
  full_name: string;
  contact_email: string;
  website_url: string;
  bio: string;
};

export default function ContributorSetupForm({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaults.full_name);
  const [contact, setContact] = useState(defaults.contact_email);
  const [website, setWebsite] = useState(defaults.website_url);
  const [bio, setBio] = useState(defaults.bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("Display name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/contributor/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: fullName.trim(),
          contact_email: contact.trim() || null,
          website_url: website.trim() || null,
          bio: bio.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return;
      }
      router.push("/events");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-black">
          Display name <span className="text-red-600">*</span>
        </span>
        <input
          type="text"
          required
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
          placeholder="e.g. Every Nation Mooikloof"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-black">
          Contact email
        </span>
        <input
          type="email"
          maxLength={200}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
          placeholder="hello@example.org"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-black">
          Website
        </span>
        <input
          type="url"
          maxLength={400}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
          placeholder="https://example.org"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-black">
          Short bio
        </span>
        <textarea
          maxLength={500}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
          placeholder="A sentence or two about what you're about."
        />
        <span className="mt-1 block text-right text-xs text-black/50">
          {bio.length}/500
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save & continue"}
      </button>
    </form>
  );
}
