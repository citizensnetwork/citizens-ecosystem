import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityForm } from "@/components/activities/ActivityForm";

interface NewActivityPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function NewActivityPage({
  params,
}: NewActivityPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", org.id)
    .order("name");

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title")
    .eq("org_id", org.id)
    .eq("status", "active")
    .order("title");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        New Activity
      </h1>
      <ActivityForm
        orgId={org.id}
        orgSlug={orgSlug}
        departments={departments ?? []}
        goals={goals ?? []}
      />
    </div>
  );
}
