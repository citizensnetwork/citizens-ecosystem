"use client";

import { useState } from "react";
import AddTeamMemberPopup, {
  type SearchResultRow,
  type InviteRole,
} from "./AddTeamMemberPopup";

interface Member {
  id: string;
  member_id: string;
  role: string;
  status: string;
  created_at: string;
  member: { full_name: string | null; avatar_url: string | null; email: string | null } | null;
}

interface Volunteer {
  id: string;
  applicant_id: string;
  entity_type: string;
  entity_id: string;
  message: string | null;
  response_message: string | null;
  status: string;
  created_at: string;
  applicant: { full_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  slug: string;
  members: Member[];
  volunteers: Volunteer[];
  viewerIsOwner: boolean;
}

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  approved: "bg-green-100 text-green-700",
  declined: "bg-black/10 text-black/50",
  withdrawn: "bg-black/10 text-black/40",
};

export default function TeamDashboardClient({
  slug,
  members: initialMembers,
  volunteers: initialVolunteers,
  viewerIsOwner,
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [volunteers, setVolunteers] = useState(initialVolunteers);
  const [tab, setTab] = useState<"members" | "volunteers">("members");
  const [popupOpen, setPopupOpen] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [transferring, setTransferring] = useState<string | null>(null);

  // Volunteer respond state
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseMsg, setResponseMsg] = useState("");
  const [respondingAction, setRespondingAction] = useState<"approved" | "declined" | null>(null);
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [volunteerError, setVolunteerError] = useState("");

  function handleInvited(user: SearchResultRow, role: InviteRole) {
    // Optimistic add as a pending row so the dashboard surfaces "Invited" state.
    setMembers((prev) => [
      ...prev,
      {
        id: `pending-${user.id}`,
        member_id: user.id,
        role,
        status: "pending",
        created_at: new Date().toISOString(),
        member: { full_name: user.full_name, avatar_url: user.avatar_url, email: user.email },
      },
    ]);
  }

  async function removeMember(membershipId: string) {
    setMemberError("");
    const prev = [...members];
    setMembers((m) => m.filter((x) => x.id !== membershipId));
    const res = await fetch(`/api/contributor/${slug}/team`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", membership_id: membershipId }),
    });
    if (!res.ok) {
      setMembers(prev);
      const data = await res.json().catch(() => ({}));
      setMemberError(data.error ?? "Failed to remove member");
    }
  }

  async function proposeOwnerTransfer(memberId: string, fullName: string | null) {
    if (!viewerIsOwner) return;
    if (!confirm(`Propose ownership transfer to ${fullName ?? "this member"}? They'll receive a notification.`)) {
      return;
    }
    setTransferring(memberId);
    setMemberError("");
    try {
      const res = await fetch(`/api/contributor/${slug}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose_owner_transfer", member_id: memberId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMemberError(data.error ?? "Failed to propose transfer");
      }
    } catch {
      setMemberError("Network error. Please try again.");
    } finally {
      setTransferring(null);
    }
  }

  async function respondToVolunteer(applicationId: string, newStatus: "approved" | "declined") {
    setSubmittingResponse(true);
    setVolunteerError("");
    try {
      const res = await fetch(`/api/contributor/${slug}/volunteers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          application_id: applicationId,
          status: newStatus,
          ...(responseMsg.trim() ? { response_message: responseMsg.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setVolunteerError((err as Record<string, string>).error ?? "Failed to update status");
        setSubmittingResponse(false);
        return;
      }
      setVolunteers((prev) =>
        prev.map((v) =>
          v.id === applicationId
            ? { ...v, status: newStatus, response_message: responseMsg.trim() || null }
            : v
        )
      );
      setRespondingTo(null);
      setResponseMsg("");
      setRespondingAction(null);
    } catch {
      setVolunteerError("Network error. Please try again.");
    } finally {
      setSubmittingResponse(false);
    }
  }

  function openRespond(applicationId: string, action: "approved" | "declined") {
    setRespondingTo(applicationId);
    setRespondingAction(action);
    setResponseMsg("");
    setVolunteerError("");
  }

  function cancelRespond() {
    setRespondingTo(null);
    setRespondingAction(null);
    setResponseMsg("");
    setVolunteerError("");
  }

  const pendingVolunteers = volunteers.filter((v) => v.status === "pending");
  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  return (
    <div className="space-y-6">
      {popupOpen && (
        <AddTeamMemberPopup
          slug={slug}
          onClose={() => setPopupOpen(false)}
          onInvited={handleInvited}
        />
      )}

      {/* Tab switcher */}
      <div role="tablist" aria-label="Team sections" className="flex gap-2 border-b border-[--border]">
        <button
          role="tab"
          aria-selected={tab === "members"}
          onClick={() => setTab("members")}
          className={[
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "members"
              ? "border-[--gold] text-[--gold]"
              : "border-transparent text-[--foreground-soft] hover:text-[--foreground]",
          ].join(" ")}
        >
          Members ({activeMembers.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "volunteers"}
          onClick={() => setTab("volunteers")}
          className={[
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors relative",
            tab === "volunteers"
              ? "border-[--gold] text-[--gold]"
              : "border-transparent text-[--foreground-soft] hover:text-[--foreground]",
          ].join(" ")}
        >
          Volunteers ({volunteers.length})
          {pendingVolunteers.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-amber-500 text-white rounded-full">
              {pendingVolunteers.length}
            </span>
          )}
        </button>
      </div>

      {tab === "members" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Team</h3>
            <button
              onClick={() => setPopupOpen(true)}
              className="text-sm rounded-full bg-[--gold] text-black px-4 py-1.5 font-semibold hover:opacity-90"
            >
              + Add team member
            </button>
          </div>

          {memberError && (
            <p className="text-xs text-red-600" role="alert">
              {memberError}
            </p>
          )}

          {pendingMembers.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-2">
                Pending invites
              </h4>
              <ul className="space-y-2">
                {pendingMembers.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onRemove={() => removeMember(m.id)}
                    showTransfer={false}
                  />
                ))}
              </ul>
            </section>
          )}

          {activeMembers.length === 0 ? (
            <p className="text-sm text-[--foreground-soft]">No active team members yet.</p>
          ) : (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[--foreground-soft] mb-2">
                Active members
              </h4>
              <ul className="space-y-2">
                {activeMembers.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onRemove={() => removeMember(m.id)}
                    showTransfer={viewerIsOwner}
                    onProposeOwner={() => proposeOwnerTransfer(m.member_id, m.member?.full_name ?? null)}
                    transferLoading={transferring === m.member_id}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "volunteers" && (
        <div>
          {volunteers.length === 0 ? (
            <p className="text-sm text-[--foreground-soft]">No volunteer applications yet.</p>
          ) : (
            <ul className="space-y-3">
              {volunteers.map((v) => (
                <li key={v.id} className="surface-card rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[--surface-muted] flex items-center justify-center text-xs overflow-hidden flex-shrink-0">
                      {v.applicant?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.applicant.avatar_url} alt={v.applicant.full_name ?? ""} className="w-full h-full object-cover" />
                      ) : (
                        <span>{v.applicant?.full_name?.charAt(0) ?? "?"}</span>
                      )}
                    </div>
                    <span className="text-sm font-medium">{v.applicant?.full_name ?? "Unknown"}</span>
                    <span
                      className={[
                        "ml-auto text-xs px-2 py-0.5 rounded-full capitalize font-medium",
                        STATUS_CLASSES[v.status] ?? "bg-black/10 text-black/50",
                      ].join(" ")}
                    >
                      {v.status}
                    </span>
                  </div>

                  {v.message && (
                    <p className="text-xs text-[--foreground-soft] italic">&ldquo;{v.message}&rdquo;</p>
                  )}

                  {v.response_message && v.status !== "pending" && (
                    <p className="text-xs text-[--foreground-soft]">
                      <span className="font-medium">Your response:</span> {v.response_message}
                    </p>
                  )}

                  <div className="text-xs text-[--foreground-soft]">
                    For: {v.entity_type} · Applied {new Date(v.created_at).toLocaleDateString()}
                  </div>

                  {v.status === "pending" && respondingTo === v.id ? (
                    <div className="pt-2 space-y-2 border-t border-[--border]">
                      <p className="text-xs font-medium text-[--foreground]">
                        {respondingAction === "approved" ? "Approve volunteer?" : "Decline this applicant?"}
                      </p>
                      <textarea
                        className="w-full rounded-xl border border-[--border] bg-[--surface] p-2 text-xs resize-none focus:outline-none focus:border-[--gold]"
                        rows={2}
                        maxLength={500}
                        placeholder={
                          respondingAction === "approved"
                            ? "Optional: add a welcome note…"
                            : "Optional: let them know why (visible to applicant)…"
                        }
                        value={responseMsg}
                        onChange={(e) => setResponseMsg(e.target.value)}
                        aria-label="Response message"
                      />
                      {volunteerError && respondingTo === v.id && (
                        <p className="text-xs text-red-600" role="alert">{volunteerError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => respondToVolunteer(v.id, respondingAction!)}
                          disabled={submittingResponse}
                          className={[
                            "rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                            respondingAction === "approved"
                              ? "bg-green-600 text-white hover:bg-green-700"
                              : "bg-red-500 text-white hover:bg-red-600",
                          ].join(" ")}
                        >
                          {submittingResponse
                            ? "Saving…"
                            : respondingAction === "approved"
                            ? "Confirm Approve"
                            : "Confirm Decline"}
                        </button>
                        <button
                          onClick={cancelRespond}
                          disabled={submittingResponse}
                          className="rounded-full border border-[--border] px-4 py-1.5 text-xs text-[--foreground-soft] hover:bg-[--surface-muted] transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : v.status === "pending" ? (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openRespond(v.id, "approved")}
                        className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => openRespond(v.id, "declined")}
                        className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface MemberRowProps {
  member: Member;
  onRemove: () => void;
  showTransfer: boolean;
  onProposeOwner?: () => void;
  transferLoading?: boolean;
}

function MemberRow({ member, onRemove, showTransfer, onProposeOwner, transferLoading }: MemberRowProps) {
  const isPending = member.status === "pending";
  return (
    <li className="surface-card rounded-xl p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-[--surface-muted] flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
        {member.member?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.member.avatar_url} alt={member.member.full_name ?? ""} className="w-full h-full object-cover" />
        ) : (
          <span>{member.member?.full_name?.charAt(0) ?? "?"}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{member.member?.full_name ?? "Unknown"}</div>
        <div className="text-xs text-[--foreground-soft] capitalize flex items-center gap-1">
          {member.role}
          {isPending && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CLASSES.pending}`}>
              invited
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {showTransfer && onProposeOwner && (
          <button
            onClick={onProposeOwner}
            disabled={transferLoading}
            title="Propose ownership transfer"
            className="text-xs text-[--foreground-soft] hover:text-[--gold] transition-colors px-2 py-1 disabled:opacity-40"
          >
            {transferLoading ? "…" : "Make owner"}
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-xs text-[--foreground-soft] hover:text-red-500 transition-colors px-2 py-1"
        >
          {isPending ? "Cancel" : "Remove"}
        </button>
      </div>
    </li>
  );
}
