"use client";

/**
 * Admin surface for minting, listing, and revoking API keys.
 * Raw keys are shown ONCE in a modal after creation — never persisted
 * in this component's state longer than necessary.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_minute: number | null;
  owner_id: string;
  last_used_at: string | null;
  disabled_at: string | null;
  created_at: string;
};

type OwnerLookup = {
  id: string;
  email: string;
  full_name: string;
  contributor_slug: string | null;
};

const SCOPE_OPTIONS = [
  "read:public",
  "read:events",
  "read:orgs",
  "read:analytics",
];

export default function ApiKeyManager({
  initialKeys,
  owners,
}: {
  initialKeys: ApiKeyRow[];
  owners: OwnerLookup[];
}) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [includeDisabled, setIncludeDisabled] = useState(false);

  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [rateLimit, setRateLimit] = useState<string>("");
  const [scopes, setScopes] = useState<string[]>(["read:public"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Raw-key modal: only populated immediately after POST, cleared on dismiss.
  const [newKey, setNewKey] = useState<{ raw_key: string; name: string; id: string } | null>(null);

  const refresh = useCallback(async (withDisabled: boolean) => {
    const qs = withDisabled ? "?include_disabled=1" : "";
    const res = await fetch(`/api/admin/api-keys${qs}`, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { data: ApiKeyRow[] };
      setKeys(json.data);
    }
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!ownerEmail.trim()) {
      setError("Owner email is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          owner_email: ownerEmail.trim().toLowerCase(),
          rate_limit_per_minute: rateLimit ? Number(rateLimit) : null,
          scopes: scopes.length ? scopes : ["read:public"],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create key.");
        return;
      }
      setNewKey({ raw_key: json.raw_key, name: json.name, id: json.id });
      setName("");
      setOwnerEmail("");
      setRateLimit("");
      setScopes(["read:public"]);
      await refresh(includeDisabled);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string, displayName: string) {
    if (!confirm(`Revoke "${displayName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/api-keys?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Failed to revoke key.");
      return;
    }
    await refresh(includeDisabled);
  }

  async function toggleDisabled(next: boolean) {
    setIncludeDisabled(next);
    await refresh(next);
  }

  function toggleScope(s: string) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-black/10 bg-white p-5"
      >
        <h2 className="mb-4 text-base font-semibold text-black">Mint a new key</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-black/70">Name</span>
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vision Production"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-black/70">Owner email</span>
            <OwnerEmailCombo
              value={ownerEmail}
              onChange={setOwnerEmail}
              owners={owners}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-black/70">
              Rate limit (req/min, optional)
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              placeholder="default 600"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
            />
          </label>
          <div className="block text-sm">
            <span className="mb-1 block font-medium text-black/70">Scopes</span>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleScope(s)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    scopes.includes(s)
                      ? "border-(--gold) bg-(--gold) text-black"
                      : "border-black/10 bg-white text-black/60 hover:bg-black/5"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Minting…" : "Mint key"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black">
            Active keys ({keys.filter((k) => !k.disabled_at).length})
          </h2>
          <label className="flex items-center gap-2 text-xs text-black/60">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(e) => toggleDisabled(e.target.checked)}
              className="accent-[#c8a24f]"
            />
            Include revoked
          </label>
        </div>
        {keys.length === 0 ? (
          <p className="text-sm text-black/50">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-black">
                    {k.name}{" "}
                    {k.disabled_at && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        revoked
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-black/50">
                    <code className="font-mono">{k.key_prefix}…</code>
                    {" · "}
                    {k.scopes.join(", ")}
                    {k.rate_limit_per_minute && ` · ${k.rate_limit_per_minute}/min`}
                  </p>
                  <p className="truncate text-xs text-black/40">
                    Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                  </p>
                </div>
                {!k.disabled_at && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id, k.name)}
                    className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {newKey && <NewKeyModal entry={newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

function OwnerEmailCombo({
  value,
  onChange,
  owners,
}: {
  value: string;
  onChange: (v: string) => void;
  owners: OwnerLookup[];
}) {
  const listId = "admin-api-key-owner-list";
  return (
    <>
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        placeholder="contributor@example.com"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
      />
      <datalist id={listId}>
        {owners.map((o) => (
          <option key={o.id} value={o.email}>
            {o.full_name}
            {o.contributor_slug ? ` (${o.contributor_slug})` : ""}
          </option>
        ))}
      </datalist>
    </>
  );
}

function NewKeyModal({
  entry,
  onClose,
}: {
  entry: { raw_key: string; name: string; id: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.raw_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fall through — user can select manually
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-key-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="new-key-title" className="text-lg font-semibold text-black">
          Key minted — copy it now
        </h2>
        <p className="mt-1 text-sm text-black/60">
          This is the only time you will see the full key for{" "}
          <strong className="text-black">{entry.name}</strong>. Store it in a
          secret manager immediately.
        </p>
        <div className="mt-4 rounded-xl border border-(--gold) bg-[#FBF7E9] p-3">
          <code className="break-all font-mono text-sm text-black select-all">
            {entry.raw_key}
          </code>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            I&apos;ve stored it
          </button>
        </div>
      </div>
    </div>
  );
}
