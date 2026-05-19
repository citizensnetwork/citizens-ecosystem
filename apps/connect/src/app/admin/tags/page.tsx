import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TagModerator from "@/components/admin/TagModerator";
import { PageHeader } from "@/components/ui/PageHeader";
import type { EventTag } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function AdminTagsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/events");
  }

  // Admin RLS bypasses the is_hidden filter, so we see the full set
  // and can toggle moderation from this page.
  const { data: tags } = await supabase
    .from("event_tags")
    .select("*")
    .order("usage_count", { ascending: false })
    .order("label", { ascending: true })
    .limit(500)
    .returns<EventTag[]>();

  return (
    <>
      <PageHeader title="Manage Tags" fallbackHref="/events" />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-3xl px-6 py-8 sm:px-8">
          <TagModerator initialTags={tags ?? []} />
        </div>
      </div>
    </>
  );
}
