"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrgStore } from "@/stores/orgStore";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function Navbar() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string | undefined;
  const currentOrg = useOrgStore((s) => s.currentOrg);
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    if (!currentOrg) return;
    const supabase = createClient();
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", currentOrg.id)
      .eq("dismissed", false)
      .eq("severity", "critical")
      .then(({ count }: { count: number | null }) => setCriticalCount(count ?? 0));
  }, [currentOrg]);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-surface px-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-lg font-bold text-text-primary">Citizens Vision</span>
      </Link>

      {orgSlug && currentOrg && (
        <div className="ml-4 flex items-center gap-1 text-sm text-text-secondary">
          <span>/</span>
          <span className="font-medium text-text-primary">{currentOrg.name}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {orgSlug && (
          <Link
            href={`/${orgSlug}/advisory`}
            className="relative rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary"
            aria-label="Advisories"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {criticalCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {criticalCount}
              </span>
            )}
          </Link>
        )}
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            Sign Out
          </button>
        </form>
      </div>
    </header>
  );
}
