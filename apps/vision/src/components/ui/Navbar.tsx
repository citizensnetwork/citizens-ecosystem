"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrgStore } from "@/stores/orgStore";

export function Navbar() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string | undefined;
  const currentOrg = useOrgStore((s) => s.currentOrg);

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
