// /admin/contributors/[id] — per-application detail view. Also the
// landing page for email deep-links (?action=approve|reject&sig=&exp=).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ContributorReviewCard,
  type PendingApplication,
} from "@/components/admin/ContributorReviewCard";
import { DeepLinkRunner } from "@/components/admin/DeepLinkRunner";

export const dynamic = "force-dynamic";

type SearchParams = {
  action?: "approve" | "reject";
  sig?: string;
  exp?: string;
};

export default async function AdminContributorReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If the admin isn't signed in and this is a deep-link, bounce
  // them through login first so they land back here with a session.
  if (!user) {
    const params = new URLSearchParams();
    params.set("redirect", `/admin/contributors/${id}`);
    if (sp.action) params.set("action", sp.action);
    if (sp.sig) params.set("sig", sp.sig);
    if (sp.exp) params.set("exp", sp.exp);
    redirect(`/login?${params.toString()}`);
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/events");

  const { data: row } = await supabase
    .from("contributor_applications")
    .select(
      "id, user_id, status, display_name, contributor_kind, bio, website_url, instagram_handle, facebook_url, tiktok_handle, youtube_url, physical_address, logo_url, motivation_text, submitted_at, rejection_reason, reviewed_at, profiles:contributor_applications_user_id_fkey(email, full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return (
      <div className="min-h-screen bg-[#faf9f6]">
        <PageHeader
          title="Application not found"
          fallbackHref="/admin/applications"
        />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <p className="rounded-xl border border-black/10 bg-white p-6 text-sm text-black/70">
            This application no longer exists. It may have been withdrawn.
          </p>
        </main>
      </div>
    );
  }

  const profile = row.profiles as
    | { email?: string; full_name?: string }
    | { email?: string; full_name?: string }[]
    | null;
  const profObj = Array.isArray(profile) ? profile[0] : profile;

  const app: PendingApplication = {
    id: row.id as string,
    user_id: row.user_id as string,
    display_name: row.display_name as string,
    contributor_kind: (row.contributor_kind as string) ?? null,
    bio: (row.bio as string) ?? null,
    website_url: (row.website_url as string) ?? null,
    instagram_handle: (row.instagram_handle as string) ?? null,
    facebook_url: (row.facebook_url as string) ?? null,
    tiktok_handle: (row.tiktok_handle as string) ?? null,
    youtube_url: (row.youtube_url as string) ?? null,
    physical_address: (row.physical_address as string) ?? null,
    logo_url: (row.logo_url as string) ?? null,
    motivation_text: (row.motivation_text as string) ?? null,
    submitted_at: row.submitted_at as string,
    applicant_email: profObj?.email ?? null,
    applicant_name: profObj?.full_name ?? null,
  };

  const isDeepLink =
    Boolean(sp.sig && sp.exp && sp.action) && row.status === "pending";

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <PageHeader
        title={app.display_name}
        subtitle={`Contributor application · ${row.status}`}
        fallbackHref="/admin/applications"
      />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {isDeepLink && sp.action && sp.sig && sp.exp ? (
          <DeepLinkRunner
            applicationId={row.id as string}
            action={sp.action}
            sig={sp.sig}
            exp={sp.exp}
          />
        ) : null}

        {row.status === "pending" ? (
          <ContributorReviewCard app={app} />
        ) : (
          <article className="space-y-3 rounded-xl border border-black/10 bg-white p-5">
            <h2 className="text-base font-semibold">
              Already {row.status as string}
            </h2>
            {row.rejection_reason ? (
              <p className="text-sm text-black/70">
                Reason: {row.rejection_reason as string}
              </p>
            ) : null}
            {row.reviewed_at ? (
              <p className="text-xs text-black/50">
                Reviewed{" "}
                {new Date(row.reviewed_at as string).toLocaleString()}
              </p>
            ) : null}
          </article>
        )}
      </main>
    </div>
  );
}
