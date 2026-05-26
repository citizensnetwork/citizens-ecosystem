// src/components/contributor/dashboard/ActiveGrantBanner.tsx
//
// Stage A — Realtime indicator shown to the contributor when one or more
// admins currently hold an active access grant. Subscribes to
// `contributor_access_requests` so the pill appears/disappears live as
// requests are approved, revoked, or expire.
//
// Mounted only on the contributor's OWN dashboard view (isOwner === true).

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ActiveGrant {
  id: string;
  admin_id: string;
  viewing_started_at: string | null;
  expires_at: string | null;
  admin: { full_name: string | null } | null;
}

interface Props {
  contributorId: string;
  contributorSlug: string;
  initialGrants: ActiveGrant[];
}

export default function ActiveGrantBanner({ contributorId, contributorSlug, initialGrants }: Props) {
  const [grants, setGrants] = useState<ActiveGrant[]>(initialGrants);

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const { data } = await supabase
        .from("contributor_access_requests")
        .select(
          "id, admin_id, viewing_started_at, expires_at, admin:profiles!contributor_access_requests_admin_id_fkey(full_name)",
        )
        .eq("contributor_id", contributorId)
        .eq("status", "approved")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString());
      setGrants((data ?? []) as unknown as ActiveGrant[]);
    }

    const channel = supabase
      .channel(`cd-grants-${contributorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contributor_access_requests",
          filter: `contributor_id=eq.${contributorId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe();

    // Stage A nice-to-have: auto-clear banner on TTL expiry. Realtime
    // postgres_changes does not fire when a row "expires" by timestamp, so
    // poll every 60s as a safety net.
    const tick = setInterval(() => {
      void refetch();
    }, 60_000);

    return () => {
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [contributorId]);

  const viewingNow = useMemo(
    () => grants.filter((g) => g.viewing_started_at !== null),
    [grants],
  );

  if (grants.length === 0) return null;

  const adminLabel =
    viewingNow.length === 1
      ? (viewingNow[0].admin?.full_name ?? "An admin")
      : `${viewingNow.length} admins`;

  return (
    <div
      className="cd-admin-banner px-4 py-2 text-sm flex items-center justify-between"
      role="status"
      aria-live="polite"
      data-testid="active-grant-banner"
    >
      <span>
        {viewingNow.length > 0 ? (
          <>
            <strong>{adminLabel}</strong> {viewingNow.length === 1 ? "is" : "are"} viewing
            your dashboard.
          </>
        ) : (
          <>
            <strong>{grants.length}</strong> admin{grants.length > 1 ? "s have" : " has"}{" "}
            active access.
          </>
        )}
      </span>
      <a
        href={`/c/${contributorSlug}/dashboard/settings`}
        className="text-xs underline opacity-80 hover:opacity-100"
      >
        Manage
      </a>
    </div>
  );
}
