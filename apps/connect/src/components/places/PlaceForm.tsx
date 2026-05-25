"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Category } from "@/types/db";
import { deriveSearchProfile, type SearchProfile } from "@/lib/searchProfile";
import SearchProfilePicker from "@/components/events/SearchProfilePicker";
import MediaGalleryUploader, { type SelectedMedia } from "@/components/media/MediaGalleryUploader";
import { validateImageFile, safeImageExtension } from "@/lib/validation";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { uploadPlaceMedia } from "@/lib/placeMedia";

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
  const [galleryItems, setGalleryItems] = useState<SelectedMedia[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [searchProfile, setSearchProfile] = useState<SearchProfile | null>(null);
  const [volunteerOpenings, setVolunteerOpenings] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0] ?? null;
    if (!rawFile) {
      setError("");
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    const validationError = validateImageFile(rawFile);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }

    const file = await compressImageIfNeeded(rawFile);
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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
      const safeExt = safeImageExtension(imageFile.name);
      const path = `${user.id}/covers/${Date.now()}.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("place-images")
        .upload(path, imageFile, { upsert: true });

      if (uploadError) {
        setError("Image upload failed: " + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("place-images")
        .getPublicUrl(path);
      image_url = urlData.publicUrl;
    }

    const selectedCategory = categories.find((c) => c.id === categoryId);
    const isOther = selectedCategory?.slug === "other";

    const { data: inserted, error: insertError } = await supabase
      .from("places")
      .insert({
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
        search_profile:
          searchProfile ?? deriveSearchProfile(name, description, address) ?? null,
        volunteer_openings: volunteerOpenings,
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (!inserted?.id) {
      setError("Failed to create place: no ID was returned.");
      setLoading(false);
      return;
    }

    if (galleryItems.length > 0) {
      const galleryError = await uploadPlaceMedia(supabase, {
        placeId: inserted.id,
        userId: user.id,
        items: galleryItems,
      });
      if (galleryError) {
        setError(galleryError);
        setLoading(false);
        return;
      }
    }

    router.push(`/places/${inserted.id}`);
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
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleImageChange}
          className="w-full text-sm text-black/60 file:mr-3 file:rounded-full file:border-0 file:bg-black/5 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-black hover:file:bg-black/10"
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

      <MediaGalleryUploader
        items={galleryItems}
        onChange={setGalleryItems}
        entityLabel="place"
      />

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
          address={address}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Discovery tags <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <SearchProfilePicker value={searchProfile} onChange={setSearchProfile} />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-4 py-3">
        <div className="pr-3">
          <p className="text-sm font-medium">Looking for volunteers</p>
          <p className="text-xs text-black/60">
            Shows a &quot;Volunteer&quot; pill on the public page so visitors
            know you welcome helpers.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={volunteerOpenings}
          aria-label="Looking for volunteers"
          onClick={() => setVolunteerOpenings((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-(--gold) ${
            volunteerOpenings ? "bg-(--gold)" : "bg-black/20"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
              volunteerOpenings ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
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
