import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContributorSetupForm from "@/components/contributor/ContributorSetupForm";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome, Contributor · Citizens Connect" };

export default async function ContributorSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/contributor/setup");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, bio_setup_required, full_name, notification_email, website_url, bio, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "contributor") redirect("/events");
  if (!profile.bio_setup_required) redirect("/events");

  return (
    <>
      <PageHeader title="Welcome, Contributor" fallbackHref="/events" />
      <div className="mx-auto max-w-lg px-4 py-8">
        <p className="mb-5 text-sm text-black/70">
          You&rsquo;ve been promoted to Contributor. Share a name and contact
          details so Citizens can recognise you. You can refine your full
          public profile later from your dashboard.
        </p>
        <ContributorSetupForm
          defaults={{
            full_name: profile.full_name ?? "",
            contact_email: profile.notification_email ?? profile.email ?? "",
            website_url: profile.website_url ?? "",
            bio: profile.bio ?? "",
          }}
        />
      </div>
    </>
  );
}
