import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import CommunityPageClient from "@/components/community/CommunityPageClient";

export const metadata: Metadata = {
  title: "Kingdom Projects · Citizens Connect",
  description: "Impact Ideas and community collaboration across the Kingdom.",
};

export type CommunityIdea = {
  id: string;
  title: string;
  body: string;
  status: "open" | "in_review" | "actioned";
  created_at: string;
  user: { full_name: string | null; avatar_url: string | null } | null;
};

export default async function CommunityPage() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("suggestions")
    .select(
      "id, title, body, status, created_at, user:profiles!suggestions_user_id_fkey(full_name, avatar_url)"
    )
    .filter("page_url", "ilike", "%/community")
    .in("status", ["open", "in_review", "actioned"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[CommunityPage] suggestions fetch:", error.message);
  }

  // Supabase returns FK joins as an array; pick the first element (many-to-one).
  type RawRow = {
    id: string;
    title: string;
    body: string;
    status: string;
    created_at: string;
    user: Array<{ full_name: string | null; avatar_url: string | null }>;
  };
  const ideas: CommunityIdea[] = ((data ?? []) as unknown as RawRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    status: r.status as CommunityIdea["status"],
    created_at: r.created_at,
    user: r.user?.[0] ?? null,
  }));

  return (
    <CommunityPageClient
      votingIdeas={ideas.filter((i) => i.status === "open")}
      inProcessIdeas={ideas.filter((i) => i.status === "in_review")}
      confirmedIdeas={ideas.filter((i) => i.status === "actioned")}
    />
  );
}
