"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close on escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  if (!orgSlug) return null;

  const basePath = `/${orgSlug}`;

  const navContent = (
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
              onClick={() => setMobileOpen(false)}
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
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg md:hidden"
        aria-label="Open navigation menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <nav className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-surface py-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-4">
              <span className="text-sm font-semibold text-text-primary">Navigation</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                aria-label="Close navigation menu"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {navContent}
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <nav className="hidden h-full w-56 flex-col border-r border-border bg-surface py-4 md:flex" aria-label="Main navigation">
        {navContent}
      </nav>
    </>
  );
}
