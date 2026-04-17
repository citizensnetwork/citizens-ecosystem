"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { EVENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/categories";
import { validateImageFile, safeImageExtension } from "@/lib/validation";
import { compressImageIfNeeded, SKIP_IF_SMALLER_THAN } from "@/lib/imageCompression";
import { suggestCategory } from "@/lib/categorySuggest";
import { uploadEventMedia } from "@/lib/eventMedia";
import MediaGalleryUploader, { type SelectedMedia } from "./MediaGalleryUploader";
import SearchProfilePicker from "./SearchProfilePicker";
import type { EventCategory, Category } from "@/types/db";
import type { SearchProfile } from "@/lib/searchProfile";

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

/** Shared input/select/textarea style — thin, rounded, minimal, matches the
 *  glass design system. Keeps the form visually consistent across fields. */
const CC_INPUT =
  "w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm " +
  "placeholder:text-black/30 focus:outline-none focus:border-black/30 " +
  "focus:bg-white transition";

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
  const [galleryItems, setGalleryItems] = useState<SelectedMedia[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [searchProfile, setSearchProfile] = useState<SearchProfile | null>(null);
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

  // Has the user manually chosen a category? If so, stop auto-suggesting.
  const categoryManuallySet = useRef(false);
  // Has the user typed/edited the Location field manually? If so, never
  // auto-overwrite from a map click — even if they clear it afterwards.
  const locationManuallyEdited = useRef(false);
  // Auto-suggested category (same as `category` when auto) — shown as a tiny
  // "Suggested based on your description" hint.
  const [suggestedCategory, setSuggestedCategory] = useState<EventCategory | null>(null);



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

  // Auto-category assessment — suggest a category from title + description.
  // The organiser always keeps the final say; as soon as they pick one
  // manually we stop overriding.
  useEffect(() => {
    if (categoryManuallySet.current) return;
    const suggestion = suggestCategory(title, description, location, placeName);
    if (suggestion) {
      setSuggestedCategory(suggestion);
      setCategory(suggestion);
    } else {
      setSuggestedCategory(null);
    }
  }, [title, description, location, placeName]);

  function handleCancel() {
    if (isDirty()) {
      if (!window.confirm("Booking in progress, cancel editing?")) return;
    }
    router.push("/events");
  }

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

    // Auto-compress oversized photos so phone camera originals (5–15 MB)
    // land well under the bucket limit without any user effort.
    const file = await compressImageIfNeeded(rawFile);

    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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
      const safeExt = safeImageExtension(imageFile.name);
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

    const { data: inserted, error } = await supabase.from("events").insert({
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
      search_profile: searchProfile ?? null,
      created_by: user.id,
    }).select("id").single();

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Upload gallery items (photos + videos) — fire after event insert so we
    // have a valid event_id. Failures here are non-fatal to the event row;
    // we surface the message but still navigate so the organiser can retry
    // the gallery from the edit screen.
    if (inserted?.id && galleryItems.length > 0) {
      const galleryErr = await uploadEventMedia(supabase, {
        eventId: inserted.id,
        userId: user.id,
        items: galleryItems,
      });
      if (galleryErr) {
        setError(galleryErr);
        setLoading(false);
        return;
      }
    }

    router.push("/events");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create Event</h1>
        <p className="mt-1 text-xs text-black/50">
          Details are saved only when you press Create Event.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50/90 text-red-700 p-3 text-sm border border-red-100">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-xs font-medium text-black/60 mb-1.5">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className={CC_INPUT}
          placeholder="Community Clean-Up Day"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-xs font-medium text-black/60 mb-1.5"
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
          className={CC_INPUT}
          placeholder="Tell people what this event is about..."
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-xs font-medium text-black/60 mb-1.5">
          Category
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => {
            categoryManuallySet.current = true;
            setCategory(e.target.value as EventCategory);
          }}
          required
          className={CC_INPUT}
        >
          {EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {suggestedCategory && !categoryManuallySet.current && (
          <p className="mt-1.5 text-[11px] text-black/50">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-(--gold) align-middle mr-1.5" />
            Suggested from your description: <strong className="font-medium">{CATEGORY_LABELS[suggestedCategory]}</strong>
          </p>
        )}
      </div>

      <div>
        <label htmlFor="coverImage" className="block text-xs font-medium text-black/60 mb-1.5">
          Cover Image <span className="text-black/30 font-normal">(optional)</span>
        </label>
        <input
          id="coverImage"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleImageChange}
          className="w-full text-sm text-black/60 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-black/5 file:text-black hover:file:bg-black/10"
        />
        <p className="mt-1 text-[11px] text-black/40">
          Photos over {Math.round(SKIP_IF_SMALLER_THAN / (1024 * 1024) * 10) / 10} MB are auto-compressed in your browser before upload.
        </p>
        {imagePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreview}
            alt="Preview"
            className="mt-2 rounded-xl w-full max-h-48 object-cover"
          />
        )}
      </div>

      <MediaGalleryUploader items={galleryItems} onChange={setGalleryItems} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="date" className="block text-xs font-medium text-black/60 mb-1.5">
            Start Date & Time
          </label>
          <input
            id="date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={CC_INPUT}
          />
        </div>

        <div>
          <label htmlFor="endTime" className="block text-xs font-medium text-black/60 mb-1.5">
            End Date & Time <span className="text-black/30 font-normal">(optional)</span>
          </label>
          <input
            id="endTime"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            min={date}
            className={CC_INPUT}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-black/60 mb-1.5">
          Pin on Map
        </label>
        <LocationPicker
          position={coords}
          onSelect={(lat, lng) => setCoords([lat, lng])}
          onAddress={(addr) => {
            // Only auto-fill when the user hasn't typed or cleared the field
            // themselves — we never silently overwrite intentional edits.
            if (!locationManuallyEdited.current) setLocation(addr);
          }}
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-xs font-medium text-black/60 mb-1.5">
          Location
          <span className="ml-1 text-black/30 font-normal">(auto-filled from map pin — edit as needed)</span>
        </label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => {
            locationManuallyEdited.current = true;
            setLocation(e.target.value);
          }}
          required
          maxLength={300}
          className={CC_INPUT}
          placeholder="Drop a pin above, or type the address"
        />
      </div>

      {/* Contact & details */}
      <div className="border-t border-black/10 pt-5 mt-5 space-y-4">
        <h2 className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Additional Details</h2>

        {/* Discovery tags — power natural-language search (AI search) */}
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">
            Discovery tags <span className="text-black/30 font-normal">(optional)</span>
          </label>
          <SearchProfilePicker value={searchProfile} onChange={setSearchProfile} />
        </div>

        <div>
          <label htmlFor="websiteUrl" className="block text-xs font-medium text-black/60 mb-1.5">
            Website <span className="text-black/30 font-normal">(optional)</span>
          </label>
          <input
            id="websiteUrl"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className={CC_INPUT}
            placeholder="https://example.com"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contactEmail" className="block text-xs font-medium text-black/60 mb-1.5">
              Contact Email <span className="text-black/30 font-normal">(optional)</span>
            </label>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={CC_INPUT}
              placeholder="info@church.org"
            />
          </div>
          <div>
            <label htmlFor="contactPhone" className="block text-xs font-medium text-black/60 mb-1.5">
              Contact Phone <span className="text-black/30 font-normal">(optional)</span>
            </label>
            <input
              id="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={CC_INPUT}
              placeholder="+27 31 123 4567"
            />
          </div>
        </div>

        <div>
          <label htmlFor="maxAttendees" className="block text-xs font-medium text-black/60 mb-1.5">
            Max Attendees <span className="text-black/30 font-normal">(optional — leave blank for unlimited)</span>
          </label>
          <input
            id="maxAttendees"
            type="number"
            min="1"
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
            className={CC_INPUT}
            placeholder="100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="visibility" className="block text-xs font-medium text-black/60 mb-1.5">
              Event Visibility
            </label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "public" | "private")}
              className={CC_INPUT}
            >
              <option value="public">Public — visible to everyone</option>
              <option value="private">Private — only invited members can see</option>
            </select>
          </div>
          <div>
            <label htmlFor="attendeesVisible" className="block text-xs font-medium text-black/60 mb-1.5">
              Who&apos;s Attending Visibility
            </label>
            <select
              id="attendeesVisible"
              value={attendeesVisible}
              onChange={(e) => setAttendeesVisible(e.target.value as "public" | "authenticated" | "count_only")}
              className={CC_INPUT}
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
        <div className="border-t border-black/10 pt-5 mt-5 space-y-4">
          <h2 className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Event Venue</h2>

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
            <div className="space-y-3 rounded-2xl border border-black/10 bg-white/60 p-4">
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
                <div className="space-y-3 border-t border-black/10 pt-3">
                  <div>
                    <label htmlFor="placeName" className="block text-xs font-medium text-black/60 mb-1.5">
                      Place Name
                    </label>
                    <input
                      id="placeName"
                      type="text"
                      value={placeName}
                      onChange={(e) => setPlaceName(e.target.value)}
                      className={CC_INPUT}
                      placeholder="Grace Community Church"
                    />
                  </div>

                  <div>
                    <label htmlFor="placeCategory" className="block text-xs font-medium text-black/60 mb-1.5">
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
                      className={CC_INPUT}
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
                        className={`mt-2 ${CC_INPUT}`}
                        placeholder="Describe the category (e.g. Bookshop, Food Bank)"
                        maxLength={100}
                      />
                    )}
                  </div>

                  <div>
                    <label htmlFor="placeDescription" className="block text-xs font-medium text-black/60 mb-1.5">
                      Place Description
                    </label>
                    <textarea
                      id="placeDescription"
                      value={placeDescription}
                      onChange={(e) => setPlaceDescription(e.target.value)}
                      rows={2}
                      className={CC_INPUT}
                      placeholder="A brief description of this place..."
                    />
                  </div>

                  <div>
                    <label htmlFor="placeAddress" className="block text-xs font-medium text-black/60 mb-1.5">
                      Place Address <span className="text-gray-400 font-normal">(defaults to event location)</span>
                    </label>
                    <input
                      id="placeAddress"
                      type="text"
                      value={placeAddress}
                      onChange={(e) => setPlaceAddress(e.target.value)}
                      className={CC_INPUT}
                      placeholder="123 Main St, Durban"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="placePhone" className="block text-xs font-medium text-black/60 mb-1.5">
                        Phone <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        id="placePhone"
                        type="tel"
                        value={placePhone}
                        onChange={(e) => setPlacePhone(e.target.value)}
                        className={CC_INPUT}
                        placeholder="+27 31 000 0000"
                      />
                    </div>
                    <div>
                      <label htmlFor="placeWebsite" className="block text-xs font-medium text-black/60 mb-1.5">
                        Website <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        id="placeWebsite"
                        type="url"
                        value={placeWebsite}
                        onChange={(e) => setPlaceWebsite(e.target.value)}
                        className={CC_INPUT}
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

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 rounded-xl border border-black/10 bg-white/70 text-black/70 py-2.5 hover:bg-white text-sm font-medium transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-xl bg-(--gold) text-black py-2.5 hover:brightness-95 disabled:opacity-50 text-sm font-semibold shadow-sm transition"
        >
          {loading ? "Creating…" : "Create Event"}
        </button>
      </div>
    </form>
  );
}
