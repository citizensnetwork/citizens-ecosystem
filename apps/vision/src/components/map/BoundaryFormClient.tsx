"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GeoFenceEditor } from "@/components/map/GeoFenceEditor";
import { BOUNDARY_COLOURS } from "@/lib/constants";

interface BoundaryFormClientProps {
  orgId: string;
  orgSlug: string;
}

export function BoundaryFormClient({ orgId, orgSlug }: BoundaryFormClientProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colour, setColour] = useState<string>(BOUNDARY_COLOURS[0]);
  const [geojson, setGeojson] = useState<GeoJSON.Polygon | GeoJSON.MultiPolygon | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!geojson) {
      setError("Please define the boundary geometry.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/boundaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: name.trim(),
          description: description.trim() || undefined,
          boundary_geojson: geojson,
          colour,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create boundary");
      }

      router.push(`/${orgSlug}/boundaries`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create boundary");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-text-primary">
          Name *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="e.g. Central Business District"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-text-primary">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Describe the service area…"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Colour
        </label>
        <div className="flex gap-2">
          {BOUNDARY_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColour(c)}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                colour === c ? "scale-110 border-accent" : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <GeoFenceEditor
          onSave={(geo) => setGeojson(geo)}
          onCancel={() => setGeojson(null)}
        />
        {geojson && (
          <p className="mt-2 text-xs text-green-400">
            ✓ Boundary geometry set ({geojson.type})
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !geojson}
          className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Boundary"}
        </button>
      </div>
    </form>
  );
}
