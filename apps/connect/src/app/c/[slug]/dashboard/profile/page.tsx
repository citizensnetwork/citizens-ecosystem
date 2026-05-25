// /c/[slug]/dashboard/profile/page.tsx — Manage contributor public profile

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProfileDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/profile`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  const [profileResult, followsResult, keywordsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", contributor.id)
      .maybeSingle(),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
          .eq("followee_id", contributor.id),
    supabase
      .from("contributor_keywords")
      .select("id, keyword")
      .eq("contributor_id", contributor.id)
      .order("keyword", { ascending: true }),
  ]);

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Profile summary */}
      <section className="surface-card rounded-2xl p-6 flex gap-4 items-start">
        <div className="w-16 h-16 rounded-full bg-[--surface-muted] overflow-hidden flex-shrink-0">
          {profileResult.data?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileResult.data.avatar_url!} alt={contributor.full_name ?? ""} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">👤</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">{contributor.full_name ?? slug}</h2>
          {contributor.bio && (
            <p className="text-sm text-[--foreground-soft] mt-1">{contributor.bio}</p>
          )}
          <div className="text-sm mt-2">
            <span className="font-medium">{followsResult.count ?? 0}</span>
            <span className="text-[--foreground-soft]"> followers</span>
          </div>
          <div className="flex gap-2 mt-3">
            <Link
              href={`/c/${slug}`}
              className="text-sm px-3 py-1.5 rounded-xl border border-[--border] hover:border-[--gold] transition-colors"
            >
              View public page
            </Link>
            <Link
              href="/profile"
              className="text-sm px-3 py-1.5 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
            >
              Edit profile
            </Link>
          </div>
        </div>
      </section>

      {/* Keywords */}
      <section>
        <h3 className="text-sm font-semibold mb-3">
          Keywords ({keywordsResult.data?.length ?? 0}/20)
        </h3>
        <p className="text-xs text-[--foreground-soft] mb-3">
          Keywords help citizens discover your organisation through search and AI-powered recommendations.
        </p>
        {keywordsResult.data && keywordsResult.data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keywordsResult.data.map((kw) => (
              <span
                key={kw.id}
                className="text-sm bg-[--surface-muted] px-3 py-1 rounded-full border border-[--border]"
              >
                {kw.keyword}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[--foreground-soft]">No keywords set.</p>
        )}
        <p className="text-xs text-[--foreground-soft] mt-3">
          Manage keywords via Settings → Keywords.
        </p>
      </section>
    </div>
  );
}
