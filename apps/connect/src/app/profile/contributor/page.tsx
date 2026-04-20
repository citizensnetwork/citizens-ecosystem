// /profile/contributor — self-edit page for the extra public
// Contributor profile fields.  Gated to approved Contributors.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContributorProfileEditor } from "@/components/contributor/ContributorProfileEditor";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EditContributorProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/profile/contributor");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/profile");
  if (
    profile.role !== "contributor" ||
    profile.contributor_status !== "approved"
  ) {
    redirect("/profile");
  }

  const publicHref = profile.contributor_slug
    ? `/c/${profile.contributor_slug}`
    : `/profile/${profile.id}`;

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <PageHeader
        title="Edit public profile"
        subtitle="Tune what visitors see on your Contributor page"
        fallbackHref="/profile"
        action={
          <Link
            href={publicHref}
            className="inline-flex items-center rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-black hover:border-(--gold)"
          >
            View public
          </Link>
        }
      />
      <ContributorProfileEditor profile={profile} />
    </div>
  );
}
