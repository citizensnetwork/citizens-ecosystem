"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface SuggestionButtonProps {
  /** Visual variant: 'floating' shows a floating pill, 'inline' shows a bordered button */
  variant?: "floating" | "inline";
}

export default function SuggestionButton({ variant = "floating" }: SuggestionButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const pathname = usePathname();

  // The floating pill sits bottom-left, where it collides with the map's
  // glass stats footer + "For me in this area" control on the /events map
  // (especially on phones). Hide the floating variant there; inline variants
  // and other pages are unaffected.
  const hideFloatingHere =
    variant === "floating" && !!pathname && pathname.startsWith("/events");

  // Read the path post-mount so SSR/CSR markup stays identical, and refresh
  // every time the dialog opens (covers SPA navigations between submissions).
  useEffect(() => {
    if (!open) return;
    setCurrentPath(`${window.location.pathname}${window.location.search}`);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || submitting) return;
    if (title.trim().length < 3) {
      setError("Title must be at least 3 characters.");
      return;
    }
    if (body.trim().length < 10) {
      setError("Description must be at least 10 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          page_url: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit. Please try again.");
      } else {
        setSubmitted(true);
        setTimeout(() => {
          setOpen(false);
          setSubmitted(false);
          setTitle("");
          setBody("");
        }, 2000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  // After all hooks have run (Rules of Hooks), bail out on the map surface.
  if (hideFloatingHere) return null;

  const trigger =
    variant === "floating" ? (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 bg-white/80 dark:bg-black/60 backdrop-blur-sm border border-[--border] text-[--foreground] text-xs font-medium px-3 py-2 rounded-full shadow-md hover:shadow-lg hover:border-[--gold] transition-all"
        aria-label="Submit a suggestion"
      >
        💡 Suggestions?
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-[--foreground-soft] hover:text-[--foreground] underline underline-offset-2 transition-colors"
      >
        Leave a suggestion
      </button>
    );

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
          onKeyDown={(e) => e.key === "Escape" && handleClose()}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-dialog-title"
            className="w-full max-w-md bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md rounded-2xl shadow-2xl ring-1 ring-[--gold]/30 border border-[--border] p-6 space-y-4 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between">
              <h2 id="suggestion-dialog-title" className="text-base font-semibold">Share a suggestion</h2>
              <button
                onClick={handleClose}
                className="text-[--foreground-soft] hover:text-[--foreground] text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {submitted ? (
              <p className="text-sm text-green-600 py-4 text-center">
                ✓ Thanks for your suggestion! We&apos;ll review it soon.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[--foreground-soft] mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short summary of your idea…"
                    maxLength={120}
                    required
                    className="w-full text-sm border border-[--border] rounded-xl px-4 py-2 bg-transparent focus:outline-none focus:border-[--gold]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[--foreground-soft] mb-1">
                    Details <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Describe the suggestion or problem in more detail…"
                    rows={4}
                    maxLength={2000}
                    required
                    className="w-full text-sm border border-[--border] rounded-xl px-4 py-2 bg-transparent focus:outline-none focus:border-[--gold] resize-none"
                  />
                  <div className="text-right text-xs text-[--foreground-soft] mt-0.5">
                    {body.length}/2000
                  </div>
                </div>
                {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
                {currentPath && (
                  <p className="text-[10px] text-[--foreground-soft] italic">
                    Submitted from <span className="font-mono">{currentPath}</span>
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-[--gold] text-black font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {submitting ? "Submitting…" : "Submit suggestion"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
