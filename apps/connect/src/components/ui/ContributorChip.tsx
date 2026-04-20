// Small gold-outline chip rendered on events that were created by a
// Citizen (role=citizen) rather than an approved Contributor. Signals
// to viewers that this is a community-organised event.

export function ContributorChip({
  variant = "community",
  className = "",
}: {
  variant?: "community" | "approved";
  className?: string;
}) {
  const label =
    variant === "community" ? "Community-organised" : "Contributor";
  const title =
    variant === "community"
      ? "Organised by a Citizen from the community"
      : "Created by an approved Citizens Connect Contributor";

  // Both variants use the gold accent, but the community variant uses
  // an outline to read as "by a regular member" vs. a filled chip for
  // official Contributors.
  const styles =
    variant === "community"
      ? "border border-[color:var(--gold,#D4AF37)] text-black bg-white"
      : "border border-transparent bg-[color:var(--gold,#D4AF37)] text-black";

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${styles} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-3 w-3"
      >
        <path d="M12 2l2.39 4.84L20 7.77l-4 3.9.94 5.5L12 14.77l-4.94 2.4L8 11.67 4 7.77l5.61-.93L12 2z" />
      </svg>
      {label}
    </span>
  );
}
