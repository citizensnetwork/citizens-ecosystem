import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { isValidUUID } from "@/lib/validation";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ICONS } from "@/lib/constants";
import Link from "next/link";
import { ActivityForm } from "@/components/activities/ActivityForm";

interface ActivityDetailProps {
  params: Promise<{ orgSlug: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ActivityDetailPage({
  params,
  searchParams,
}: ActivityDetailProps) {
  const { orgSlug, id } = await params;
  const query = await searchParams;
  const editing = query.edit === "true";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  if (!isValidUUID(id)) notFound();

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();
  if (!org) redirect("/");

  const { data: activity } = await supabase
    .from("activities")
    .select("*, activity_tags(tag), departments(name)")
    .eq("id", id)
    .single();

  if (!activity) notFound();

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", org.id)
    .order("name");

  if (editing) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold text-text-primary">
          Edit Activity
        </h1>
        <ActivityForm
          orgId={org.id}
          orgSlug={orgSlug}
          departments={departments ?? []}
          initialData={activity}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {ACTIVITY_TYPE_ICONS[activity.type] ?? "📋"}
            </span>
            <h1 className="text-2xl font-semibold text-text-primary">
              {activity.title}
            </h1>
          </div>
          <span className="mt-1 inline-block rounded-full bg-accent-light px-2.5 py-0.5 text-xs text-accent">
            {ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${orgSlug}/activities/${id}?edit=true`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-alt"
          >
            Edit
          </Link>
          <Link
            href={`/${orgSlug}/activities`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-alt"
          >
            Back
          </Link>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
        {activity.description && (
          <div>
            <h2 className="text-sm font-medium text-text-secondary">
              Description
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-text-primary">
              {activity.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-medium uppercase text-text-secondary">
              Date
            </h3>
            <p className="mt-0.5 text-sm text-text-primary">{activity.date}</p>
          </div>

          {activity.start_time && (
            <div>
              <h3 className="text-xs font-medium uppercase text-text-secondary">
                Start
              </h3>
              <p className="mt-0.5 text-sm text-text-primary">
                {new Date(activity.start_time).toLocaleTimeString()}
              </p>
            </div>
          )}

          {activity.end_time && (
            <div>
              <h3 className="text-xs font-medium uppercase text-text-secondary">
                End
              </h3>
              <p className="mt-0.5 text-sm text-text-primary">
                {new Date(activity.end_time).toLocaleTimeString()}
              </p>
            </div>
          )}

          {activity.location_name && (
            <div>
              <h3 className="text-xs font-medium uppercase text-text-secondary">
                Location
              </h3>
              <p className="mt-0.5 text-sm text-text-primary">
                {activity.location_name}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-medium uppercase text-text-secondary">
              Participants
            </h3>
            <p className="mt-0.5 text-sm text-text-primary">
              {activity.participant_count}
            </p>
          </div>

          {activity.departments && (
            <div>
              <h3 className="text-xs font-medium uppercase text-text-secondary">
                Department
              </h3>
              <p className="mt-0.5 text-sm text-accent">
                {(activity.departments as { name: string }).name}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-medium uppercase text-text-secondary">
              Source
            </h3>
            <p className="mt-0.5 text-sm text-text-primary">
              {activity.source_type}
            </p>
          </div>
        </div>

        {/* Tags */}
        {activity.activity_tags && activity.activity_tags.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase text-text-secondary">
              Tags
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {activity.activity_tags.map(
                (t: { tag: string }) => (
                  <span
                    key={t.tag}
                    className="rounded-full bg-accent-light px-2.5 py-0.5 text-xs text-accent"
                  >
                    {t.tag}
                  </span>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <p className="text-xs text-text-secondary">
        Created {new Date(activity.created_at).toLocaleString()} · Last updated{" "}
        {new Date(activity.updated_at).toLocaleString()}
      </p>
    </div>
  );
}
