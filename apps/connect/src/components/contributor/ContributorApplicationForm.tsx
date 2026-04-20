"use client";

// ContributorApplicationForm
//
// Form used by a Citizen to apply to become a Contributor. Submits to
// /api/contributor/apply which proxies to the Supabase Edge Function.
//
// The form intentionally mirrors the fields a Contributor can set on
// their public profile — so the application is a preview of how they
// would present themselves, which gives the admin reviewer enough
// context to decide in one glance.

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  defaultDisplayName?: string;
  defaultKind?: "ministry" | "organization" | "business" | null;
}

type FormState = {
  display_name: string;
  contributor_kind: "ministry" | "organization" | "business" | "";
  bio: string;
  website_url: string;
  instagram_handle: string;
  facebook_url: string;
  tiktok_handle: string;
  youtube_url: string;
  physical_address: string;
  motivation_text: string;
};

const initial = (
  defaultDisplayName: string,
  defaultKind: Props["defaultKind"],
): FormState => ({
  display_name: defaultDisplayName ?? "",
  contributor_kind: defaultKind ?? "",
  bio: "",
  website_url: "",
  instagram_handle: "",
  facebook_url: "",
  tiktok_handle: "",
  youtube_url: "",
  physical_address: "",
  motivation_text: "",
});

export function ContributorApplicationForm({
  defaultDisplayName = "",
  defaultKind = null,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(
    initial(defaultDisplayName, defaultKind),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.display_name.trim().length < 2) {
      setError("Please enter the name your community knows you by.");
      return;
    }
    if (form.motivation_text.trim().length < 20) {
      setError(
        "Tell us a little more about what you want to contribute — a sentence or two helps.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contributor/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: form.display_name.trim(),
          contributor_kind: form.contributor_kind || null,
          bio: form.bio.trim() || null,
          website_url: form.website_url.trim() || null,
          instagram_handle: form.instagram_handle.trim() || null,
          facebook_url: form.facebook_url.trim() || null,
          tiktok_handle: form.tiktok_handle.trim() || null,
          youtube_url: form.youtube_url.trim() || null,
          physical_address: form.physical_address.trim() || null,
          motivation_text: form.motivation_text.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.error === "already_pending") {
        // User submitted in another tab already — treat as success.
        router.push("/profile?application=submitted");
        return;
      }
      if (!res.ok) {
        setError(
          data.error === "display_name_required"
            ? "Please enter a display name."
            : "Something went wrong. Please try again in a moment.",
        );
        return;
      }
      router.push("/profile?application=submitted");
    } catch (err) {
      console.error(err);
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <p className="text-sm text-black/70">
        Contributors can create public events, manage places on the map, and
        build a public profile. Applications are reviewed by the Citizens
        Network team — expect a response within a few days.
      </p>

      <Section title="Your identity">
        <Field label="Display name" required>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            maxLength={120}
            className={inputCls}
            placeholder="The name your community knows you by"
          />
        </Field>

        <Field label="Kind">
          <select
            value={form.contributor_kind}
            onChange={(e) =>
              set(
                "contributor_kind",
                e.target.value as FormState["contributor_kind"],
              )
            }
            className={inputCls}
          >
            <option value="">Choose one (optional)</option>
            <option value="ministry">Ministry / Church</option>
            <option value="organization">Non-profit / Organisation</option>
            <option value="business">Business</option>
          </select>
        </Field>

        <Field label="Bio">
          <textarea
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            rows={4}
            maxLength={600}
            className={inputCls}
            placeholder="A short introduction your community would see on your profile."
          />
        </Field>
      </Section>

      <Section title="Where to find you">
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

        <Field label="Physical address (if applicable)">
          <input
            type="text"
            value={form.physical_address}
            onChange={(e) => set("physical_address", e.target.value)}
            className={inputCls}
            placeholder="Street, suburb, city"
          />
        </Field>
      </Section>

      <Section title="Why you want to contribute">
        <Field label="Tell us a bit about what you'd like to share" required>
          <textarea
            value={form.motivation_text}
            onChange={(e) => set("motivation_text", e.target.value)}
            rows={5}
            maxLength={1500}
            className={inputCls}
            placeholder="What kinds of events or places would you bring to the platform? What communities do you serve?"
          />
        </Field>
      </Section>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-xl bg-(--gold,#D4AF37) px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/40 focus:border-[color:var(--gold,#D4AF37)] focus:outline-none focus:ring-1 focus:ring-[color:var(--gold,#D4AF37)]";

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
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-black/70">
        {label}
        {required ? <span className="ml-0.5 text-(--gold,#D4AF37)">*</span> : null}
      </span>
      {children}
    </label>
  );
}
