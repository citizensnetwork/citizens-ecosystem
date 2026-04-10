"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateOrganisationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/orgs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
        }),
      });

      const body = (await response.json()) as {
        data?: { slug: string };
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Failed to create organisation");
        setLoading(false);
        return;
      }

      if (!body.data?.slug) {
        setError("Organisation created, but redirect data was missing");
        setLoading(false);
        return;
      }

      router.push(`/${body.data.slug}`);
      router.refresh();
    } catch (submitError) {
      console.error("[CreateOrganisationForm] Failed to create organisation", submitError);
      setError("Failed to create organisation");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-text-primary"
        >
          Organisation Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={120}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Citizen Health Network"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-text-primary"
        >
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Short summary of your organisation's mission and work."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Creating organisation..." : "Create Organisation"}
      </button>
    </form>
  );
}