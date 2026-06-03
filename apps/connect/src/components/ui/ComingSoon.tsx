import type { ReactNode } from "react";

/**
 * Placeholder surface for routes whose full Figma build lands in a later phase.
 * Keeps the new navigation honest — every destination resolves to a real,
 * on-brand page instead of a 404 — while signalling the work is in flight.
 */
export default function ComingSoon({
  title,
  subtitle,
  icon,
  phase,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  phase?: string;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 pb-32 text-center md:pb-8">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl gold-gradient text-white shadow-lg">
        {icon}
      </div>
      <h1 className="font-display text-2xl text-foreground">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      {phase && (
        <span className="mt-5 rounded-full bg-(--gold-soft) px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-(--gold-dark)">
          {phase}
        </span>
      )}
    </div>
  );
}
