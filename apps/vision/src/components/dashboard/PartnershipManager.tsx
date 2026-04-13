"use client";

import { useState, useEffect, useCallback } from "react";
import type { OrgPartnershipWithOrgs } from "@/types/db";

interface PartnershipManagerProps {
  orgId: string;
  isAdmin: boolean;
}

export function PartnershipManager({ orgId, isAdmin }: PartnershipManagerProps) {
  const [partnerships, setPartnerships] = useState<OrgPartnershipWithOrgs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteOrgId, setInviteOrgId] = useState("");
  const [inviteLevel, setInviteLevel] = useState<"none" | "summary" | "detailed">("summary");
  const [formError, setFormError] = useState<string | null>(null);

  const fetchPartnerships = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/partnerships?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setPartnerships(data.partnerships);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPartnerships();
  }, [fetchPartnerships]);

  async function handleInvite() {
    setFormError(null);
    if (!inviteOrgId) {
      setFormError("Organisation ID is required");
      return;
    }

    try {
      const res = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_a_id: orgId,
          org_b_id: inviteOrgId,
          sharing_level: inviteLevel,
        }),
      });

      if (res.ok) {
        setShowInvite(false);
        setInviteOrgId("");
        fetchPartnerships();
      } else {
        const data = await res.json();
        setFormError(data.error);
      }
    } catch (err) {
      console.error(err);
      setFormError("Failed to send partnership invite");
    }
  }

  async function handleRespond(id: string, status: "active" | "rejected") {
    try {
      await fetch(`/api/partnerships/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchPartnerships();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await fetch(`/api/partnerships/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked" }),
      });
      fetchPartnerships();
    } catch (err) {
      console.error(err);
    }
  }

  function getPartnerName(p: OrgPartnershipWithOrgs): string {
    return p.org_a_id === orgId ? p.org_b.name : p.org_a.name;
  }

  const STATUS_COLOURS: Record<string, string> = {
    pending: "bg-yellow-600",
    active: "bg-green-600",
    rejected: "bg-red-600",
    revoked: "bg-surface-alt",
  };

  return (
    <div className="rounded-lg bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Partner Organisations</h3>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover"
            aria-label="Invite partner organisation"
          >
            {showInvite ? "Cancel" : "+ Invite Partner"}
          </button>
        )}
      </div>

      {showInvite && (
        <div className="space-y-2 border border-border rounded p-3">
          <input
            type="text"
            placeholder="Partner organisation ID (UUID)"
            value={inviteOrgId}
            onChange={(e) => setInviteOrgId(e.target.value)}
            aria-label="Partner organisation ID"
            className="w-full rounded bg-background px-2 py-1 text-sm text-white border border-border"
          />
          <select
            value={inviteLevel}
            onChange={(e) =>
              setInviteLevel(e.target.value as "none" | "summary" | "detailed")
            }
            aria-label="Sharing level"
            className="w-full rounded bg-background px-2 py-1 text-sm text-white border border-border"
          >
            <option value="none">No sharing</option>
            <option value="summary">Summary metrics</option>
            <option value="detailed">Detailed metrics</option>
          </select>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <button
            onClick={handleInvite}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
            aria-label="Send partnership invite"
          >
            Send Invite
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-text-secondary">Loading partnerships…</p>}

      {!loading && partnerships.length === 0 && (
        <p className="text-sm text-text-secondary">No partnerships established yet.</p>
      )}

      {partnerships.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between border-b border-border pb-2 last:border-b-0"
        >
          <div>
            <p className="text-sm text-white">{getPartnerName(p)}</p>
            <p className="text-xs text-text-secondary">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-white text-xs mr-2 ${
                  STATUS_COLOURS[p.status] ?? "bg-surface-alt"
                }`}
              >
                {p.status}
              </span>
              Sharing: {p.sharing_level}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {p.status === "pending" && p.org_b_id === orgId && (
                <>
                  <button
                    onClick={() => handleRespond(p.id, "active")}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                    aria-label="Accept partnership"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespond(p.id, "rejected")}
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                    aria-label="Reject partnership"
                  >
                    Reject
                  </button>
                </>
              )}
              {p.status === "active" && (
                <button
                  onClick={() => handleRevoke(p.id)}
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                  aria-label="Revoke partnership"
                >
                  Revoke
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
