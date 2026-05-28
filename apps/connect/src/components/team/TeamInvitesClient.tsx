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

export interface OwnerTransfer {
  id: string;
  status: string;
  created_at: string;
  contributor_id: string;
  proposed_by: string;
  contributor: {
    full_name: string | null;
    avatar_url: string | null;
    contributor_slug: string | null;
  } | null;
}

interface Props {
  initialInvites: Invite[];
  initialTransfers?: OwnerTransfer[];
}

export default function TeamInvitesClient({
  initialInvites,
  initialTransfers = [],
}: Props) {
  const [invites, setInvites] = useState(initialInvites);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function respondInvite(invite: Invite, action: "accept" | "decline") {
    setBusyId(invite.id);
    setError("");
    try {
      const res = await fetch(`/api/team-invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "invite", membership_id: invite.id, action }),
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

  async function respondTransfer(transfer: OwnerTransfer, action: "accept" | "decline") {
    setBusyId(transfer.id);
    setError("");
    try {
      const res = await fetch(`/api/team-invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "owner_transfer",
          transfer_id: transfer.id,
          action,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to respond");
        return;
      }
      setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0 && transfers.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-6 text-center text-sm text-black/60">
        You have no pending team invites or ownership transfers.
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

      {transfers.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-(--gold,#D4AF37)">
            Ownership transfers
          </h2>
          <ul className="space-y-3">
            {transfers.map((transfer) => (
              <li
                key={transfer.id}
                className="surface-card rounded-xl border border-(--gold,#D4AF37)/40 bg-white p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {transfer.contributor?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={transfer.contributor.avatar_url}
                      alt={transfer.contributor.full_name ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium">
                      {transfer.contributor?.full_name?.charAt(0) ?? "?"}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-black flex items-center gap-2">
                    {transfer.contributor?.contributor_slug ? (
                      <Link
                        href={`/c/${transfer.contributor.contributor_slug}`}
                        className="hover:underline"
                      >
                        {transfer.contributor.full_name ?? "Contributor"}
                      </Link>
                    ) : (
                      transfer.contributor?.full_name ?? "Contributor"
                    )}
                    <span className="rounded-full bg-(--gold,#D4AF37)/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-(--gold,#D4AF37) uppercase">
                      Owner transfer
                    </span>
                  </div>
                  <div className="text-xs text-black/60">
                    The current owner has proposed transferring full ownership to you ·{" "}
                    {new Date(transfer.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => respondTransfer(transfer, "accept")}
                    disabled={busyId === transfer.id}
                    className="rounded-full bg-(--gold,#D4AF37) text-black text-xs font-semibold px-4 py-1.5 hover:opacity-90 disabled:opacity-40"
                  >
                    {busyId === transfer.id ? "…" : "Accept"}
                  </button>
                  <button
                    onClick={() => respondTransfer(transfer, "decline")}
                    disabled={busyId === transfer.id}
                    className="rounded-full border border-black/15 text-xs font-medium px-4 py-1.5 text-black/70 hover:bg-black/5 disabled:opacity-40"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invites.length > 0 && (
        <section>
          {transfers.length > 0 && (
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-black/60">
              Team invites
            </h2>
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
                    onClick={() => respondInvite(invite, "accept")}
                    disabled={busyId === invite.id}
                    className="rounded-full bg-(--gold,#D4AF37) text-black text-xs font-semibold px-4 py-1.5 hover:opacity-90 disabled:opacity-40"
                  >
                    {busyId === invite.id ? "…" : "Accept"}
                  </button>
                  <button
                    onClick={() => respondInvite(invite, "decline")}
                    disabled={busyId === invite.id}
                    className="rounded-full border border-black/15 text-xs font-medium px-4 py-1.5 text-black/70 hover:bg-black/5 disabled:opacity-40"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
