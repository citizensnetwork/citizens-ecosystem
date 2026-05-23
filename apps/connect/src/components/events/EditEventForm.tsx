"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { validateImageFile, safeImageExtension } from "@/lib/validation";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { uploadEventMedia } from "@/lib/eventMedia";
import MediaGalleryUploader, { type SelectedMedia } from "./MediaGalleryUploader";
import SearchProfilePicker from "./SearchProfilePicker";
import TagPicker from "./TagPicker";
import type { Event, EventCategory, EventStatus, EventVisibility, AttendeesVisibility, EventMedia, EventTag } from "@/types/db";
import type { SearchProfile } from "@/lib/searchProfile";

const LocationPicker = dynamic(() => import("@/components/map/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-75 w-full rounded-lg border bg-gray-50 flex items-center justify-center text-sm text-gray-400">
      Loading map...
    </div>
  ),
});

type Props = { event: Event };

export default function EditEventForm({ event }: Props) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [date, setDate] = useState(
    new Date(event.date).toISOString().slice(0, 16)
  );
  const [endTime, setEndTime] = useState(
    event.end_time ? new Date(event.end_time).toISOString().slice(0, 16) : ""
  );
  const [location, setLocation] = useState(event.location);
  // Track whether the user has manually edited Location so we don't
  // overwrite their edits on a subsequent map click.
  const locationManuallyEdited = useRef(false);
  const [category, setCategory] = useState<EventCategory>(
    event.category ?? "church-services"
  );
  const [websiteUrl, setWebsiteUrl] = useState(event.website_url ?? "");
  const [contactEmail, setContactEmail] = useState(event.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(event.contact_phone ?? "");
  const [maxAttendees, setMaxAttendees] = useState(
    event.max_attendees != null ? String(event.max_attendees) : ""
  );
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [visibility, setVisibility] = useState<EventVisibility>(
    event.visibility ?? "public"
  );
  const [attendeesVisible, setAttendeesVisible] = useState<AttendeesVisibility>(
    event.attendees_visible
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
  const [existingMedia, setExistingMedia] = useState<EventMedia[]>([]);
  const [galleryItems, setGalleryItems] = useState<SelectedMedia[]>([]);
  const [searchProfile, setSearchProfile] = useState<SearchProfile | null>(
    event.search_profile ?? null,
  );
  const [tags, setTags] = useState<EventTag[]>([]);
  const [initialTagIds, setInitialTagIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Load existing gallery items
  useEffect(() => {
    let cancelled = false;
    const client = createClient();
    client
      .from("event_photos")
      .select("*")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }: { data: EventMedia[] | null }) => {
        if (!cancelled && data) setExistingMedia(data);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  // Load existing tag assignments so the picker hydrates with the
  // current state.  The join-through query returns nested tag rows,
  // which we flatten for the picker's `EventTag[]` contract.
  useEffect(() => {
    let cancelled = false;
    const client = createClient();
    client
      .from("event_tag_assignments")
      .select("tag:event_tags(id, slug, label, is_official, is_hidden, usage_count, created_by, created_at)")
      .eq("event_id", event.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const rows = data as unknown as Array<{ tag: EventTag | EventTag[] | null }>;
        const flat = rows
          .map((r) => (Array.isArray(r.tag) ? r.tag[0] : r.tag))
          .filter((t): t is EventTag => t !== null && t !== undefined && !t.is_hidden);
        setTags(flat);
        setInitialTagIds(new Set(flat.map((t) => t.id)));
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  async function handleRemoveExisting(id: string) {
    if (!confirm("Remove this gallery item?")) return;
    const { error: delErr } = await supabase
      .from("event_photos")
      .delete()
      .eq("id", id);
    if (delErr) {
      setError("Failed to remove: " + delErr.message);
      return;
    }
    setExistingMedia((prev) => prev.filter((m) => m.id !== id));
  }



  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0] ?? null;
    if (!raw) {
      setError("");
      setImageFile(null);
      return;
    }
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
      const safeExt = safeImageExtension(imageFile.name);
      const path = `${user.id}/${Date.now()}.${safeExt}`;
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
      })
      .eq("id", event.id);

    if (updateErr) { setError(updateErr.message); setLoading(false); return; }

    // Append any newly-picked gallery items after the highest existing sort_order
    if (galleryItems.length > 0) {
      const startSortOrder =
        existingMedia.length > 0
          ? Math.max(...existingMedia.map((m) => m.sort_order)) + 1
          : 0;
      const galleryErr = await uploadEventMedia(supabase, {
        eventId: event.id,
        userId: user.id,
        items: galleryItems,
        startSortOrder,
      });
      if (galleryErr) {
        setError(galleryErr);
        setLoading(false);
        return;
      }
    }

    // Sync tag assignments: POST additions, DELETE removals.  Failures
    // here are non-fatal — the event update has already persisted.
    const currentIds = new Set(tags.map((t) => t.id));
    const toAdd = tags.filter((t) => !initialTagIds.has(t.id));
    const toRemove = Array.from(initialTagIds).filter((id) => !currentIds.has(id));
    if (toAdd.length > 0 || toRemove.length > 0) {
      await Promise.allSettled([
        ...toAdd.map((t) =>
          fetch(`/api/events/${event.id}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag_id: t.id }),
          }),
        ),
        ...toRemove.map((id) =>
          fetch(`/api/events/${event.id}/tags?tagId=${encodeURIComponent(id)}`, {
            method: "DELETE",
          }),
        ),
      ]);
    }

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

  async function handleCancel() {
    if (!confirm("Cancel this event? Attendees will see it as cancelled.")) return;
    setLoading(true);
    const { error: cancelErr } = await supabase
      .from("events")
      .update({ status: "cancelled" })
      .eq("id", event.id);
    if (cancelErr) { setError(cancelErr.message); setLoading(false); return; }
    router.push(`/events/${event.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Event</h1>
        <div className="flex gap-2">
          {event.status !== "cancelled" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="text-sm text-orange-600 hover:text-orange-800 disabled:opacity-50"
            >
              ⚠️ Cancel Event
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete Event"}
          </button>
        </div>
      </div>

      {event.status === "cancelled" && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-medium">
          This event has been cancelled.
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className="w-full border rounded-md px-3 py-2 text-sm" />
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
        <input id="coverImage" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleImageChange}
          className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        {imagePreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt="Preview" className="mt-2 rounded-lg w-full max-h-48 object-cover" />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Gallery</label>
        {existingMedia.length > 0 && (
          <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {existingMedia.map((m) => (
              <li key={m.id} className="relative">
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black/5">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.title ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveExisting(m.id)}
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
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} maxLength={5000} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="date" className="block text-sm font-medium mb-1">Start Date & Time</label>
        <input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="endTime" className="block text-sm font-medium mb-1">
          End Date & Time <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input id="endTime" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} min={date} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium mb-1">Location</label>
        <input id="location" type="text" value={location} onChange={(e) => { locationManuallyEdited.current = true; setLocation(e.target.value); }} required maxLength={300} className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Pin on Map</label>
        <LocationPicker
          position={coords}
          onSelect={(lat, lng) => setCoords([lat, lng])}
          onAddress={(addr) => {
            if (!locationManuallyEdited.current) setLocation(addr);
          }}
        />
      </div>

      {/* Additional details */}
      <div className="border-t pt-4 mt-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Additional Details</h2>

        <div>
          <label className="block text-sm font-medium mb-1">
            Discovery tags <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <SearchProfilePicker value={searchProfile} onChange={setSearchProfile} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Tags <span className="text-gray-400 font-normal">(optional, up to 5)</span>
          </label>
          <TagPicker value={tags} onChange={setTags} />
        </div>

        <div>
          <label htmlFor="websiteUrl" className="block text-sm font-medium mb-1">
            Website <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input id="websiteUrl" type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="https://example.com" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contactEmail" className="block text-sm font-medium mb-1">
              Contact Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="info@church.org" />
          </div>
          <div>
            <label htmlFor="contactPhone" className="block text-sm font-medium mb-1">
              Contact Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input id="contactPhone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="+27 31 123 4567" />
          </div>
        </div>

        <div>
          <label htmlFor="maxAttendees" className="block text-sm font-medium mb-1">
            Max Attendees <span className="text-gray-400 font-normal">(optional — blank for unlimited)</span>
          </label>
          <input id="maxAttendees" type="number" min="1" value={maxAttendees} onChange={(e) => setMaxAttendees(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="100" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="status" className="block text-sm font-medium mb-1">Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              {event.status === "cancelled" && <option value="cancelled">Cancelled</option>}
            </select>
          </div>
          <div>
            <label htmlFor="visibility" className="block text-sm font-medium mb-1">Visibility</label>
            <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as EventVisibility)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="public">Public</option>
              <option value="private">Private — invited only</option>
            </select>
          </div>
          <div>
            <label htmlFor="attendeesVisible" className="block text-sm font-medium mb-1">Who&apos;s Attending</label>
            <select id="attendeesVisible" value={attendeesVisible} onChange={(e) => setAttendeesVisible(e.target.value as AttendeesVisibility)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="authenticated">Logged-in users see names</option>
              <option value="public">Everyone sees names</option>
              <option value="count_only">Count only</option>
            </select>
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading}
        className="w-full bg-(--gold) text-black py-2 rounded-md hover:brightness-95 disabled:opacity-50 text-sm font-medium">
        {loading ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
