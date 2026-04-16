"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { EVENT_CATEGORIES } from "@/lib/categories";
import type { EventCategory, Category } from "@/types/db";

const LocationPicker = dynamic(() => import("@/components/map/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="surface-card h-75 w-full rounded-xl p-3">
      <div className="skeleton h-full w-full rounded-lg" />
    </div>
  ),
});

type Props = {
  isVendor?: boolean;
  placeCategories?: Category[];
};

export default function EventForm({ isVendor = false, placeCategories = [] }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<EventCategory>("church");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [status] = useState<"draft" | "published">("published");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [attendeesVisible, setAttendeesVisible] = useState<"public" | "authenticated" | "count_only">("authenticated");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Vendor-only: place booking
  const [bookAtPlace, setBookAtPlace] = useState(false);
  const [addNewPlace, setAddNewPlace] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placeDescription, setPlaceDescription] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeCategoryId, setPlaceCategoryId] = useState("");
  const [placeCustomCategory, setPlaceCustomCategory] = useState("");
  const [placePhone, setPlacePhone] = useState("");
  const [placeWebsite, setPlaceWebsite] = useState("");



  const router = useRouter();
  const supabase = createClient();



  // Track whether form has been touched
  const isDirty = useCallback(() => {
    return !!(title || description || date || location || imageFile || coords ||
      placeName || placeDescription || placeAddress);
  }, [title, description, date, location, imageFile, coords, placeName, placeDescription, placeAddress]);

  // Unsaved changes guard
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty()) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function handleCancel() {
    if (isDirty()) {
      if (!window.confirm("Booking in progress, cancel editing?")) return;
    }
    router.push("/events");
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      // Validate MIME type — only allow safe image formats
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
      if (!allowedTypes.includes(file.type)) {
        setError("Only JPEG, PNG, GIF, WebP, or SVG images are allowed.");
        e.target.value = "";
        return;
      }
      // Validate file size — max 5MB
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be smaller than 5 MB.");
        e.target.value = "";
        return;
      }
    }
    setError("");
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
      const rawExt = (imageFile.name.split(".").pop() ?? "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(rawExt) ? rawExt : "jpg";
      const path = `${user.id}/${Date.now()}.${safeExt}`;
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

    // If vendor is adding a new place, create it first
    if (isVendor && bookAtPlace && addNewPlace && placeName.trim()) {
      const selectedPlaceCat = placeCategories.find((c) => c.id === placeCategoryId);
      const isOtherCat = selectedPlaceCat?.slug === "other";

      const { error: placeError } = await supabase.from("places").insert({
        name: placeName,
        description: placeDescription,
        address: placeAddress || location,
        category_id: placeCategoryId || null,
        custom_category: isOtherCat && placeCustomCategory.trim() ? placeCustomCategory.trim() : null,
        phone: placePhone || null,
        website: placeWebsite || null,
        latitude: coords?.[0] ?? null,
        longitude: coords?.[1] ?? null,
        created_by: user.id,
      });

      if (placeError) {
        setError("Failed to create place: " + placeError.message);
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from("events").insert({
      title,
      description,
      date: new Date(date).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : null,
      location,
      category,
      image_url,
      website_url: websiteUrl || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      max_attendees: maxAttendees ? parseInt(maxAttendees, 10) : null,
      status,
      visibility,
      attendees_visible: attendeesVisible,
      latitude: coords?.[0] ?? null,
      longitude: coords?.[1] ?? null,
      created_by: user.id,
    }).select("id").single();

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
          maxLength={200}
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
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
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
          maxLength={5000}
          className="w-full border rounded-md px-3 py-2 text-sm"
          placeholder="Tell people what this event is about..."
        />
      </div>

      <div>
        <label htmlFor="date" className="block text-sm font-medium mb-1">
          Start Date & Time
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
        <label htmlFor="endTime" className="block text-sm font-medium mb-1">
          End Date & Time <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="endTime"
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          min={date}
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
          maxLength={300}
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

      {/* Contact & details */}
      <div className="border-t pt-4 mt-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Additional Details</h2>

        <div>
          <label htmlFor="websiteUrl" className="block text-sm font-medium mb-1">
            Website <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="websiteUrl"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="https://example.com"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contactEmail" className="block text-sm font-medium mb-1">
              Contact Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="info@church.org"
            />
          </div>
          <div>
            <label htmlFor="contactPhone" className="block text-sm font-medium mb-1">
              Contact Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="+27 31 123 4567"
            />
          </div>
        </div>

        <div>
          <label htmlFor="maxAttendees" className="block text-sm font-medium mb-1">
            Max Attendees <span className="text-gray-400 font-normal">(optional — leave blank for unlimited)</span>
          </label>
          <input
            id="maxAttendees"
            type="number"
            min="1"
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="visibility" className="block text-sm font-medium mb-1">
              Event Visibility
            </label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "public" | "private")}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="public">Public — visible to everyone</option>
              <option value="private">Private — only invited members can see</option>
            </select>
          </div>
          <div>
            <label htmlFor="attendeesVisible" className="block text-sm font-medium mb-1">
              Who&apos;s Attending Visibility
            </label>
            <select
              id="attendeesVisible"
              value={attendeesVisible}
              onChange={(e) => setAttendeesVisible(e.target.value as "public" | "authenticated" | "count_only")}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="authenticated">Logged-in users see names</option>
              <option value="public">Everyone sees names</option>
              <option value="count_only">Count only — no names</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Vendor-only: Place Booking ──────────────────── */}
      {isVendor && (
        <div className="border-t pt-4 mt-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Event Venue</h2>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bookAtPlace}
              onChange={(e) => {
                setBookAtPlace(e.target.checked);
                if (!e.target.checked) setAddNewPlace(false);
              }}
              className="rounded"
            />
            Book this event at a place
          </label>

          {bookAtPlace && (
            <div className="space-y-3 rounded-lg border border-black/10 bg-black/2 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addNewPlace}
                  onChange={(e) => setAddNewPlace(e.target.checked)}
                  className="rounded"
                />
                Add a new place
              </label>
              <p className="text-xs text-black/40">
                Note: Places cannot be removed within 6 months of creation (admin-only feature).
              </p>

              {addNewPlace && (
                <div className="space-y-3 border-t border-black/8 pt-3">
                  <div>
                    <label htmlFor="placeName" className="block text-sm font-medium mb-1">
                      Place Name
                    </label>
                    <input
                      id="placeName"
                      type="text"
                      value={placeName}
                      onChange={(e) => setPlaceName(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      placeholder="Grace Community Church"
                    />
                  </div>

                  <div>
                    <label htmlFor="placeCategory" className="block text-sm font-medium mb-1">
                      Place Category
                    </label>
                    <select
                      id="placeCategory"
                      value={placeCategoryId}
                      onChange={(e) => {
                        setPlaceCategoryId(e.target.value);
                        const cat = placeCategories.find((c) => c.id === e.target.value);
                        if (cat?.slug !== "other") setPlaceCustomCategory("");
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select a category</option>
                      {placeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {placeCategories.find((c) => c.id === placeCategoryId)?.slug === "other" && (
                      <input
                        type="text"
                        value={placeCustomCategory}
                        onChange={(e) => setPlaceCustomCategory(e.target.value)}
                        className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Describe the category (e.g. Bookshop, Food Bank)"
                        maxLength={100}
                      />
                    )}
                  </div>

                  <div>
                    <label htmlFor="placeDescription" className="block text-sm font-medium mb-1">
                      Place Description
                    </label>
                    <textarea
                      id="placeDescription"
                      value={placeDescription}
                      onChange={(e) => setPlaceDescription(e.target.value)}
                      rows={2}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      placeholder="A brief description of this place..."
                    />
                  </div>

                  <div>
                    <label htmlFor="placeAddress" className="block text-sm font-medium mb-1">
                      Place Address <span className="text-gray-400 font-normal">(defaults to event location)</span>
                    </label>
                    <input
                      id="placeAddress"
                      type="text"
                      value={placeAddress}
                      onChange={(e) => setPlaceAddress(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      placeholder="123 Main St, Durban"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="placePhone" className="block text-sm font-medium mb-1">
                        Phone <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        id="placePhone"
                        type="tel"
                        value={placePhone}
                        onChange={(e) => setPlacePhone(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        placeholder="+27 31 000 0000"
                      />
                    </div>
                    <div>
                      <label htmlFor="placeWebsite" className="block text-sm font-medium mb-1">
                        Website <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        id="placeWebsite"
                        type="url"
                        value={placeWebsite}
                        onChange={(e) => setPlaceWebsite(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        placeholder="https://example.co.za"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-(--gold) text-black py-2 rounded-md hover:brightness-95 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? "Creating..." : "Create Event"}
      </button>

      <button
        type="button"
        onClick={handleCancel}
        className="w-full bg-black/8 text-black/60 py-2 rounded-md hover:bg-black/12 text-sm font-medium transition"
      >
        Cancel
      </button>
    </form>
  );
}
