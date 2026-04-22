// Server component — renders a compact strip of mutual follows between
// the viewer and the profile owner. Uses the
// `get_mutual_followers(p_user_a, p_user_b, p_limit)` RPC so we get
// the intersection in one round-trip and only public profile columns
// come back.

import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type MutualRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

export default async function MutualFriends({
  viewerId,
  profileId,
  max = 6,
  totalCount,
}: {
  viewerId: string;
  profileId: string;
  max?: number;
  /** Known total from parent (may exceed fetched rows). Used for the
   * overflow badge so the UI matches the header count. */
  totalCount?: number;
}) {
  if (!viewerId || viewerId === profileId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_mutual_followers", {
    p_user_a: viewerId,
    p_user_b: profileId,
    p_limit: max + 1,
  });

  if (error) {
    console.error("[MutualFriends] RPC failed", error);
    return null;
  }
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  const rows = data as MutualRow[];
  const shown = rows.slice(0, max);
  const extra =
    typeof totalCount === "number"
      ? Math.max(0, totalCount - shown.length)
      : rows.length - shown.length;

  return (
    <section
      aria-label="Mutual connections"
      className="mt-4 rounded-xl border border-black/8 bg-white/50 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-black">
          Mutual connections
        </h3>
      </div>
      <ul className="mt-3 flex flex-wrap gap-3">
        {shown.map((r) => (
          <li key={r.id}>
            <Link
              href={`/profile/${r.id}`}
              title={r.full_name ?? "Unnamed"}
              className="flex flex-col items-center gap-1 w-16 text-center"
            >
              {r.avatar_url ? (
                <Image
                  src={r.avatar_url}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover ring-1 ring-black/10"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-black/10" />
              )}
              <span className="block truncate w-full text-[11px] text-black/70">
                {r.full_name ?? "Unnamed"}
              </span>
            </Link>
          </li>
        ))}
        {extra > 0 && (
          <li className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-xs font-medium text-black/70">
            +{extra}
          </li>
        )}
      </ul>
    </section>
  );
}
