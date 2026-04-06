import Link from "next/link";
import Image from "next/image";
import type { Event } from "@/types/db";
import { CATEGORY_LABELS_SHORT, CATEGORY_BADGE_CLASSES } from "@/lib/categories";

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
            className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE_CLASSES[cat]}`}
          >
            {CATEGORY_LABELS_SHORT[cat]}
          </span>
        )}
        <h3 className="text-lg font-semibold text-black">{event.title}</h3>
        <p className="mt-1 text-sm text-(--foreground-soft)">{dateStr}</p>
        <p className="text-sm text-(--foreground-soft)">{event.location}</p>
      </div>
    </Link>
  );
}
