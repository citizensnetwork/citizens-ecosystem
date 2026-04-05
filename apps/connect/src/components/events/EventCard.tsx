import Link from "next/link";
import Image from "next/image";
import type { Event, EventCategory } from "@/types/db";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  "church-service": "⛪ Church Service",
  youth: "🌟 Youth",
  "community-outreach": "🤝 Outreach",
  worship: "🎵 Worship",
  "bible-study": "📖 Bible Study",
  prayer: "🙏 Prayer",
  social: "🎉 Social",
  other: "📌 Other",
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  "church-service": "bg-[var(--gold-soft)] text-black",
  youth: "bg-[var(--gold-soft)] text-black",
  "community-outreach": "bg-[var(--gold-soft)] text-black",
  worship: "bg-[var(--gold-soft)] text-black",
  "bible-study": "bg-[var(--gold-soft)] text-black",
  prayer: "bg-[var(--gold-soft)] text-black",
  social: "bg-[var(--gold-soft)] text-black",
  other: "bg-black/5 text-black/70",
};

export default function EventCard({ event }: { event: Event }) {
  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cat = event.category ?? "other";

  return (
    <Link
      href={`/events/${event.id}`}
      className="surface-card fade-rise block overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1"
    >
      {event.image_url && (
        <div className="relative h-40 w-full">
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 360px"
          />
        </div>
      )}
      <div className="p-4">
        {event.category && (
          <span
            className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat]}`}
          >
            {CATEGORY_LABELS[cat]}
          </span>
        )}
        <h3 className="text-lg font-semibold text-black">{event.title}</h3>
        <p className="mt-1 text-sm text-[var(--foreground-soft)]">{dateStr}</p>
        <p className="text-sm text-[var(--foreground-soft)]">{event.location}</p>
      </div>
    </Link>
  );
}
