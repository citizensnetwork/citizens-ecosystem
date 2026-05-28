"use client";

// Glass-overlay popup for adding a team member. Three independent search
// fields (name, email, user_id) — empty fields are ignored server-side.
// Results are merged and de-duplicated by the API.

import { useEffect, useRef, useState, type RefObject } from "react";

export interface SearchResultRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export type InviteRole = "editor" | "viewer";

interface Props {
  slug: string;
  onClose: () => void;
  onInvited: (member: SearchResultRow, role: InviteRole) => void;
}

export default function AddTeamMemberPopup({ slug, onClose, onInvited }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runSearch() {
    if (searching) return;
    setError("");
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedId = userId.trim();
    if (!trimmedName && !trimmedEmail && !trimmedId) {
      setError("Enter at least one field to search.");
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/contributor/${slug}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          ...(trimmedName ? { name: trimmedName } : {}),
          ...(trimmedEmail ? { email: trimmedEmail } : {}),
          ...(trimmedId ? { user_id: trimmedId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function invite(user: SearchResultRow, role: InviteRole) {
    setInviting(user.id);
    setError("");
    try {
      const res = await fetch(`/api/contributor/${slug}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          member_id: user.id,
          role,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to send invite");
        return;
      }
      onInvited(user, role);
      // Drop the row from the in-popup list — invitee is in flight.
      setResults((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setInviting(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add team member"
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="surface-card w-full max-w-lg rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl ring-1 ring-black/5 p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Add a team member</h2>
            <p className="text-xs text-[--foreground-soft] mt-0.5">
              Search by any combination of name, email, or user ID.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[--foreground-soft] hover:text-[--foreground] text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-2">
          <SearchField
            label="Full name"
            value={name}
            onChange={setName}
            placeholder="e.g. Lebo Mokoena"
            onEnter={runSearch}
            inputRef={nameRef}
          />
          <SearchField
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="e.g. lebo@example.com"
            onEnter={runSearch}
            type="email"
          />
          <SearchField
            label="User ID"
            value={userId}
            onChange={setUserId}
            placeholder="UUID"
            onEnter={runSearch}
            mono
          />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-full bg-[--gold] text-black text-sm font-semibold px-4 py-1.5 hover:opacity-90 disabled:opacity-40"
          >
            {searching ? "Searching…" : "Search"}
          </button>
          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4">
          {results.length === 0 ? (
            <p className="text-xs text-[--foreground-soft] py-4 text-center">
              {searching ? "Searching…" : "No results yet. Enter a query and search."}
            </p>
          ) : (
            <ul className="divide-y divide-[--border] rounded-xl border border-[--border] overflow-hidden">
              {results.map((user) => (
                <li key={user.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-full bg-[--surface-muted] flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
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
                      onClick={() => invite(user, "editor")}
                      disabled={inviting === user.id}
                      className="text-xs px-3 py-1 rounded-lg bg-[--gold] text-black font-medium hover:opacity-90 disabled:opacity-40"
                    >
                      Invite as Editor
                    </button>
                    <button
                      onClick={() => invite(user, "viewer")}
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
      </div>
    </div>
  );
}

interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  type?: string;
  mono?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

function SearchField({ label, value, onChange, placeholder, onEnter, type, mono, inputRef }: SearchFieldProps) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-[--foreground-soft] mb-1">
        {label}
      </span>
      <input
        ref={inputRef as RefObject<HTMLInputElement>}
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        className={[
          "w-full text-sm border border-[--border] rounded-xl px-3 py-2 bg-[--surface] focus:outline-none focus:border-[--gold]",
          mono ? "font-mono text-xs" : "",
        ].join(" ")}
      />
    </label>
  );
}
