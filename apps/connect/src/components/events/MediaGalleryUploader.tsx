"use client";

import { useRef, useState } from "react";
import {
  validateMediaFile,
  detectMediaKind,
  MAX_MEDIA_PER_UPLOAD,
} from "@/lib/validation";
import { compressImageIfNeeded } from "@/lib/imageCompression";

export type SelectedMedia = {
  file: File;
  kind: "image" | "video";
  previewUrl: string;
  /** Optional title — shown under the item in the lightbox. */
  title: string;
};

type Props = {
  items: SelectedMedia[];
  onChange: (items: SelectedMedia[]) => void;
  /**
   * Optional list of already-saved media (edit form use case). The picker
   * surfaces the count so organisers stay under the per-event cap.
   */
  existingCount?: number;
  /** Upper bound on total media for the event (existing + new). */
  maxTotal?: number;
};

/**
 * Small multi-file picker used by both EventForm and EditEventForm.
 * Keeps validation/preview/cleanup logic in one place so we can add
 * drag-and-drop or reordering later without touching both forms.
 */
export default function MediaGalleryUploader({
  items,
  onChange,
  existingCount = 0,
  maxTotal = MAX_MEDIA_PER_UPLOAD,
}: Props) {
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = Math.max(0, maxTotal - existingCount - items.length);
    if (remaining <= 0) {
      setError(`You can upload up to ${maxTotal} items per event.`);
      e.target.value = "";
      return;
    }

    const toAdd: SelectedMedia[] = [];
    for (let i = 0; i < files.length && toAdd.length < remaining; i++) {
      const raw = files[i];
      const err = validateMediaFile(raw);
      if (err) {
        setError(err);
        e.target.value = "";
        return;
      }
      const kind = detectMediaKind(raw);
      if (!kind) continue;
      // Compress large photos client-side; videos pass through unchanged.
      const file = kind === "image" ? await compressImageIfNeeded(raw) : raw;
      toAdd.push({
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
        title: "",
      });
    }

    setError("");
    onChange([...items, ...toAdd]);
    e.target.value = "";
  }

  function removeAt(index: number) {
    const next = items.slice();
    const [removed] = next.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    onChange(next);
  }

  function updateTitle(index: number, title: string) {
    const next = items.slice();
    next[index] = { ...next[index], title };
    onChange(next);
  }

  const total = existingCount + items.length;
  const atCap = total >= maxTotal;

  return (
    <div className="rounded-md border border-black/10 bg-white/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          Gallery <span className="font-normal text-gray-400">(optional photos & videos)</span>
        </div>
        <span className="text-xs text-black/50">
          {total} / {maxTotal}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime"
        onChange={handleFilesSelected}
        disabled={atCap}
        className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {atCap && !error && (
        <p className="mt-2 text-xs text-black/50">
          Maximum of {maxTotal} gallery items reached.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item, i) => (
            <li key={`${item.previewUrl}-${i}`} className="relative">
              <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black/5">
                {item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <video
                      src={item.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove item ${i + 1}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-black"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3 w-3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <input
                type="text"
                value={item.title}
                onChange={(e) => updateTitle(i, e.target.value)}
                placeholder="Caption (optional)"
                maxLength={120}
                className="mt-1 w-full rounded-md border border-black/10 px-2 py-1 text-[11px]"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
