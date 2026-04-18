"use client";

import { useState } from "react";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserOrgRole, OrgRole, Department } from "@/types/db";

interface MemberWithDept extends UserOrgRole {
  departments?: { name: string } | null;
}

interface MemberTableProps {
  members: MemberWithDept[];
  departments: Department[];
  orgId: string;
  currentUserId: string;
  onRefresh: () => void;
}

export function MemberTable({
  members,
  departments,
  orgId,
  currentUserId,
  onRefresh,
}: MemberTableProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("org_member");
  const [inviteDept, setInviteDept] = useState("");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setMessage("");
    const res = await fetch(`/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        role: inviteRole,
        department_id: inviteDept || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message || "Invite sent");
      setInviteEmail("");
    } else {
      setMessage(data.error || "Failed to invite");
    }
    setInviting(false);
    onRefresh();
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    await fetch(`/api/orgs/${orgId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, role: newRole }),
    });
    onRefresh();
  }

  async function handleFounderToggle(memberId: string, isFounder: boolean) {
    await fetch(`/api/orgs/${orgId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, is_founder: isFounder }),
    });
    onRefresh();
  }

  async function handleRemove(memberId: string) {
    await fetch(`/api/orgs/${orgId}/members?id=${memberId}`, {
      method: "DELETE",
    });
    onRefresh();
  }

  const roleOptions: OrgRole[] = [
    "org_admin",
    "org_manager",
    "org_member",
    "org_viewer",
  ];

  return (
    <div className="space-y-6">
      {/* Member list */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="px-4 py-2 text-left font-medium text-text-secondary">
                User ID
              </th>
              <th className="px-4 py-2 text-left font-medium text-text-secondary">
                Role
              </th>
              <th className="px-4 py-2 text-left font-medium text-text-secondary">
                Founder
              </th>
              <th className="px-4 py-2 text-left font-medium text-text-secondary">
                Department
              </th>
              <th className="px-4 py-2 text-left font-medium text-text-secondary">
                Joined
              </th>
              <th className="px-4 py-2 text-right font-medium text-text-secondary">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.id}
                className="border-b border-border last:border-b-0 hover:bg-surface-alt/50"
              >
                <td className="px-4 py-2 font-mono text-xs text-text-primary">
                  {member.user_id.slice(0, 8)}…
                  {member.user_id === currentUserId && (
                    <span className="ml-1 text-accent">(you)</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={member.user_id === currentUserId}
                    className="rounded border border-border bg-surface px-2 py-0.5 text-xs text-text-primary disabled:opacity-50"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-1 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={!!member.is_founder}
                      onChange={(e) =>
                        handleFounderToggle(member.id, e.target.checked)
                      }
                      aria-label={`Mark ${member.user_id.slice(0, 8)} as founder`}
                      className="h-3.5 w-3.5 rounded border-border bg-surface accent-accent"
                    />
                    {member.is_founder ? (
                      <span className="font-medium text-accent">Founder</span>
                    ) : (
                      <span>—</span>
                    )}
                  </label>
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {member.departments?.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {new Date(member.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  {member.user_id !== currentUserId && (
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite form */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-text-primary">
          Invite Member
        </h3>
        {message && (
          <p className="mb-3 text-sm text-accent">{message}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select
            value={inviteDept}
            onChange={(e) => setInviteDept(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary"
          >
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {inviting ? "Inviting..." : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
