"use client";

// ContributorProfileEditor — self-edit form for the public Contributor
// profile fields on top of the base profile (avatar/name/etc. stay on
// the existing settings surface).  Submits to /api/contributor/profile.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types/db";

export function ContributorProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState({
    bio: profile.bio ?? "",
    website_url: profile.website_url ?? "",
    instagram_handle: profile.instagram_handle ?? "",
    facebook_url: profile.facebook_url ?? "",
    tiktok_handle: profile.tiktok_handle ?? "",
    youtube_url: profile.youtube_url ?? "",
    physical_address: profile.physical_address ?? "",
    logo_url: profile.logo_url ?? "",
    // Gallery as a newline-delimited URL list in the textarea.  Keeps
    // the UI tiny and lets Contributors paste from Drive/Drop etc.
    gallery: Array.isArray(profile.gallery_urls)
      ? profile.gallery_urls.join("\n")
      : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const gallery_urls = form.gallery
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/contributor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: form.bio.trim(),
          website_url: form.website_url.trim(),
          instagram_handle: form.instagram_handle.trim(),
          facebook_url: form.facebook_url.trim(),
          tiktok_handle: form.tiktok_handle.trim(),
          youtube_url: form.youtube_url.trim(),
          physical_address: form.physical_address.trim(),
          logo_url: form.logo_url.trim(),
          gallery_urls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error.replace(/_/g, " ")
            : "Save failed. Please try again.",
        );
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <Section title="About">
        <Field label="Bio">
          <textarea
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            rows={5}
            maxLength={600}
            className={inputCls}
            placeholder="What your community should know about you."
          />
        </Field>
        <Field label="Logo URL">
          <input
            type="url"
            value={form.logo_url}
            onChange={(e) => set("logo_url", e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
        </Field>
      </Section>

      <Section title="Find us online">
        <Field label="Website">
          <input
            type="url"
            value={form.website_url}
            onChange={(e) => set("website_url", e.target.value)}
            className={inputCls}
            placeholder="https://"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram">
            <input
              type="text"
              value={form.instagram_handle}
              onChange={(e) => set("instagram_handle", e.target.value)}
              className={inputCls}
              placeholder="@handle"
            />
          </Field>
          <Field label="Facebook">
            <input
              type="url"
              value={form.facebook_url}
              onChange={(e) => set("facebook_url", e.target.value)}
              className={inputCls}
              placeholder="https://facebook.com/..."
            />
          </Field>
          <Field label="TikTok">
            <input
              type="text"
              value={form.tiktok_handle}
              onChange={(e) => set("tiktok_handle", e.target.value)}
              className={inputCls}
              placeholder="@handle"
            />
          </Field>
          <Field label="YouTube">
            <input
              type="url"
              value={form.youtube_url}
              onChange={(e) => set("youtube_url", e.target.value)}
              className={inputCls}
              placeholder="https://youtube.com/..."
            />
          </Field>
        </div>
      </Section>

      <Section title="Physical address">
        <Field label="Street / suburb / city">
          <input
            type="text"
            value={form.physical_address}
            onChange={(e) => set("physical_address", e.target.value)}
            className={inputCls}
          />
        </Field>
        <p className="text-xs text-black/50">
          Coordinates for the mini-map are set from your previous application.
          Contact support to update them if you&rsquo;ve moved.
        </p>
      </Section>

      <Section title="Gallery">
        <Field label="Image URLs (one per line, up to 6 shown)">
          <textarea
            value={form.gallery}
            onChange={(e) => set("gallery", e.target.value)}
            rows={4}
            className={inputCls}
            placeholder={"https://…/photo-1.jpg\nhttps://…/photo-2.jpg"}
          />
        </Field>
      </Section>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Saved.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-xl bg-(--gold,#D4AF37) px-5 py-2.5 text-sm font-semibold text-black shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/40 focus:border-(--gold,#D4AF37) focus:outline-none focus:ring-1 focus:ring-(--gold,#D4AF37)";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">
        {title}
      </h2>
      <div className="space-y-4 rounded-xl border border-black/10 bg-white p-4">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-black/70">{label}</span>
      {children}
    </label>
  );
}
