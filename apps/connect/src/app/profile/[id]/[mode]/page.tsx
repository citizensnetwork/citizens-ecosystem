import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_LIMIT = 100;

type Mode = "followers" | "following";

type Row = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

async function loadProfiles(mode: Mode, id: string): Promise<{
  owner: { id: string; full_name: string | null } | null;
  rows: Row[];
}> {
  const supabase = await createClient();

  const { data: owner } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", id)
    .maybeSingle();

  if (!owner) return { owner: null, rows: [] };

  // followers = people who follow this profile (follow.followee_id = id)
  // following = people this profile follows    (follow.follower_id = id)
  const { data: links } = await supabase
    .from("follows")
    .select("follower_id, followee_id, created_at")
    .eq(mode === "followers" ? "followee_id" : "follower_id", id)
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);

  const ids = (links ?? [])
    .map((r) => (mode === "followers" ? r.follower_id : r.followee_id))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (ids.length === 0) return { owner, rows: [] };

  const { data: rows } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .in("id", ids);

  return { owner, rows: (rows ?? []) as Row[] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; mode: string }>;
}) {
  const { mode } = await params;
  if (mode !== "followers" && mode !== "following") {
    return { title: "Not Found" };
  }
  const label = mode === "following" ? "Following" : "Followers";
  return { title: `${label} — Citizens Connect` };
}

export default async function FollowListPage({
  params,
}: {
  params: Promise<{ id: string; mode: string }>;
}) {
  const { id, mode: rawMode } = await params;
  if (rawMode !== "followers" && rawMode !== "following") notFound();
  if (!UUID_RE.test(id)) notFound();
  const mode = rawMode as Mode;

  // Gate the social graph behind auth — we don't want anonymous
  // enumeration of the follower/following network even though the
  // underlying RLS allows it (Architect audit H3).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/profile/${id}/${mode}`);
  }

  const { owner, rows } = await loadProfiles(mode, id);
  if (!owner) notFound();

  const heading =
    mode === "followers" ? "Followers" : "Following";

  return (
    <>
      <PageHeader
        title={`${owner.full_name ?? "Profile"} · ${heading}`}
        fallbackHref={`/profile/${id}`}
      />
      <div className="mx-auto max-w-2xl px-4 py-6">
        {rows.length === 0 ? (
          <p className="text-sm text-black/60">
            {mode === "followers"
              ? "No followers yet."
              : "Not following anyone yet."}
          </p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-xl border border-black/8 bg-white">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/profile/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-black/2 focus:bg-black/3 focus:outline-none"
                >
                  {r.avatar_url ? (
                    <Image
                      src={r.avatar_url}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-black/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-black">
                      {r.full_name ?? "Unnamed"}
                    </p>
                    <p className="truncate text-xs text-black/50">
                      {r.role ?? "citizen"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
