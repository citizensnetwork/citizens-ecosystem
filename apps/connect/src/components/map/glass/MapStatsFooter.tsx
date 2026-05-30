"use client";

import { Building2, Users, FolderKanban } from "lucide-react";

type Props = {
  organizations: number;
  members: number;
  projects: number;
};

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

const ITEMS: { key: keyof Props; label: string; Icon: typeof Users; dot?: boolean }[] = [
  { key: "organizations", label: "Organizations", Icon: Building2, dot: true },
  { key: "members", label: "Members", Icon: Users },
  { key: "projects", label: "Active Projects", Icon: FolderKanban },
];

/**
 * Bottom-centre glass stat pill from the Figma design. Counts are real:
 * organizations = approved contributors, members = community profiles,
 * projects = live events/places on the map.
 */
export default function MapStatsFooter(props: Props) {
  return (
    <div className="cc-glass cc-glass-enter pointer-events-auto flex items-center gap-1 rounded-full px-2 py-2 sm:gap-2 sm:px-3">
      {ITEMS.map(({ key, label, Icon, dot }, i) => (
        <div key={key} className="flex items-center">
          {i > 0 && <span className="mx-1 h-7 w-px bg-black/10 sm:mx-2" aria-hidden="true" />}
          <div className="flex items-center gap-2 px-1.5 sm:px-2">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-(--gold)/12 text-(--gold)">
              <Icon className="h-3.5 w-3.5" />
              {dot && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-(--gold) ring-2 ring-white" />
              )}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-black">{formatCount(props[key])}</p>
              <p className="text-[10px] text-black/50">{label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
