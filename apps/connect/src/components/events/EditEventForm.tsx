"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Event, EventCategory } from "@/types/db";

const LocationPicker = dynamic(() => import("@/components/map/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full rounded-lg border bg-gray-50 flex items-center justify-center text-sm text-gray-400">
      Loading map...
    </div>
  ),
});

const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "church-service", label: "⛪ Church Service" },
  { value: "youth", label: "🌟 Youth" },
  { value: "community-outreach", label: "🤝 Community Outreach" },
  { value: "worship", label: "🎵 Worship Night" },
  { value: "bible-study", label: "📖 Bible Study" },
  { value: "prayer", label: "🙏 Prayer Meeting" },
  { value: "social", label: "🎉 Social" },
  { value: "other", label: "📌 Other" },
];

type Props = { event: Event };

export default function EditEventForm({ event }: Props) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [date, setDate] = useState(
    new Date(event.date).toISOString().slice(0, 16)
  );
  const [location, setLocation] = useState(event.location);
  const [category, setCategory] = useState<EventCategory>(
    event.category ?? "other"
  );
  const [coords, setCoords] = useState<[number, number] | null>(
    event.latitude && event.longitude
      ? [event.latitude, event.longitude]
      : null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    event.image_url ?? null
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setError("Not logged in."); setLoading(false); return; }

    let image_url = event.image_url;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, imageFile, { upsert: true });
      if (upErr) { setError("Image upload failed: " + upErr.message); setLoading(false); return; }
      image_url = supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl;
    }

    const { error: updateErr } = await supabase
      .from("events")
      .update({
        title,
        description,
        date: new Date(date).toISOString(),
        location,
        category,
        image_url,
        latitude: coords?.[0] ?? null,
        longitude: coords?.[1] ?? null,
      })
      .eq("id", event.id);

    if (updateErr) { setError(updateErr.message); setLoading(false); return; }

    router.push(`/events/${event.id}`);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setDeleting(true);
    await supabase.from("events").delete().eq("id", event.id);
    router.push("/events");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Event</h1>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "🗑 Delete Event"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium mb-1">Category</label>
        <select id="category" value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} className="w-full border rounded-md px-3 py-2 text-sm">
          {EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="coverImage" className="block text-sm font-medium mb-1">
          Cover Image <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input id="coverImage" type="file" accept="image/*" onChange={handleImageChange}
          className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        {imagePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt="Preview" className="mt-2 rounded-lg w-full max-h-48 object-cover" />
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="date" className="block text-sm font-medium mb-1">Date & Time</label>
        <input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium mb-1">Location</label>
        <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Pin on Map</label>
        <LocationPicker position={coords} onSelect={(lat, lng) => setCoords([lat, lng])} />
      </div>

      <button type="submit" disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
        {loading ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
