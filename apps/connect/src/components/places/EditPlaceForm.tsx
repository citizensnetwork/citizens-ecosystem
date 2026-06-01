"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Category, Place, PlaceMedia } from "@/types/db";
import type { SearchProfile } from "@/lib/searchProfile";
import SearchProfilePicker from "@/components/events/SearchProfilePicker";
import MediaGalleryUploader, { type SelectedMedia } from "@/components/media/MediaGalleryUploader";
import { validateImageFile } from "@/lib/validation";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { uploadPlaceMedia } from "@/lib/placeMedia";
import ConfirmModal from "@/components/ui/ConfirmModal";

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
  media?: PlaceMedia[];
};

export default function EditPlaceForm({ place, categories, media = [] }: Props) {
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
  const [removeImage, setRemoveImage] = useState(false);
  const [existingMedia, setExistingMedia] = useState<PlaceMedia[]>(media);
  const [galleryItems, setGalleryItems] = useState<SelectedMedia[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>([
    place.latitude,
    place.longitude,
  ]);
  const [searchProfile, setSearchProfile] = useState<SearchProfile | null>(
    place.search_profile ?? null,
  );
  const [volunteerOpenings, setVolunteerOpenings] = useState(
    place.volunteer_openings ?? false,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingRemoveMediaId, setPendingRemoveMediaId] = useState<string | null>(null);
  const [removingMedia, setRemovingMedia] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  function handleRemoveCoverImage() {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0] ?? null;
    if (!raw) {
      setError("");
      setImageFile(null);
      return;
    }
    setRemoveImage(false);
    const validationError = validateImageFile(raw);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }
    const file = await compressImageIfNeeded(raw);
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleRemoveExistingMedia(id: string) {
    setPendingRemoveMediaId(id);
  }

  async function confirmRemoveExistingMedia() {
    if (!pendingRemoveMediaId) return;
    setRemovingMedia(true);
    const { error: deleteError } = await supabase
      .from("place_media")
      .delete()
      .eq("id", pendingRemoveMediaId);

    if (deleteError) {
      setError("Failed to remove media item. Please try again.");
      setRemovingMedia(false);
      setPendingRemoveMediaId(null);
      return;
    }

    setExistingMedia((prev) => prev.filter((item) => item.id !== pendingRemoveMediaId));
    setRemovingMedia(false);
    setPendingRemoveMediaId(null);
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

    let image_url: string | null = removeImage ? null : (place.image_url ?? null);
    if (imageFile) {
      const uploaded = await uploadMediaFile(imageFile, { scope: "place-cover" });
      if ("error" in uploaded) {
        setError("Image upload failed: " + uploaded.error);
        setLoading(false);
        return;
      }
      image_url = uploaded.url;
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
        search_profile: searchProfile ?? null,
        volunteer_openings: volunteerOpenings,
      })
      .eq("id", place.id);

    if (updateError) {
      setError("Failed to save changes. Please try again.");
      setLoading(false);
      return;
    }

    if (galleryItems.length > 0) {
      const startSortOrder =
        existingMedia.length > 0
          ? Math.max(...existingMedia.map((item) => item.sort_order)) + 1
          : 0;
      const galleryError = await uploadPlaceMedia(supabase, {
        placeId: place.id,
        userId: user.id,
        items: galleryItems,
        startSortOrder,
      });
      if (galleryError) {
        setError(galleryError);
        setLoading(false);
        return;
      }
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
      setError("Failed to delete place. Please try again.");
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
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">
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
          Organisation Icon{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="coverImage"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleImageChange}
          className="w-full text-sm text-black/60 file:mr-3 file:rounded-full file:border-0 file:bg-black/5 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-black hover:file:bg-black/10"
        />
        {imagePreview && (
          <div className="mt-2 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Preview"
              className="max-h-48 w-full rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={handleRemoveCoverImage}
              aria-label="Remove organisation icon"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-black"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3 w-3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Gallery</label>
        {existingMedia.length > 0 && (
          <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {existingMedia.map((item) => (
              <li key={item.id} className="relative">
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black/5">
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.title ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveExistingMedia(item.id)}
                    aria-label="Remove existing gallery item"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-black"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3 w-3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <MediaGalleryUploader
          items={galleryItems}
          onChange={setGalleryItems}
          existingCount={existingMedia.length}
          entityLabel="place"
        />
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

      {pendingRemoveMediaId ? (
        <ConfirmModal
          title="Remove this gallery item?"
          message="This can't be undone."
          confirmLabel="Remove"
          tone="destructive"
          busy={removingMedia}
          onConfirm={confirmRemoveExistingMedia}
          onCancel={() => {
            if (!removingMedia) setPendingRemoveMediaId(null);
          }}
        />
      ) : null}
    </form>
  );
}
