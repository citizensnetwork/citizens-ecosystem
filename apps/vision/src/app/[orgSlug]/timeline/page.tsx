import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TimelineView } from "@/components/timeline";

interface TimelinePageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    redirect("/");
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="text-2xl font-semibold text-text-primary">
        {org.name} — Timeline
      </h1>
      <div className="flex-1 min-h-0">
        <TimelineView orgId={org.id} orgSlug={orgSlug} />
      </div>
    </div>
  );
}
