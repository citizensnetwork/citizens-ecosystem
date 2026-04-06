"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Category } from "@/types/db";

const LocationPicker = dynamic(
  () => import("@/components/map/LocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="surface-card h-75 w-full rounded-xl p-3">
        <div className="skeleton h-full w-full rounded-lg" />
      </div>
    ),
  }
);

type Props = {
  categories: Category[];
};

export default function PlaceForm({ categories }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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

    if (!coords) {
      setError("Please pin the location on the map.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to add a place.");
      setLoading(false);
      return;
    }

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

    const selectedCategory = categories.find((c) => c.id === categoryId);
    const isOther = selectedCategory?.slug === "other";

    const { error: insertError } = await supabase.from("places").insert({
      name,
      description,
      address,
      category_id: categoryId || null,
      custom_category: isOther && customCategory.trim() ? customCategory.trim() : null,
      phone: phone || null,
      website: website || null,
      image_url,
      latitude: coords[0],
      longitude: coords[1],
      created_by: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Add a Place</h1>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Grace Community Church"
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">
          Category
        </label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            // Clear custom category when switching away from "other"
            const cat = categories.find((c) => c.id === e.target.value);
            if (cat?.slug !== "other") setCustomCategory("");
          }}
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        {categories.find((c) => c.id === categoryId)?.slug === "other" && (
          <input
            type="text"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Describe the category (e.g. Bookshop, Food Bank)"
            maxLength={100}
          />
        )}
      </div>

      <div>
        <label htmlFor="coverImage" className="mb-1 block text-sm font-medium">
          Photo <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="coverImage"
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
        />
        {imagePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt="Preview"
            className="mt-2 max-h-48 w-full rounded-lg object-cover"
          />
        )}
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-1 block text-sm font-medium"
        >
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="A brief description of this place..."
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1 block text-sm font-medium">
          Address
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="123 Main St, Durban"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium">
            Phone{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="+27 31 000 0000"
          />
        </div>
        <div>
          <label htmlFor="website" className="mb-1 block text-sm font-medium">
            Website{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="https://example.co.za"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Pin on Map <span className="text-red-500">*</span>
        </label>
        <LocationPicker
          position={coords}
          onSelect={(lat, lng) => setCoords([lat, lng])}
          onAddress={(addr) => setAddress(addr)}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-(--gold) py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Add Place"}
      </button>
    </form>
  );
}
