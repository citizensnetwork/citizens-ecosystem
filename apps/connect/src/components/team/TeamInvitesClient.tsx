"use client";

import { useState } from "react";
import Link from "next/link";

export interface Invite {
  id: string;
  role: "owner" | "editor" | "viewer";
  status: string;
  created_at: string;
  contributor_id: string;
  contributor: {
    full_name: string | null;
    avatar_url: string | null;
    contributor_slug: string | null;
  } | null;
}

interface Props {
  initialInvites: Invite[];
}

export default function TeamInvitesClient({ initialInvites }: Props) {
  const [invites, setInvites] = useState(initialInvites);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function respond(invite: Invite, action: "accept" | "decline") {
    setBusyId(invite.id);
    setError("");
    try {
      const res = await fetch(`/api/team-invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: invite.id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to respond");
        return;
      }
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-6 text-center text-sm text-black/60">
        You have no pending team invites.
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="surface-card rounded-xl border border-black/10 bg-white p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center overflow-hidden flex-shrink-0">
              {invite.contributor?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={invite.contributor.avatar_url}
                  alt={invite.contributor.full_name ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium">
                  {invite.contributor?.full_name?.charAt(0) ?? "?"}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-black">
                {invite.contributor?.contributor_slug ? (
                  <Link
                    href={`/c/${invite.contributor.contributor_slug}`}
                    className="hover:underline"
                  >
                    {invite.contributor.full_name ?? "Contributor"}
                  </Link>
                ) : (
                  invite.contributor?.full_name ?? "Contributor"
                )}
              </div>
              <div className="text-xs text-black/60">
                Invited to join as <span className="font-medium capitalize">{invite.role}</span> ·{" "}
                {new Date(invite.created_at).toLocaleDateString()}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => respond(invite, "accept")}
                disabled={busyId === invite.id}
                className="rounded-full bg-(--gold,#D4AF37) text-black text-xs font-semibold px-4 py-1.5 hover:opacity-90 disabled:opacity-40"
              >
                {busyId === invite.id ? "…" : "Accept"}
              </button>
              <button
                onClick={() => respond(invite, "decline")}
                disabled={busyId === invite.id}
                className="rounded-full border border-black/15 text-xs font-medium px-4 py-1.5 text-black/70 hover:bg-black/5 disabled:opacity-40"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
