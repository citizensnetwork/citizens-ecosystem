import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MapPageClient } from "./MapPageClient";

interface MapPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function MapPage({ params, searchParams }: MapPageProps) {
  const { orgSlug } = await params;
  const filters = await searchParams;
  const supabase = await createClient();

  // Fetch org
  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    redirect("/");
  }

  // Fetch departments for filter dropdown
  const { data: departments } = await supabase
    .from("departments")
    .select("id, org_id, parent_department_id, name, description, created_at")
    .eq("org_id", org.id)
    .order("name");

  // Build query params string for the map API
  const queryParts = [`org_id=${org.id}`];
  if (filters.type) queryParts.push(`type=${encodeURIComponent(filters.type)}`);
  if (filters.department_id) queryParts.push(`department_id=${encodeURIComponent(filters.department_id)}`);
  if (filters.date_from) queryParts.push(`date_from=${encodeURIComponent(filters.date_from)}`);
  if (filters.date_to) queryParts.push(`date_to=${encodeURIComponent(filters.date_to)}`);
  if (filters.search) queryParts.push(`search=${encodeURIComponent(filters.search)}`);

  return (
    <div className="-m-6 h-[calc(100%+3rem)]">
      <MapPageClient
        orgId={org.id}
        orgSlug={orgSlug}
        departments={departments ?? []}
        apiQuery={queryParts.join("&")}
      />
    </div>
  );
}
