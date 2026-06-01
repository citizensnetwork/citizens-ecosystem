"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { EVENT_CATEGORIES, CATEGORY_LABELS } from "@/lib/categories";
import { validateImageFile, sanitizeSocialUrl } from "@/lib/validation";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { compressImageIfNeeded, SKIP_IF_SMALLER_THAN } from "@/lib/imageCompression";
import { suggestCategory } from "@/lib/categorySuggest";
import { uploadEventMedia } from "@/lib/eventMedia";
import MediaGalleryUploader, { type SelectedMedia } from "./MediaGalleryUploader";
import SearchProfilePicker from "./SearchProfilePicker";
import TagPicker from "./TagPicker";
import type { EventCategory, Category, EventTag } from "@/types/db";
import { deriveSearchProfile, type SearchProfile } from "@/lib/searchProfile";
import Link from "next/link";
import { share } from "@/lib/capacitor/share";

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
  const [category, setCategory] = useState<EventCategory>("church-services");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [status] = useState<"draft" | "published">("published");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  // Attendee visibility has been simplified to a single behaviour: attendee
  // names are private by default — only the aggregate count plus the
  // current user's own friends are surfaced ("Friends attending"). This
  // removes a confusing field from the create-event form while keeping the
  // existing DB column populated for back-compat.
  const attendeesVisible: "public" | "authenticated" | "count_only" = "count_only";
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [galleryItems, setGalleryItems] = useState<SelectedMedia[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [searchProfile, setSearchProfile] = useState<SearchProfile | null>(null);
  const [tags, setTags] = useState<EventTag[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // After a successful publish we transition the form into a celebratory
  // success state instead of redirecting straight to the map.  Holding the
  // new event id locally keeps the share UX working on slow connections
  // (no need to refetch).
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Social media handles
  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // Volunteer openings
  const [volunteerOpenings, setVolunteerOpenings] = useState(false);

  // Recurring event
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly">("weekly");
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [recurringCount, setRecurringCount] = useState("");

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

  // Location autocomplete (MapTiler forward geocoding). Lets the user type a
  // place name and drop the pin / coords via suggestion without touching the
  // map. Falls back to a plain text input when the MapTiler key is missing.
  const [locationSuggestions, setLocationSuggestions] = useState<
    { label: string; lat: number; lng: number }[]
  >([]);
  const [locationSuggestOpen, setLocationSuggestOpen] = useState(false);
  const suppressSuggestRef = useRef(false);



  const router = useRouter();
  const supabase = createClient();



  // Track whether form has been touched
  const isDirty = useCallback(() => {
    return !!(title || description || date || location || imageFile || coords ||
      placeName || placeDescription || placeAddress || instagramUrl || facebookUrl ||
      tiktokUrl || youtubeUrl || volunteerOpenings || isRecurring);
  }, [title, description, date, location, imageFile, coords, placeName, placeDescription, placeAddress, instagramUrl, facebookUrl, tiktokUrl, youtubeUrl, volunteerOpenings, isRecurring]);

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

  // MapTiler forward geocoding — surfaces address suggestions as the user
  // types in the Location field, so picking a suggestion drops the map pin
  // and sets coords without needing a second interaction. Debounced by
  // 300ms to avoid hammering the API on every keystroke.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) return;
    if (suppressSuggestRef.current) {
      suppressSuggestRef.current = false;
      return;
    }
    const q = location.trim();
    if (q.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
          q
        )}.json?key=${key}&limit=5&language=en`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const json = (await res.json()) as {
          features?: Array<{
            place_name?: string;
            text?: string;
            center?: [number, number];
          }>;
        };
        const next = (json.features ?? [])
          .filter((f) => Array.isArray(f.center) && f.center.length === 2)
          .map((f) => ({
            label: f.place_name ?? f.text ?? "",
            lng: f.center![0],
            lat: f.center![1],
          }))
          .filter((s) => s.label);
        setLocationSuggestions(next);
      } catch {
        /* network / abort — ignore */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [location]);

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

    // Boundary validation — UI uses `required`/`min` attributes for
    // hints but a determined client (or a future programmatic flow)
    // can bypass them. DB columns have no CHECK on lat/lng or
    // date-ordering so we validate here. Mirrors the same guard in
    // EditEventForm.
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError("Title can't be empty.");
      setLoading(false);
      return;
    }
    if (coords) {
      const [lat, lng] = coords;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        setError("Pinned location is out of range. Please re-select on the map.");
        setLoading(false);
        return;
      }
    }
    if (endTime && new Date(endTime) <= new Date(date)) {
      setError("End time must be after start time.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to create an event.");
      setLoading(false);
      return;
    }

    // Upload image if provided (via server route — browser-client JWT is
    // unreliable at the Storage endpoint, see uploadMediaFile).
    let image_url: string | null = null;
    if (imageFile) {
      const uploaded = await uploadMediaFile(imageFile, { scope: "event-cover" });
      if ("error" in uploaded) {
        setError("Image upload failed: " + uploaded.error);
        setLoading(false);
        return;
      }
      image_url = uploaded.url;
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
      title: trimmedTitle,
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
      search_profile:
        searchProfile ?? deriveSearchProfile(title, description, location) ?? null,
      instagram_url: sanitizeSocialUrl(instagramUrl),
      facebook_url: sanitizeSocialUrl(facebookUrl),
      tiktok_url: sanitizeSocialUrl(tiktokUrl),
      youtube_url: sanitizeSocialUrl(youtubeUrl),
      volunteer_openings: volunteerOpenings,
      is_recurring: isRecurring,
      recurring_pattern: isRecurring
        ? {
            frequency: recurringFrequency,
            ...(recurringDays.length > 0 ? { days_of_week: recurringDays } : {}),
            ...(recurringEndDate ? { end_date: recurringEndDate } : {}),
            ...(recurringCount ? (() => { const n = parseInt(recurringCount, 10); return Number.isFinite(n) ? { count: n } : {}; })() : {}),
          }
        : null,
      created_by: user.id,
    }).select("id").single();

    if (error) {
      // DB trigger raises this when a Citizen tries to create more
      // public community events than the rate-limit allows (default:
      // 1 per 30 days). Surface a friendly message instead of the
      // raw SQL exception.
      if (error.message.includes("community_event_rate_limited")) {
        setError(
          "As a Citizen you can only create one public community event every 30 days. Apply to become a Contributor to publish regularly.",
        );
      } else {
        setError(error.message);
      }
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

    // Assign selected tags to the newly created event. Failures here are
    // non-fatal — organisers can re-try from the edit screen. We fire
    // them in parallel to keep the publish path fast.
    if (inserted?.id && tags.length > 0) {
      await Promise.allSettled(
        tags.map((tag) =>
          fetch(`/api/events/${inserted.id}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag_id: tag.id }),
          }),
        ),
      );
    }

    // Transition to the success state instead of redirecting.  The organiser
    // gets a moment to share the event before navigating away — the single
    // biggest determinant of an event's reach is whether the creator shares
    // it within the first 60 seconds of publishing.
    if (inserted?.id) {
      setPublishedId(inserted.id);
      setLoading(false);
      // Refresh in the background so the events list is fresh by the time
      // the organiser navigates back.
      router.refresh();
      return;
    }

    router.push("/events");
    router.refresh();
  }

  // ── Success state ───────────────────────────────────────────────────
  // After a successful insert we bail out of the form and render a compact
  // celebratory panel with share affordances.  Sharing within the first
  // minute or two of publishing is the biggest determinant of an event's
  // reach, so we make it the most prominent action before any navigation.
  if (publishedId) {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/events/${publishedId}`
        : `/events/${publishedId}`;
    // Short, value-forward message that reads well in WhatsApp and SMS
    // previews.  The URL is appended by the platform (or copied via
    // clipboard fallback), so we don't duplicate it in the body.
    const shareText = `You're invited to ${title || "a gathering"} on Citizens Connect.`;

    async function handleShare() {
      try {
        const opened = await share({
          title: title || "New event on Citizens Connect",
          text: shareText,
          url: shareUrl,
        });
        // `share()` returns false when it fell back to clipboard — surface a
        // brief "Copied" confirmation so the organiser knows something happened.
        if (!opened) {
          setShareCopied(true);
          window.setTimeout(() => setShareCopied(false), 2200);
        }
      } catch {
        // User dismissed the share sheet.  Nothing to do — this is a
        // normal interaction and shouldn't surface as an error.
      }
    }

    async function handleCopyLink() {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl);
          setShareCopied(true);
          window.setTimeout(() => setShareCopied(false), 2200);
        }
      } catch {
        // Clipboard permissions can be blocked in some browsers; we
        // intentionally keep this silent — the native share button
        // remains available as a fallback.
      }
    }

    return (
      <div className="space-y-5 w-full">
        {/* Celebratory header.  Gold ring + pulse keeps the moment feeling
            like an achievement rather than a bland confirmation toast. */}
        <div className="surface-card rounded-2xl p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--gold-soft) ring-2 ring-(--gold)">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 text-black"
              aria-hidden
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Published!
          </h1>
          <p className="mt-1.5 text-sm text-black/60">
            Share it now — most attendees decide within the first hour.
          </p>
        </div>

        {/* Primary action: share.  Gold-filled, takes full width so it
            dominates the layout and is unmissable on touch targets. */}
        <button
          type="button"
          onClick={handleShare}
          className="w-full rounded-xl bg-(--gold) py-3 text-sm font-semibold text-black shadow-sm transition hover:brightness-95"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share event
          </span>
        </button>

        {/* Secondary: copy link, for orgs that share into channels where the
            native sheet isn't useful (Slack, Discord, email drafts). */}
        <button
          type="button"
          onClick={handleCopyLink}
          className="w-full rounded-xl border border-black/10 bg-white/80 py-2.5 text-sm font-medium text-black/80 transition hover:bg-white"
        >
          {shareCopied ? "Link copied ✓" : "Copy link"}
        </button>

        {/* Nav links.  Kept visually quieter than the share CTAs on purpose
            — we want the organiser to share before they navigate away. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Link
            href="/events"
            className="flex-1 rounded-xl border border-black/10 bg-white/70 py-2.5 text-center text-sm font-medium text-black/70 transition hover:bg-white"
          >
            Back to map
          </Link>
          <Link
            href={`/events/${publishedId}`}
            className="flex-1 rounded-xl border border-black bg-black py-2.5 text-center text-sm font-semibold text-white transition hover:bg-black/85"
          >
            View event
          </Link>
        </div>

        <p className="text-center text-[11px] text-black/40">
          You can edit details anytime from{" "}
          <Link href="/events/manage" className="underline hover:text-black/70">
            Manage Events
          </Link>
          .
        </p>
      </div>
    );
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
          accept="image/jpeg,image/png,image/gif,image/webp"
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
          address={location}
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-xs font-medium text-black/60 mb-1.5">
          Location
          <span className="ml-1 text-black/30 font-normal">(type to search, or drop a pin above)</span>
        </label>
        <div className="relative">
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => {
              locationManuallyEdited.current = true;
              setLocation(e.target.value);
              setLocationSuggestOpen(true);
            }}
            onFocus={() => setLocationSuggestOpen(true)}
            onBlur={() => {
              // Small delay so click on a suggestion registers before the list hides.
              setTimeout(() => setLocationSuggestOpen(false), 150);
            }}
            required
            maxLength={300}
            className={CC_INPUT}
            placeholder="Start typing an address, suburb or landmark"
            autoComplete="off"
          />
          {locationSuggestOpen && locationSuggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-black/10 bg-white/95 p-1 text-sm shadow-lg backdrop-blur"
            >
              {locationSuggestions.map((s, i) => (
                <li key={`${s.lat},${s.lng},${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      suppressSuggestRef.current = true;
                      setLocation(s.label);
                      setCoords([s.lat, s.lng]);
                      setLocationSuggestions([]);
                      setLocationSuggestOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-black/5"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-(--gold)">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span className="text-black/80">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

        {/* Custom tags — up to 5 free-form labels, used for faceted filters */}
        <div>
          <label className="block text-xs font-medium text-black/60 mb-1.5">
            Tags <span className="text-black/30 font-normal">(optional, up to 5)</span>
          </label>
          <TagPicker value={tags} onChange={setTags} />
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

        <div>
          <div>
            <label htmlFor="visibility" className="block text-xs font-medium text-black/60 mb-1.5">
              Who can see this event?
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
        </div>

        {/* Volunteer openings toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none group">
          <div
            role="switch"
            aria-label="Volunteer openings"
            aria-checked={volunteerOpenings}
            tabIndex={0}
            onClick={() => setVolunteerOpenings((v) => !v)}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setVolunteerOpenings((v) => !v); } }}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--gold) ${volunteerOpenings ? "bg-(--gold)" : "bg-black/15"}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${volunteerOpenings ? "translate-x-4.5" : "translate-x-0.5"}`}
            />
          </div>
          <div>
            <span className="text-sm font-medium text-black">Volunteer openings</span>
            <p className="text-[11px] text-black/50 leading-tight">
              Let people know this event is looking for volunteers
            </p>
          </div>
        </label>

        {/* Recurring event toggle + pattern */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <div
              role="switch"
              aria-label="Recurring event"
              aria-checked={isRecurring}
              tabIndex={0}
              onClick={() => setIsRecurring((v) => !v)}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setIsRecurring((v) => !v); } }}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--gold) ${isRecurring ? "bg-(--gold)" : "bg-black/15"}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isRecurring ? "translate-x-4.5" : "translate-x-0.5"}`}
              />
            </div>
            <div>
              <span className="text-sm font-medium text-black">Recurring event</span>
              <p className="text-[11px] text-black/50 leading-tight">
                This event repeats on a regular schedule
              </p>
            </div>
          </label>

          {isRecurring && (
            <div className="rounded-2xl border border-black/10 bg-white/60 p-4 space-y-3">
              <div>
                <label htmlFor="recurringFrequency" className="block text-xs font-medium text-black/60 mb-1.5">
                  Frequency
                </label>
                <select
                  id="recurringFrequency"
                  value={recurringFrequency}
                  onChange={(e) => setRecurringFrequency(e.target.value as typeof recurringFrequency)}
                  className={CC_INPUT}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              {recurringFrequency === "weekly" && (
                <div>
                  <p className="block text-xs font-medium text-black/60 mb-1.5">Days of week</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((day) => {
                      const val = day.toLowerCase();
                      const active = recurringDays.includes(val);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() =>
                            setRecurringDays((prev) =>
                              active ? prev.filter((d) => d !== val) : [...prev, val],
                            )
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            active
                              ? "bg-(--gold) text-black"
                              : "bg-black/5 text-black/60 hover:bg-black/10"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="recurringEndDate" className="block text-xs font-medium text-black/60 mb-1.5">
                    End date <span className="text-black/30 font-normal">(optional)</span>
                  </label>
                  <input
                    id="recurringEndDate"
                    type="date"
                    value={recurringEndDate}
                    min={date ? date.slice(0, 10) : undefined}
                    onChange={(e) => setRecurringEndDate(e.target.value)}
                    className={CC_INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="recurringCount" className="block text-xs font-medium text-black/60 mb-1.5">
                    Occurrences <span className="text-black/30 font-normal">(optional)</span>
                  </label>
                  <input
                    id="recurringCount"
                    type="number"
                    min="2"
                    max="365"
                    value={recurringCount}
                    onChange={(e) => setRecurringCount(e.target.value)}
                    className={CC_INPUT}
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Social Media ────────────────────────────────── */}
      <div className="border-t border-black/10 pt-5 mt-5 space-y-4">
        <h2 className="text-[11px] font-semibold text-black/40 uppercase tracking-wider">Social Media</h2>
        <p className="text-[11px] text-black/50 -mt-2">
          Share links or handles so attendees can follow along. Full URLs or @handles both accepted.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="instagramUrl" className="flex items-center gap-1.5 text-xs font-medium text-black/60 mb-1.5">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-pink-500" aria-hidden>
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
              Instagram
            </label>
            <input
              id="instagramUrl"
              type="text"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              className={CC_INPUT}
              placeholder="@handle or https://instagram.com/…"
              maxLength={300}
            />
          </div>

          <div>
            <label htmlFor="facebookUrl" className="flex items-center gap-1.5 text-xs font-medium text-black/60 mb-1.5">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-blue-600" aria-hidden>
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </label>
            <input
              id="facebookUrl"
              type="text"
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              className={CC_INPUT}
              placeholder="https://facebook.com/…"
              maxLength={300}
            />
          </div>

          <div>
            <label htmlFor="tiktokUrl" className="flex items-center gap-1.5 text-xs font-medium text-black/60 mb-1.5">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-black" aria-hidden>
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
              TikTok
            </label>
            <input
              id="tiktokUrl"
              type="text"
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              className={CC_INPUT}
              placeholder="@handle or https://tiktok.com/…"
              maxLength={300}
            />
          </div>

          <div>
            <label htmlFor="youtubeUrl" className="flex items-center gap-1.5 text-xs font-medium text-black/60 mb-1.5">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-red-600" aria-hidden>
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTube
            </label>
            <input
              id="youtubeUrl"
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className={CC_INPUT}
              placeholder="https://youtube.com/…"
              maxLength={300}
            />
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
