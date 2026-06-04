// /c/[slug] — canonical vanity URL for approved Contributors.
//
// Resolves the slug to a profile id server-side and renders
// ProfileDetailServer in-place as a full page (Figma model — no drawer),
// matching the /profile/[id] page.

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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

  // Full-page detail (Figma model) — the profile renders its own hero with an
  // in-hero back arrow, so no separate page-header chrome is needed.
  return <ProfileDetailServer id={profile.id} />;
}
