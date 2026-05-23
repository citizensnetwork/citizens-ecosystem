import EventDetailServer, { getEventById } from "@/components/events/EventDetailServer";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Reuse the same cached fetch as `EventDetailServer` so when Next.js
  // renders metadata + body in one request we hit Supabase once. The
  // cache is per-request, so unrelated requests stay independent.
  const event = await getEventById(id);

  if (!event) return { title: "Event Not Found" };

  const description =
    event.description.length > 150
      ? event.description.slice(0, 147) + "..."
      : event.description;

  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description: `${dateStr} · ${event.location}\n${description}`,
      type: "article",
      ...(event.image_url && { images: [{ url: event.image_url }] }),
    },
    twitter: {
      card: event.image_url ? "summary_large_image" : "summary",
      title: event.title,
      description,
      ...(event.image_url && { images: [event.image_url] }),
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The page body is rendered by EventDetailServer (shared with the
  // side-drawer intercept) — we only need PageHeader chrome here.
  return (
    <>
      <PageHeader title="Event" fallbackHref="/events" />
      <EventDetailServer id={id} />
    </>
  );
}

