"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Overview", href: "", icon: "◆" },
  { label: "Activities", href: "/activities", icon: "▸" },
  { label: "Dashboard", href: "/dashboard", icon: "▦" },
  { label: "Map", href: "/map", icon: "◎" },
  { label: "Timeline", href: "/timeline", icon: "━" },
  { label: "Projects", href: "/projects", icon: "▪" },
  { label: "Goals", href: "/goals", icon: "◇" },
  { label: "Advisory", href: "/advisory", icon: "⚑" },
  { label: "Boundaries", href: "/boundaries", icon: "◻" },
  { label: "Connect", href: "/connect", icon: "⇄" },
  { label: "Settings", href: "/settings", icon: "⚙" },
];

export function Sidebar() {
  const params = useParams();
  const pathname = usePathname();
  const orgSlug = params?.orgSlug as string | undefined;

  if (!orgSlug) return null;

  const basePath = `/${orgSlug}`;

  return (
    <nav className="flex h-full w-56 flex-col border-r border-border bg-surface py-4">
      <ul className="space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const href = `${basePath}${item.href}`;
          const isActive =
            item.href === ""
              ? pathname === basePath
              : pathname?.startsWith(href);

          return (
            <li key={item.href}>
              <Link
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent font-medium text-highlight"
                    : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                }`}
              >
                <span className="w-4 text-center text-xs">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
