"use client";

import { useState } from "react";

interface Member {
  id: string;
  member_id: string;
  role: string;
  status: string;
  created_at: string;
  member: { full_name: string | null; avatar_url: string | null } | null;
}

interface Volunteer {
  id: string;
  applicant_id: string;
  entity_type: string;
  entity_id: string;
  message: string | null;
  status: string;
  created_at: string;
  applicant: { full_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  slug: string;
  members: Member[];
  volunteers: Volunteer[];
}

export default function TeamDashboardClient({ slug, members: initialMembers, volunteers }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [tab, setTab] = useState<"members" | "volunteers">("members");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; full_name: string | null; avatar_url: string | null; email: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  async function searchUsers() {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/contributor/${slug}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", name: searchQuery.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results ?? []);
      }
    } finally {
      setSearching(false);
    }
  }

  async function inviteMember(userId: string, role: "editor" | "viewer") {
    setInviting(userId);
    try {
      const res = await fetch(`/api/contributor/${slug}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", member_id: userId, role }),
      });
      if (res.ok) {
        const user = searchResults.find((u) => u.id === userId);
        if (user) {
          setMembers((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              member_id: userId,
              role,
              status: "active",
              created_at: new Date().toISOString(),
              member: { full_name: user.full_name, avatar_url: user.avatar_url },
            },
          ]);
          setSearchResults((prev) => prev.filter((u) => u.id !== userId));
        }
      }
    } finally {
      setInviting(null);
    }
  }

  async function removeMember(membershipId: string) {
    const prev = [...members];
    setMembers((m) => m.filter((x) => x.id !== membershipId));
    const res = await fetch(`/api/contributor/${slug}/team`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", membership_id: membershipId }),
    });
    if (!res.ok) setMembers(prev);
  }

  const pendingVolunteers = volunteers.filter((v) => v.status === "pending");

  return (
    <div className="space-y-6">
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
          Members ({members.length})
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
          {/* Search to add */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Add a team member</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                placeholder="Search by name, email, or user ID…"
                className="flex-1 text-sm border border-[--border] rounded-xl px-4 py-2 bg-[--surface] focus:outline-none focus:border-[--gold]"
              />
              <button
                onClick={searchUsers}
                disabled={searching}
                className="px-4 py-2 rounded-xl border border-[--border] text-sm hover:border-[--gold] transition-colors disabled:opacity-40"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <ul className="mt-2 surface-card rounded-xl divide-y divide-[--border]">
                {searchResults.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 p-3">
                    <div className="w-8 h-8 rounded-full bg-[--surface-muted] flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatar_url} alt={user.full_name ?? ""} className="w-full h-full object-cover" />
                      ) : (
                        <span>{user.full_name?.charAt(0) ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{user.full_name ?? "Unknown"}</div>
                      {user.email && (
                        <div className="text-xs text-[--foreground-soft] truncate">{user.email}</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => inviteMember(user.id, "editor")}
                        disabled={inviting === user.id}
                        className="text-xs px-3 py-1 rounded-lg bg-[--gold] text-black font-medium hover:opacity-90 disabled:opacity-40"
                      >
                        Editor
                      </button>
                      <button
                        onClick={() => inviteMember(user.id, "viewer")}
                        disabled={inviting === user.id}
                        className="text-xs px-3 py-1 rounded-lg border border-[--border] hover:border-[--gold] transition-colors disabled:opacity-40"
                      >
                        Viewer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Current members list */}
          {members.length === 0 ? (
            <p className="text-sm text-[--foreground-soft]">No team members yet.</p>
          ) : (
            <div>
              <h3 className="text-sm font-semibold mb-2">Current team</h3>
              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.id} className="surface-card rounded-xl p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[--surface-muted] flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
                      {m.member?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.member.avatar_url} alt={m.member.full_name ?? ""} className="w-full h-full object-cover" />
                      ) : (
                        <span>{m.member?.full_name?.charAt(0) ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.member?.full_name ?? "Unknown"}</div>
                      <span className="text-xs text-[--foreground-soft] capitalize">{m.role}</span>
                    </div>
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-xs text-[--foreground-soft] hover:text-red-500 transition-colors px-2 py-1"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "volunteers" && (
        <div>
          {volunteers.length === 0 ? (
            <p className="text-sm text-[--foreground-soft]">No volunteer applications yet.</p>
          ) : (
            <ul className="space-y-2">
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
                        v.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700",
                      ].join(" ")}
                    >
                      {v.status}
                    </span>
                  </div>
                  {v.message && (
                    <p className="text-xs text-[--foreground-soft]">{v.message}</p>
                  )}
                  <div className="text-xs text-[--foreground-soft]">
                    For: {v.entity_type} · Applied {new Date(v.created_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
