// Small gold crown badge rendered next to an approved Contributor's
// name wherever they appear (event cards, event detail, profile pages,
// contributor public pages). Signals "verified Citizens Connect
// Contributor" at a glance.
//
// Render conditionally — caller is responsible for deciding whether
// the subject qualifies.  Use `isVerifiedContributor` (re-exported here
// for backward compatibility) or `isApprovedContributor` from
// `@/lib/profiles/capabilities` as the predicate.

import type { UserRole } from "@/types/db";
import { isApprovedContributor } from "@/lib/profiles/capabilities";

type Size = "sm" | "md";

const SIZE_MAP: Record<Size, { box: string; svg: string }> = {
  sm: { box: "h-4 w-4", svg: "h-3 w-3" },
  md: { box: "h-5 w-5", svg: "h-3.5 w-3.5" },
};

export function VerifiedBadge({
  size = "sm",
  className = "",
  title = "Verified Contributor",
}: {
  size?: Size;
  className?: string;
  title?: string;
}) {
  const { box, svg } = SIZE_MAP[size];
  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[color:var(--gold,#C9A84C)] text-black ${box} ${className}`}
    >
      {/* Crown icon */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={svg}
      >
        <path d="M5 19h14v2H5v-2Zm0-2l-2-10 5 3 4-6 4 6 5-3-2 10H5Z" />
      </svg>
    </span>
  );
}

/**
 * Convenience predicate — delegates to `isApprovedContributor` from
 * `@/lib/profiles/capabilities`.  Kept here for backward compatibility
 * with existing import sites.
 */
export function isVerifiedContributor(
  profile: {
    role?: UserRole | string | null;
    contributor_status?: string | null;
  } | null | undefined,
): boolean {
  return isApprovedContributor(profile);
}
