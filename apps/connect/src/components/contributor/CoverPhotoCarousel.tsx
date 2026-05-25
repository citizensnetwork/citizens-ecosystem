"use client";

/**
 * CoverPhotoCarousel — 16:9 auto-rotating cover-photo banner shown above the
 * contributor public-profile header (Stage C).
 *
 * - Auto-rotates every 5s when more than one photo is present.
 * - Pauses on hover / focus / when the document is hidden.
 * - Keyboard arrows ←/→ navigate slides.
 * - Captions overlay the bottom-left corner; user-supplied strings are
 *   rendered as plain text only (React escapes).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { CoverPhoto } from "@/types/db";

const ROTATE_MS = 5000;

type Props = {
  photos: CoverPhoto[];
  altLabel: string;
};

export default function CoverPhotoCarousel({ photos, altLabel }: Props) {
  const safe = photos.filter(
    (p): p is CoverPhoto =>
      !!p && typeof p.url === "string" && p.url.trim().length > 0,
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const advance = useCallback(
    (direction: 1 | -1) => {
      setIndex((current) => {
        const length = safe.length;
        if (length <= 1) return 0;
        return (current + direction + length) % length;
      });
    },
    [safe.length],
  );

  useEffect(() => {
    if (safe.length <= 1 || paused) return;
    const id = window.setInterval(() => advance(1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [safe.length, paused, advance]);

  useEffect(() => {
    function onVisibility() {
      setPaused(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (safe.length === 0) return null;

  const current = safe[Math.min(index, safe.length - 1)];

  return (
    <div
      ref={rootRef}
      className="relative w-full overflow-hidden bg-black/5"
      style={{ aspectRatio: "16 / 9" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          advance(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          advance(-1);
        }
      }}
      tabIndex={safe.length > 1 ? 0 : -1}
      role={safe.length > 1 ? "region" : undefined}
      aria-roledescription={safe.length > 1 ? "carousel" : undefined}
      aria-label={safe.length > 1 ? `${altLabel} cover photos` : undefined}
    >
      {safe.map((photo, i) => (
        <div
          key={photo.url}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === index ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={i === index ? undefined : true}
        >
          <Image
            src={photo.url}
            alt={photo.caption ?? altLabel}
            fill
            priority={i === 0}
            sizes="(max-width: 768px) 100vw, 896px"
            className="object-cover"
          />
          {photo.caption && (
            <div className="absolute bottom-3 left-3 max-w-[80%] rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">
              {photo.caption}
            </div>
          )}
        </div>
      ))}

      {safe.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => advance(-1)}
            aria-label="Previous cover photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-2 py-1 text-white hover:bg-black/60"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => advance(1)}
            aria-label="Next cover photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-2 py-1 text-white hover:bg-black/60"
          >
            ›
          </button>
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5"
            aria-hidden="true"
          >
            {safe.map((photo, i) => (
              <span
                key={photo.url}
                className={`h-1.5 w-4 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* SR-only live region announcing slide changes */}
      <div className="sr-only" aria-live="polite">
        {current.caption ?? `Cover photo ${index + 1} of ${safe.length}`}
      </div>
    </div>
  );
}
