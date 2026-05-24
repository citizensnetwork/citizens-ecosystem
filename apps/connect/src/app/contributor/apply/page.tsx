// /contributor/apply — lets a signed-in Citizen submit a contributor
// application. Gates: must be signed in; must NOT already be an
// approved contributor or admin; must NOT already have a pending app.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContributorApplicationForm } from "@/components/contributor/ContributorApplicationForm";
import { isContributor, isAdmin as profileIsAdmin, isPendingContributor } from "@/lib/profiles/capabilities";

export const dynamic = "force-dynamic";

export default async function ContributorApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/contributor/apply");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, contributor_status, full_name, contributor_kind")
    .eq("id", user.id)
    .single();

  // Already a contributor or admin — nothing to apply for.
  if (isContributor(profile) || profileIsAdmin(profile)) {
    redirect("/profile");
  }

  // Already has a pending application — send them to their profile
  // where the banner + status are shown.
  if (isPendingContributor(profile)) {
    redirect("/profile?application=submitted");
  }

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <PageHeader
        title="Apply to be a Contributor"
        subtitle="Join the Citizens who run events and places on the map"
        fallbackHref="/profile"
      />
      <ContributorApplicationForm
        defaultDisplayName={profile?.full_name ?? ""}
        defaultKind={
          profile?.contributor_kind as
            | "ministry"
            | "organization"
            | "business"
            | null
            | undefined
        }
      />
    </div>
  );
}
