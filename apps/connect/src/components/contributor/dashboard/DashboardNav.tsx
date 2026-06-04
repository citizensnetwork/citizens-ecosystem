"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  slug: string;
  contributorName: string;
  isAdmin?: boolean;
}

const TABS = [
  { label: "Home", segment: "" },
  { label: "Places", segment: "places" },
  { label: "Events", segment: "events" },
  { label: "Analytics", segment: "analytics" },
  { label: "Team", segment: "team" },
  { label: "Planning", segment: "planning" },
  { label: "Inbox", segment: "inbox" },
  { label: "Profile", segment: "profile" },
  { label: "Settings", segment: "settings" },
] as const;

export default function DashboardNav({ slug, contributorName, isAdmin }: Props) {
  const pathname = usePathname();
  const base = `/c/${slug}/dashboard`;

  function isActive(segment: string): boolean {
    if (segment === "") {
      return pathname === base || pathname === `${base}/`;
    }
    return pathname.startsWith(`${base}/${segment}`);
  }

  return (
    <nav className="sticky top-0 z-30 glass border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header row */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/c/${slug}`}
              className="text-xs text-muted-foreground hover:text-[#C9A84C] transition-colors"
            >
              ← {contributorName}
            </Link>
            <span className="text-border">/</span>
            <span
              className="text-sm font-semibold text-foreground"
              style={{ fontFamily: "var(--font-playfair, 'Playfair Display', serif)" }}
            >
              Dashboard
            </span>
            {isAdmin && (
              <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                Admin
              </span>
            )}
          </div>
        </div>

        {/* Tab row */}
        <div className="flex items-end gap-0 -mb-px overflow-x-auto no-scrollbar">
          {TABS.map(({ label, segment }) => {
            const href = segment === "" ? base : `${base}/${segment}`;
            const active = isActive(segment);
            return (
              <Link
                key={segment}
                href={href}
                className={[
                  "flex-shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-[#C9A84C] text-[#C9A84C]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
