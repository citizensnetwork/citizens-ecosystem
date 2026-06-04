"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * In-hero back arrow — the Figma detail-page back affordance
 * (`navigate(-1)`), used now that detail views open as full pages instead
 * of a side drawer. Defaults to Figma's translucent black glass circle for
 * placement over a dark hero scrim; pass `className` for a light variant.
 *
 * Falls back to the events map when there is no history to go back to
 * (e.g. a cold deep-link), so the button is never a dead end.
 */
export default function BackButton({
  className,
  fallbackHref = "/events",
  label = "Go back",
}: {
  className?: string;
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
      }
    >
      <ArrowLeft size={18} />
    </button>
  );
}
