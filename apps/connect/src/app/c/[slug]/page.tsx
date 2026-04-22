// /c/[slug] — canonical vanity URL for approved Contributors.
//
// Previously this redirected to /profile/[id], which broke the
// @panel drawer intercept on soft navigations (the server redirect
// fires before the interceptor can match). We now resolve the slug
// to a profile id server-side and render ProfileDetailServer
// in-place, matching the /profile/[id] page. The @panel intercept
// at @panel/(.)c/[slug] handles drawer presentation on soft nav.

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import ProfileDetailServer from "@/components/profile/ProfileDetailServer";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await resolveContributorSlug(slug);
  if (!profile) return { title: "Contributor not found" };
  const title = `${profile.full_name ?? slug} · Citizens Connect`;
  const description =
    profile.bio && profile.bio.length > 0
      ? profile.bio.slice(0, 155)
      : `${profile.full_name}'s public profile on Citizens Connect.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
    },
  };
}

export default async function ContributorSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await resolveContributorSlug(slug);
  if (!profile) notFound();

  // Self-view → route to the owner's editable profile page.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === profile.id) redirect("/profile");

  return (
    <>
      <PageHeader title={profile.full_name ?? "Contributor"} fallbackHref="/events" />
      <ProfileDetailServer id={profile.id} />
    </>
  );
}
