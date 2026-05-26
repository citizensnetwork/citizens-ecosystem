// /c/[slug]/dashboard/layout.tsx
// Auth gate for the Contributor Dashboard.
// Allows: contributor owner OR admin with an approved, active access session.
// All dashboard sub-pages are children of this layout.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import DashboardNav from "@/components/contributor/dashboard/DashboardNav";
import ActiveGrantBanner, {
  type ActiveGrant,
} from "@/components/contributor/dashboard/ActiveGrantBanner";
import ContributorThemeOverride from "@/components/contributor/ContributorThemeOverride";
import { markViewingStarted } from "@/lib/dashboard/adminAttribution";
import { isContributorThemeEnabled } from "@/lib/dashboard/theme";

export const dynamic = "force-dynamic";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function DashboardLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/c/${slug}/dashboard`);
  }

  // Resolve the contributor by slug
  const contributor = await resolveContributorSlug(slug);
  if (!contributor) {
    redirect("/");
  }

  // Fetch viewer profile
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  const isOwner = user.id === contributor.id;
  const isAdmin = viewerProfile?.role === "admin";

  if (!isOwner && !isAdmin) {
    redirect(`/c/${slug}`);
  }

  // If admin: verify active approved session
  let adminSessionActive = false;
  let adminSessionExpiresAt: string | null = null;

  if (isAdmin && !isOwner) {
    const { data: accessRow } = await supabase
      .from("contributor_access_requests")
      .select("id, expires_at")
      .eq("contributor_id", contributor.id)
      .eq("admin_id", user.id)
      .eq("status", "approved")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{ id: string; expires_at: string }>();

    if (!accessRow) {
      // Admin has no active granted access — redirect to contributor public page
      redirect(`/c/${slug}`);
    }

    adminSessionActive = true;
    adminSessionExpiresAt = accessRow.expires_at;

    // Idempotently stamp viewing_started_at so the contributor's Realtime
    // banner can light up "viewing now". RPC is a no-op if already set.
    await markViewingStarted(supabase, accessRow.id);
  }

  // Owner: pre-load active grants so the Realtime banner can render
  // immediately on mount without an extra round-trip.
  let initialGrants: ActiveGrant[] = [];
  if (isOwner) {
    const { data: grants } = await supabase
      .from("contributor_access_requests")
      .select(
        "id, admin_id, viewing_started_at, expires_at, admin:profiles!contributor_access_requests_admin_id_fkey(full_name)",
      )
      .eq("contributor_id", contributor.id)
      .eq("status", "approved")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    initialGrants = (grants ?? []) as unknown as ActiveGrant[];
  }

  // Determine if contributor theme is enabled via environment variable
  const contributorThemeEnabled = isContributorThemeEnabled();

  return (
    <div
      data-contributor-ui={contributorThemeEnabled ? "" : undefined}
      className="min-h-screen bg-[--background]"
    >
      <ContributorThemeOverride />
      {/* Owner: Realtime banner shown when admins hold active grants */}
      {isOwner && (
        <ActiveGrantBanner
          contributorId={contributor.id}
          contributorSlug={slug}
          initialGrants={initialGrants}
        />
      )}

      {/* Admin access banner */}
      {isAdmin && !isOwner && adminSessionActive && (
        <div className="cd-admin-banner px-4 py-2 text-sm flex items-center justify-between">
          <span>
            <strong>Admin view</strong> — you have granted access to{" "}
            <strong>{contributor.full_name ?? slug}</strong>&apos;s dashboard.
          </span>
          <span className="text-xs opacity-70">
            Expires:{" "}
            {adminSessionExpiresAt
              ? new Date(adminSessionExpiresAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
        </div>
      )}

      <DashboardNav
        slug={slug}
        contributorName={contributor.full_name ?? slug}
        isAdmin={isAdmin && !isOwner}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
