import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { Event, Profile } from "@/types/db";
import { CATEGORY_LABELS } from "@/lib/categories";
import OrgBroadcastList from "@/components/contributor/OrgBroadcastList";
import type { OrgBroadcast } from "@/components/contributor/OrgBroadcastList";

export const dynamic = "force-dynamic";

type CreatorSlim = Pick<Profile, "full_name" | "avatar_url" | "instagram_handle" | "facebook_url" | "tiktok_handle">;

async function fetchEvent(id: string): Promise<(Event & { creator?: CreatorSlim | null }) | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, creator:profiles!events_created_by_fkey(full_name, avatar_url, instagram_handle, facebook_url, tiktok_handle)")
    .eq("id", id)
    .eq("status", "published")
    .single();
  return (data as (Event & { creator?: CreatorSlim | null }) | null) ?? null;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) return { title: "Event Not Found · Citizens Connect" };

  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const description =
    event.description.length > 160
      ? event.description.slice(0, 157) + "…"
      : event.description;

  const ogDescription = `${dateStr} · ${event.location}\n${description}`;
  const url = `${siteUrl()}/e/${event.id}`;

  return {
    title: `${event.title} · Citizens Connect`,
    description,
    ...(url && { alternates: { canonical: url } }),
    openGraph: {
      title: event.title,
      description: ogDescription,
      type: "article",
      ...(url && { url }),
      siteName: "Citizens Connect",
      ...(event.image_url && { images: [{ url: event.image_url }] }),
    },
    twitter: {
      card: event.image_url ? "summary_large_image" : "summary",
      title: event.title,
      description: ogDescription,
      ...(event.image_url && { images: [event.image_url] }),
    },
  };
}

function IconInstagram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37a4 4 0 1 1-7.914 1.173A4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
function IconFacebook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
function IconTikTok() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.6 6.3a5.7 5.7 0 0 1-3.4-1.3 5.7 5.7 0 0 1-1.8-2.8H11v12.1a2.5 2.5 0 1 1-2.5-2.5c.3 0 .6 0 .9.1V8.3a5.9 5.9 0 0 0-.9-.1 5.9 5.9 0 1 0 5.9 5.9V8.5a8.9 8.9 0 0 0 5.2 1.7V6.3z" />
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export default async function ShareableEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [event, broadcastsRes] = await Promise.all([
    fetchEvent(id),
    supabase
      .from("broadcast_messages")
      .select("id, body, created_at")
      .eq("entity_type", "event")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  if (!event) notFound();

  let broadcasts = (broadcastsRes.data ?? []) as OrgBroadcast[];

  // Attach aggregate, identity-free reaction counts for the broadcast cards.
  if (broadcasts.length > 0) {
    const { data: reactionRows } = await supabase
      .from("broadcast_reactions")
      .select("broadcast_id, emoji, count")
      .in(
        "broadcast_id",
        broadcasts.map((b) => b.id),
      );
    if (reactionRows && reactionRows.length > 0) {
      const byId = new Map<string, Record<string, number>>();
      for (const r of reactionRows as Array<{
        broadcast_id: string;
        emoji: string;
        count: number;
      }>) {
        const m = byId.get(r.broadcast_id) ?? {};
        m[r.emoji] = r.count;
        byId.set(r.broadcast_id, m);
      }
      broadcasts = broadcasts.map((b) => ({
        ...b,
        reactions: byId.get(b.id) ?? {},
      }));
    }
  }

  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = new Date(event.date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const shortDesc =
    event.description.length > 280
      ? event.description.slice(0, 277) + "…"
      : event.description;

  const categoryLabel = event.category ? CATEGORY_LABELS[event.category] : null;

  const instagramUrl = event.creator?.instagram_handle
    ? `https://instagram.com/${event.creator.instagram_handle.replace(/^@/, "")}`
    : null;
  const facebookUrl = event.creator?.facebook_url ?? null;
  const tiktokUrl = event.creator?.tiktok_handle
    ? `https://www.tiktok.com/@${event.creator.tiktok_handle.replace(/^@/, "")}`
    : null;

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {event.image_url ? (
          <div className="relative h-[48vh] min-h-[280px] w-full sm:h-[56vh]">
            <Image
              src={event.image_url}
              alt={event.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/75" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
              <p className="text-sm uppercase tracking-wider text-[color:var(--gold)]">
                {categoryLabel ?? "Event"}
              </p>
              <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-5xl">
                {event.title}
              </h1>
              <p className="mt-2 text-sm text-white/90 sm:text-base">
                {dateStr} · {timeStr} · {event.location}
              </p>
            </div>
          </div>
        ) : (
          <div className="border-b border-black/10 bg-black px-6 py-12 text-white sm:px-10 sm:py-16">
            <p className="text-sm uppercase tracking-wider text-[color:var(--gold)]">
              {categoryLabel ?? "Event"}
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-5xl">
              {event.title}
            </h1>
            <p className="mt-2 text-sm text-white/90 sm:text-base">
              {dateStr} · {timeStr} · {event.location}
            </p>
          </div>
        )}
      </section>

      {/* Body */}
      <section className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
        <p className="text-base leading-relaxed text-black/80 sm:text-lg">
          {shortDesc}
        </p>

        {/* Organiser + links */}
        {event.creator && (
          <div className="mt-8 flex items-center gap-3 border-t border-black/10 pt-6">
            {event.creator.avatar_url ? (
              <Image
                src={event.creator.avatar_url}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 rounded-full object-cover ring-1 ring-black/10"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--gold-soft)] text-sm font-semibold text-black">
                {event.creator.full_name?.charAt(0) ?? "·"}
              </div>
            )}
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wider text-black/50">Hosted by</p>
              <p className="text-sm font-semibold">{event.creator.full_name}</p>
            </div>
            <div className="flex items-center gap-2">
              {event.website_url && (
                <a
                  href={event.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  className="rounded-full border border-black/10 p-2 text-black/70 transition hover:bg-black hover:text-white"
                >
                  <IconGlobe />
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="rounded-full border border-black/10 p-2 text-black/70 transition hover:bg-black hover:text-white"
                >
                  <IconInstagram />
                </a>
              )}
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="rounded-full border border-black/10 p-2 text-black/70 transition hover:bg-black hover:text-white"
                >
                  <IconFacebook />
                </a>
              )}
              {tiktokUrl && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="rounded-full border border-black/10 p-2 text-black/70 transition hover:bg-black hover:text-white"
                >
                  <IconTikTok />
                </a>
              )}
            </div>
          </div>
        )}

        {/* From the Organiser — broadcast messages */}
        {broadcasts.length > 0 && (
          <div className="mt-8">
            <OrgBroadcastList broadcasts={broadcasts} showReactions />
          </div>
        )}

        {/* Primary CTA */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/events/${event.id}`}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[color:var(--gold)] px-6 py-3 text-center text-sm font-semibold text-black transition hover:brightness-95 active:scale-[0.98]"
          >
            View in Connect →
          </Link>
          <Link
            href="/events"
            className="inline-flex flex-1 items-center justify-center rounded-full border border-black/20 px-6 py-3 text-center text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            Explore more events
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-2xl border-t border-black/10 px-6 py-6 text-center text-xs text-black/50 sm:px-8">
        Shared from <Link href="/" className="font-semibold text-[color:var(--gold)]">Citizens Connect</Link> · Connecting the Kingdom
      </footer>
    </main>
  );
}
