"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Category, Place } from "@/types/db";

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
  place: Place;
  categories: Category[];
};

export default function EditPlaceForm({ place, categories }: Props) {
  const [name, setName] = useState(place.name);
  const [description, setDescription] = useState(place.description);
  const [address, setAddress] = useState(place.address);
  const [categoryId, setCategoryId] = useState(place.category_id ?? "");
  const [customCategory, setCustomCategory] = useState(
    place.custom_category ?? ""
  );
  const [phone, setPhone] = useState(place.phone ?? "");
  const [website, setWebsite] = useState(place.website ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    place.image_url ?? null
  );
  const [coords, setCoords] = useState<[number, number] | null>([
    place.latitude,
    place.longitude,
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
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
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    let image_url: string | null = place.image_url;
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

    const { error: updateError } = await supabase
      .from("places")
      .update({
        name,
        description,
        address,
        category_id: categoryId || null,
        custom_category:
          isOther && customCategory.trim() ? customCategory.trim() : null,
        phone: phone || null,
        website: website || null,
        image_url,
        latitude: coords[0],
        longitude: coords[1],
      })
      .eq("id", place.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push(`/places/${place.id}`);
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    setError("");

    // Check 6-month creation rule
    const createdAt = new Date(place.created_at);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (createdAt > sixMonthsAgo) {
      setError(
        "Places cannot be removed within 6 months of creation. Contact an admin for exceptions."
      );
      setLoading(false);
      setShowDeleteConfirm(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("places")
      .delete()
      .eq("id", place.id);

    if (deleteError) {
      setError(deleteError.message);
      setLoading(false);
      setShowDeleteConfirm(false);
      return;
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Edit Place</h1>

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
            const cat = categories.find((c) => c.id === e.target.value);
            if (cat?.slug !== "other") setCustomCategory("");
          }}
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-(--gold) py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/places/${place.id}`)}
          className="rounded-md border border-black/15 px-4 py-2 text-sm text-black/60 hover:bg-black/5"
        >
          Cancel
        </button>
      </div>

      {/* Delete section */}
      <div className="border-t border-black/8 pt-4">
        {showDeleteConfirm ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md border px-4 py-2 text-sm text-black/60 hover:bg-black/5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Delete this place
          </button>
        )}
      </div>
    </form>
  );
}
