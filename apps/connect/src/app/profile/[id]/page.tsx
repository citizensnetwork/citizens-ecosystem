import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import ProfileDetailServer from "@/components/profile/ProfileDetailServer";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", id)
    .single();

  if (!profile) return { title: "Profile Not Found" };

  return {
    title: `${profile.full_name} - Citizens Connect`,
    description: `${profile.full_name}'s profile on Citizens Connect.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Only the standalone page redirects to /profile for self-view;
  // the intercepted drawer renders the public profile as-is.
  if (user?.id === id) redirect("/profile");

  // Body (and title) come from the shared ProfileDetailServer — we
  // only need the PageHeader chrome on the full-page route.
  return (
    <>
      <PageHeader title="Profile" fallbackHref="/events" />
      <ProfileDetailServer id={id} />
    </>
  );
}
