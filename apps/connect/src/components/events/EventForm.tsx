"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { EventCategory } from "@/types/db";

const LocationPicker = dynamic(() => import("@/components/map/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="surface-card h-[300px] w-full rounded-xl p-3">
      <div className="skeleton h-full w-full rounded-lg" />
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

export default function EventForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<EventCategory>("other");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImagePreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to create an event.");
      setLoading(false);
      return;
    }

    // Upload image if provided
    let image_url: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(path, imageFile, { upsert: true });

      if (uploadError) {
        setError("Image upload failed: " + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("event-images")
        .getPublicUrl(path);
      image_url = urlData.publicUrl;
    }

    const { error } = await supabase.from("events").insert({
      title,
      description,
      date: new Date(date).toISOString(),
      location,
      category,
      image_url,
      latitude: coords?.[0] ?? null,
      longitude: coords?.[1] ?? null,
      created_by: user.id,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-lg">
      <h1 className="text-2xl font-bold">Create Event</h1>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
          placeholder="Community Clean-Up Day"
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium mb-1">
          Category
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory)}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          {EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="coverImage" className="block text-sm font-medium mb-1">
          Cover Image <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="coverImage"
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {imagePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt="Preview"
            className="mt-2 rounded-lg w-full max-h-48 object-cover"
          />
        )}
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium mb-1"
        >
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="w-full border rounded-md px-3 py-2 text-sm"
          placeholder="Tell people what this event is about..."
        />
      </div>

      <div>
        <label htmlFor="date" className="block text-sm font-medium mb-1">
          Date & Time
        </label>
        <input
          id="date"
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium mb-1">
          Location
        </label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
          placeholder="123 Main St, City"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Pin on Map</label>
        <LocationPicker
          position={coords}
          onSelect={(lat, lng) => setCoords([lat, lng])}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? "Creating..." : "Create Event"}
      </button>
    </form>
  );
}
