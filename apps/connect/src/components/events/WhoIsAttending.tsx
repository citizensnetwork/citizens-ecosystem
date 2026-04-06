"use client";

import Link from "next/link";
import type { AttendeesVisibility } from "@/types/db";

type Attendee = {
  user_id: string;
  full_name: string;
  isFriend: boolean;
};

type Props = {
  attendees: Attendee[];
  totalCount: number;
  visibility: AttendeesVisibility;
  isAuthenticated: boolean;
};

export default function WhoIsAttending({
  attendees,
  totalCount,
  visibility,
  isAuthenticated,
}: Props) {
  if (totalCount === 0) {
    return (
      <p className="text-sm text-gray-500">No one has RSVPed yet. Be the first!</p>
    );
  }

  // count_only mode — just show the number
  if (visibility === "count_only") {
    return (
      <p className="text-sm text-black/70">
        <strong className="text-black">{totalCount}</strong>{" "}
        {totalCount === 1 ? "person" : "people"} attending
      </p>
    );
  }

  // authenticated mode — require login
  if (visibility === "authenticated" && !isAuthenticated) {
    return (
      <div className="text-sm text-black/70">
        <p>
          <strong className="text-black">{totalCount}</strong>{" "}
          {totalCount === 1 ? "person" : "people"} attending
        </p>
        <p className="mt-1">
          <Link
            href="/login"
            className="font-semibold text-(--gold) hover:underline"
          >
            Log in
          </Link>{" "}
          to see who&apos;s going.
        </p>
      </div>
    );
  }

  // Sort friends first
  const sorted = [...attendees].sort((a, b) => {
    if (a.isFriend && !b.isFriend) return -1;
    if (!a.isFriend && b.isFriend) return 1;
    return 0;
  });

  return (
    <div>
      <p className="mb-3 text-sm text-black/70">
        <strong className="text-black">{totalCount}</strong>{" "}
        {totalCount === 1 ? "person" : "people"} attending
      </p>
      <ul className="space-y-2">
        {sorted.map((a) => (
          <li key={a.user_id}>
            <Link
              href={`/profile/${a.user_id}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-black/5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--gold-soft) text-xs font-bold uppercase text-black">
                {a.full_name?.[0] ?? "?"}
              </span>
              <span className="text-sm font-medium text-black">
                {a.full_name}
              </span>
              {a.isFriend && (
                <span className="rounded-full bg-(--gold-soft) px-2 py-0.5 text-[10px] font-semibold text-black">
                  ✨ Friend
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
