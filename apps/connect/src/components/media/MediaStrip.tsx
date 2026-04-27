"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { EntityMedia } from "@/types/db";

type GalleryMedia = Pick<EntityMedia, "id" | "url" | "kind" | "thumbnail_url" | "title">;

type Props<TMedia extends GalleryMedia> = {
  media: TMedia[];
  ariaLabel?: string;
  plainImages?: boolean;
};

export default function MediaStrip<TMedia extends GalleryMedia>({
  media,
  ariaLabel = "Media gallery",
  plainImages = false,
}: Props<TMedia>) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const total = media.length;

  const open = useCallback((i: number) => setActiveIndex(i), []);
  const close = useCallback(() => setActiveIndex(null), []);
  const prev = useCallback(
    () => setActiveIndex((i) => (i == null ? null : (i - 1 + total) % total)),
    [total],
  );
  const next = useCallback(
    () => setActiveIndex((i) => (i == null ? null : (i + 1) % total)),
    [total],
  );

  useEffect(() => {
    if (activeIndex == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, close, prev, next]);

  function scrollBy(delta: number) {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (total === 0) return null;

  const active = activeIndex != null ? media[activeIndex] : null;

  return (
    <>
      <div
        className="relative mt-3 rounded-xl border border-white/40 px-2 py-2"
        style={{ background: "rgba(255,255,255,0.60)" }}
        aria-label={ariaLabel}
      >
        {total > 3 && (
          <button
            type="button"
            aria-label="Scroll gallery left"
            onClick={() => scrollBy(-240)}
            className="absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1.5 text-black shadow-sm transition hover:bg-white sm:flex"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}

        <div
          ref={scrollerRef}
          className="flex gap-2 overflow-x-auto scroll-smooth px-1"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {media.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(i)}
              aria-label={item.title ? `Open ${item.title}` : `Open gallery item ${i + 1}`}
              className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-black/5 shadow-sm transition hover:ring-2 hover:ring-(--gold) focus:outline-none focus:ring-2 focus:ring-(--gold)"
              style={{ scrollSnapAlign: "start" }}
            >
              {item.kind === "image" ? (
                plainImages ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.title ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Image
                    src={item.url}
                    alt={item.title ?? ""}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                )
              ) : (
                <>
                  {item.thumbnail_url ? (
                    plainImages ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnail_url}
                        alt={item.title ?? ""}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Image
                        src={item.thumbnail_url}
                        alt={item.title ?? ""}
                        fill
                        sizes="112px"
                        className="object-cover"
                      />
                    )
                  ) : (
                    <div className="absolute inset-0 bg-black/70" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {total > 3 && (
          <button
            type="button"
            aria-label="Scroll gallery right"
            onClick={() => scrollBy(240)}
            className="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1.5 text-black shadow-sm transition hover:bg-white sm:flex"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        )}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-3000 flex items-center justify-center bg-black/85 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Gallery viewer"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close gallery"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition hover:bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label="Previous"
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition hover:bg-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label="Next"
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition hover:bg-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </>
          )}

          <div
            className="relative max-h-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {active.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.url}
                alt={active.title ?? ""}
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <video
                src={active.url}
                poster={active.thumbnail_url ?? undefined}
                controls
                autoPlay
                playsInline
                className="max-h-[85vh] max-w-full rounded-lg bg-black"
              />
            )}
            {active.title && (
              <p className="mt-2 text-center text-sm text-white/85">{active.title}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}