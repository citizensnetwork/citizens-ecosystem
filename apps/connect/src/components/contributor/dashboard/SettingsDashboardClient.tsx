"use client";

import { useState } from "react";
import { PREDEFINED_SERVICES } from "@/types/db";

interface Keyword {
  id: string;
  keyword: string;
}

/** Canonical lifecycle states for `contributor_access_requests.status`. */
export type AccessRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "revoked";

interface AccessRequest {
  id: string;
  admin_id: string;
  status: AccessRequestStatus;
  expires_at: string | null;
  revoked_at: string | null;
  viewing_started_at: string | null;
  denial_reason: string | null;
  updated_at: string | null;
  admin: { full_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  slug: string;
  keywords: Keyword[];
  accessRequests: AccessRequest[];
  /** True when viewer is the contributor owner. Owner is read-only on the
   *  access list per A48 — only the granting admin may revoke their session. */
  viewerIsOwner: boolean;
}

export default function SettingsDashboardClient({ slug, keywords: initialKeywords, accessRequests: initialAccessRequests, viewerIsOwner }: Props) {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [newKeyword, setNewKeyword] = useState("");
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [removingKeyword, setRemovingKeyword] = useState<string | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [accessRequests, setAccessRequests] = useState(initialAccessRequests);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyword.trim() || addingKeyword) return;
    setKeywordError(null);
    setAddingKeyword(true);
    try {
      const res = await fetch(`/api/contributor/${slug}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeywordError(data.error ?? "Failed to add keyword");
      } else {
        setKeywords((prev) => [
          ...prev,
          { id: data.id, keyword: newKeyword.trim().toLowerCase() },
        ]);
        setNewKeyword("");
      }
    } finally {
      setAddingKeyword(false);
    }
  }

  async function removeKeyword(id: string) {
    setRemovingKeyword(id);
    try {
      await fetch(`/api/contributor/${slug}/keywords?id=${id}`, { method: "DELETE" });
      setKeywords((prev) => prev.filter((k) => k.id !== id));
    } finally {
      setRemovingKeyword(null);
    }
  }

  async function revokeAccess(requestId: string) {
    setRevokingId(requestId);
    try {
      const res = await fetch(`/api/contributor/${slug}/access-requests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", request_id: requestId }),
      });
      if (res.ok) {
        setAccessRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
    } finally {
      setRevokingId(null);
    }
  }

  async function approveRequest(id: string) {
    const res = await fetch(`/api/contributor/${slug}/access-requests`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", request_id: id }),
    });
    if (res.ok) {
      setAccessRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: "approved", updated_at: new Date().toISOString() }
            : r,
        ),
      );
    }
  }

  async function denyRequest(id: string) {
    const res = await fetch(`/api/contributor/${slug}/access-requests`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deny", request_id: id, reason: denyReason }),
    });
    if (res.ok) {
      setAccessRequests((prev) => prev.filter((r) => r.id !== id));
      setDenyingId(null);
      setDenyReason("");
    }
  }

  function formatTimeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const activeRequests = accessRequests.filter(
    (r) =>
      r.status === "approved" &&
      !r.revoked_at &&
      (!r.expires_at || new Date(r.expires_at) > new Date())
  );

  const pendingRequests = accessRequests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-10 max-w-2xl">
      {/* Keywords */}
      <section>
        <h3 className="text-sm font-semibold mb-1">
          Keywords <span className="font-normal text-[--foreground-soft]">({keywords.length}/20)</span>
        </h3>
        <p className="text-xs text-[--foreground-soft] mb-3">
          Help citizens and the AI search engine find you. Use relevant topics, activities, and community terms.
        </p>

        <form onSubmit={addKeyword} className="flex gap-2 mb-3">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value.toLowerCase().replace(/[^a-z0-9\s-]/g, ""))}
            placeholder="Add a keyword…"
            maxLength={50}
            disabled={keywords.length >= 20}
            className="flex-1 text-sm border border-[--border] rounded-xl px-4 py-2 bg-[--surface] focus:outline-none focus:border-[--gold] disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={addingKeyword || !newKeyword.trim() || keywords.length >= 20}
            className="px-4 py-2 rounded-xl bg-[--gold] text-black text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Add
          </button>
        </form>
        {keywordError && <p role="alert" className="text-xs text-red-500 mb-2">{keywordError}</p>}

        {/* Predefined suggestions */}
        {keywords.length < 20 && (
          <div className="mb-3">
            <p className="text-xs text-[--foreground-soft] mb-1">Suggestions:</p>
            <div className="flex flex-wrap gap-1">
              {PREDEFINED_SERVICES.filter(
                (s: string) => !keywords.some((k) => k.keyword === s.toLowerCase())
              )
                .slice(0, 10)
                .map((svc: string) => (
                  <button
                    key={svc}
                    onClick={() => setNewKeyword(svc.toLowerCase())}
                    className="text-xs px-2 py-0.5 rounded-full border border-[--border] hover:border-[--gold] transition-colors"
                  >
                    {svc}
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <span
              key={kw.id}
              className="inline-flex items-center gap-1 text-sm bg-[--surface-muted] px-3 py-1 rounded-full border border-[--border]"
            >
              {kw.keyword}
              <button
                onClick={() => removeKeyword(kw.id)}
                disabled={removingKeyword === kw.id}
                className="opacity-50 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${kw.keyword}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Admin access */}
      <section>
        <h3 className="text-sm font-semibold mb-1">Admin access</h3>
        <p className="text-xs text-[--foreground-soft] mb-3">
          Platform admins may request temporary access to your dashboard to provide support.
          You can approve, deny, or revoke access at any time.
        </p>

        {pendingRequests.length > 0 && viewerIsOwner && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
              Pending requests
            </h4>
            <ul className="space-y-2">
              {pendingRequests.map((r) => (
                <li key={r.id} className="surface-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{r.admin?.full_name ?? "Admin"}</span>
                      <span className="text-[--foreground-soft]"> is requesting access</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveRequest(r.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white font-medium hover:opacity-90"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setDenyingId(r.id)}
                        className="text-xs px-3 py-1 rounded-lg border border-[--border] hover:border-red-400 hover:text-red-500 transition-colors"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                  {denyingId === r.id && (
                    <div className="flex gap-2 items-start pt-1">
                      <textarea
                        value={denyReason}
                        onChange={(e) => setDenyReason(e.target.value)}
                        placeholder="Reason for denying (optional)"
                        rows={2}
                        maxLength={500}
                        className="flex-1 text-xs border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface] focus:outline-none focus:border-[--gold] resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => denyRequest(r.id)}
                          className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white font-medium hover:opacity-90"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => { setDenyingId(null); setDenyReason(""); }}
                          className="text-xs px-3 py-1 rounded-lg border border-[--border] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeRequests.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-green-600 uppercase tracking-wide mb-2">
              Active sessions
            </h4>
            <ul className="space-y-2">
              {activeRequests.map((r) => (
                <li key={r.id} className="surface-card rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{r.admin?.full_name ?? "Admin"}</span>
                    {r.viewing_started_at ? (
                      <span className="text-xs text-green-600 ml-2 inline-flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        viewing since {formatTimeAgo(r.viewing_started_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-[--foreground-soft] ml-2">
                        not viewed yet
                      </span>
                    )}
                    {r.expires_at && (
                      <span className="text-xs text-[--foreground-soft] ml-2">
                        · expires {new Date(r.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {!viewerIsOwner && (
                    <button
                      onClick={() => revokeAccess(r.id)}
                      disabled={revokingId === r.id}
                      className="text-xs px-3 py-1 rounded-lg border border-[--border] hover:border-red-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      {revokingId === r.id ? "Revoking…" : "End my session"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {viewerIsOwner && (
              <p className="text-xs text-[--foreground-soft] mt-2">
                Active sessions auto-expire after 3 days. Only the granting admin may end
                their own session early.
              </p>
            )}
          </div>
        )}

        {pendingRequests.length === 0 && activeRequests.length === 0 && (
          <p className="text-sm text-[--foreground-soft]">No pending or active admin sessions.</p>
        )}
      </section>
    </div>
  );
}
