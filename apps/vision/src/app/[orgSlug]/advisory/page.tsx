import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdvisoryFeed } from "@/components/advisory/AdvisoryFeed";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { ITEMS_PER_PAGE, ADVISORY_SEVERITIES, ADVISORY_SEVERITY_LABELS } from "@/lib/constants";
import Link from "next/link";

interface AdvisoryPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdvisoryPage({
  params,
  searchParams,
}: AdvisoryPageProps) {
  const { orgSlug } = await params;
  const filters = await searchParams;
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

  const page = Math.max(1, parseInt(filters.page ?? "1", 10));
  const from = (page - 1) * ITEMS_PER_PAGE;

  // Fetch advisories
  let query = supabase
    .from("advisory_outputs")
    .select("*", { count: "exact" })
    .eq("org_id", org.id)
    .eq("dismissed", false)
    .order("created_at", { ascending: false });

  if (filters.severity) {
    query = query.eq("severity", filters.severity);
  }

  if (filters.type) {
    query = query.eq(
      "template_id",
      // Type filter works via template lookup — join done in advisory_templates
      filters.type
    );
  }

  if (filters.date_from) {
    query = query.gte("created_at", filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte("created_at", `${filters.date_to}T23:59:59`);
  }

  query = query.range(from, from + ITEMS_PER_PAGE - 1);

  const { data: advisories, count } = await query;

  // Severity summary
  const [infoResult, warningResult, criticalResult] = await Promise.all([
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("dismissed", false)
      .eq("severity", "info"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("dismissed", false)
      .eq("severity", "warning"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("dismissed", false)
      .eq("severity", "critical"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Advisories</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="severity-filter" className="text-xs text-text-secondary">Severity</label>
          <div className="flex gap-1">
            <Link
              href={`/${orgSlug}/advisory`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !filters.severity
                  ? "bg-accent text-highlight"
                  : "bg-surface-alt text-text-secondary hover:text-text-primary"
              }`}
            >
              All
            </Link>
            {ADVISORY_SEVERITIES.map((s) => (
              <Link
                key={s}
                href={`/${orgSlug}/advisory?severity=${s}${filters.type ? `&type=${filters.type}` : ""}${filters.date_from ? `&date_from=${filters.date_from}` : ""}${filters.date_to ? `&date_to=${filters.date_to}` : ""}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filters.severity === s
                    ? "bg-accent text-highlight"
                    : "bg-surface-alt text-text-secondary hover:text-text-primary"
                }`}
              >
                {ADVISORY_SEVERITY_LABELS[s]}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="type-filter" className="text-xs text-text-secondary">Type</label>
          <div className="flex gap-1">
            <Link
              href={`/${orgSlug}/advisory${filters.severity ? `?severity=${filters.severity}` : ""}${filters.date_from ? `${filters.severity ? "&" : "?"}date_from=${filters.date_from}` : ""}${filters.date_to ? `${filters.severity || filters.date_from ? "&" : "?"}date_to=${filters.date_to}` : ""}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !filters.type
                  ? "bg-accent text-highlight"
                  : "bg-surface-alt text-text-secondary hover:text-text-primary"
              }`}
            >
              All
            </Link>
          </div>
        </div>
      </div>

      <Suspense fallback={<LoadingSkeleton className="h-48 w-full" />}>
        <AdvisoryFeed
          initialAdvisories={advisories ?? []}
          orgId={org.id}
          orgSlug={orgSlug}
          total={count ?? 0}
          page={page}
          perPage={ITEMS_PER_PAGE}
          summary={{
            info: infoResult.count ?? 0,
            warning: warningResult.count ?? 0,
            critical: criticalResult.count ?? 0,
          }}
        />
      </Suspense>
    </div>
  );
}
