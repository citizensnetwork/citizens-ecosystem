"use client";

/**
 * CoverPhotoManager — contributor dashboard widget for managing up to 5 cover
 * photos (Stage C). Upload, edit caption, reorder, and remove.
 *
 * Server source of truth: POST/PATCH/DELETE /api/contributor/cover-photos.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import {
  COVER_PHOTOS_MAX,
  COVER_PHOTO_CAPTION_MAX,
  type CoverPhoto,
} from "@/types/db";
import { validateImageFile } from "@/lib/validation";
import { compressImageIfNeeded } from "@/lib/imageCompression";

type Props = {
  initialPhotos: CoverPhoto[];
};

export default function CoverPhotoManager({ initialPhotos }: Props) {
  const [photos, setPhotos] = useState<CoverPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [savingPatch, setSavingPatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const atCap = photos.length >= COVER_PHOTOS_MAX;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setError(null);
    const validationError = validateImageFile(raw);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }
    const file = await compressImageIfNeeded(raw);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/contributor/cover-photos", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        photos?: CoverPhoto[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }
      if (data.photos) setPhotos(data.photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patch(next: CoverPhoto[]): Promise<boolean> {
    setSavingPatch(true);
    setError(null);
    const previous = photos;
    setPhotos(next);
    try {
      const res = await fetch("/api/contributor/cover-photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        photos?: CoverPhoto[];
        error?: string;
      };
      if (!res.ok) {
        setPhotos(previous);
        setError(data.error ?? "Save failed");
        return false;
      }
      if (data.photos) setPhotos(data.photos);
      return true;
    } catch (err) {
      setPhotos(previous);
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSavingPatch(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    await patch(next);
  }

  async function remove(index: number) {
    setError(null);
    const previous = photos;
    const optimistic = photos.filter((_, i) => i !== index);
    setPhotos(optimistic);
    try {
      const res = await fetch(
        `/api/contributor/cover-photos?index=${index}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        photos?: CoverPhoto[];
        error?: string;
      };
      if (!res.ok) {
        setPhotos(previous);
        throw new Error(data.error ?? "Delete failed");
      }
      if (data.photos) setPhotos(data.photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function saveCaption(index: number) {
    const photo = photos[index];
    const draft = draftCaptions[photo.url];
    if (draft === undefined) return;
    const next = photos.map((p, i) =>
      i === index ? { ...p, caption: draft.trim() || null } : p,
    );
    const ok = await patch(next);
    if (ok) {
      setDraftCaptions((prev) => {
        const copy = { ...prev };
        delete copy[photo.url];
        return copy;
      });
    }
  }

  return (
    <section className="surface-card rounded-2xl p-6">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold">
            Cover photos ({photos.length}/{COVER_PHOTOS_MAX})
          </h3>
          <p className="text-xs text-[--foreground-soft] mt-1">
            16:9 banner shown behind your avatar on your public profile. Auto-rotates for visitors.
          </p>
        </div>
        <label
          className={`text-sm px-3 py-1.5 rounded-xl font-semibold transition-opacity cursor-pointer ${
            atCap || uploading
              ? "bg-[--surface-muted] text-[--foreground-soft] cursor-not-allowed"
              : "bg-[--gold] text-black hover:opacity-90"
          }`}
        >
          {uploading ? "Uploading…" : atCap ? "Limit reached" : "Add photo"}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            disabled={atCap || uploading}
            onChange={handleUpload}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 mb-3">
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-[--foreground-soft]">
          No cover photos yet. Add up to {COVER_PHOTOS_MAX} 16:9 images.
        </p>
      ) : (
        <ul className="space-y-3">
          {photos.map((photo, index) => {
            const draft = draftCaptions[photo.url];
            const captionValue = draft ?? photo.caption ?? "";
            const dirty = draft !== undefined;
            return (
              <li
                key={photo.url}
                className="flex gap-3 items-start border border-[--border] rounded-xl p-3 bg-[--surface]"
              >
                <div className="relative w-32 h-20 shrink-0 overflow-hidden rounded-lg bg-[--surface-muted]">
                  <Image
                    src={photo.url}
                    alt={photo.caption ?? `Cover photo ${index + 1}`}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wide text-[--foreground-soft]">
                      Caption (optional)
                    </span>
                    <input
                      type="text"
                      maxLength={COVER_PHOTO_CAPTION_MAX}
                      value={captionValue}
                      onChange={(e) =>
                        setDraftCaptions((prev) => ({
                          ...prev,
                          [photo.url]: e.target.value,
                        }))
                      }
                      placeholder="Add a caption"
                      className="mt-1 w-full text-sm rounded-lg border border-[--border] bg-[--surface] px-2 py-1.5"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || savingPatch}
                      className="px-2 py-1 rounded-md border border-[--border] disabled:opacity-40"
                      aria-label={`Move photo ${index + 1} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === photos.length - 1 || savingPatch}
                      className="px-2 py-1 rounded-md border border-[--border] disabled:opacity-40"
                      aria-label={`Move photo ${index + 1} down`}
                    >
                      ↓
                    </button>
                    {dirty && (
                      <button
                        type="button"
                        onClick={() => saveCaption(index)}
                        disabled={savingPatch}
                        className="px-2 py-1 rounded-md bg-[--gold] text-black font-semibold disabled:opacity-40"
                      >
                        Save caption
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="ml-auto px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
