"use client";

/**
 * Admin user management — paginated search + role/status editor.
 *
 * Batch E changes:
 *   - Per-row SAVE button (replaces inline auto-PATCH on every dropdown
 *     change). Edits are staged until the admin explicitly saves so
 *     they can tweak multiple fields together.
 *   - On save, if the role changed, the API stamps force_reauth_at via
 *     a DB trigger — the target user's next middleware hit signs them
 *     out and forces re-login, so their JWT claims refresh.
 *   - Elevating to `admin` is NOT applied directly; it goes through the
 *     dual-admin approval queue (Batch F). The UI surfaces pending
 *     elevations at the top with Approve / Reject actions.
 *
 * Every mutation round-trips through /api/admin/users which writes an
 * admin_actions audit row.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Row = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: "citizen" | "contributor" | "admin";
  contributor_kind: "ministry" | "organization" | "business" | null;
  contributor_status: "not_applied" | "pending" | "approved" | "rejected" | null;
  contributor_slug: string | null;
  created_at: string;
};

type Meta = { page: number; pageSize: number; total: number };

type PendingElevation = {
  id: string;
  target_user_id: string;
  requested_by: string;
  requested_at: string;
  expires_at: string;
  target: { id: string; full_name: string | null; email: string | null } | null;
  requester: { id: string; full_name: string | null; email: string | null } | null;
};

type RowEdits = Partial<Pick<Row, "role" | "contributor_status" | "contributor_kind">>;

const ROLES = ["citizen", "contributor", "admin"] as const;
const STATUSES = ["not_applied", "pending", "approved", "rejected"] as const;
const KINDS = ["ministry", "organization", "business"] as const;

export default function AdminUserManager({
  viewerId,
  initialRows,
  initialMeta,
  initialStatus,
}: {
  viewerId: string;
  initialRows: Row[];
  initialMeta: Meta;
  initialStatus: string | null;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [meta, setMeta] = useState<Meta>(initialMeta);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus ?? "");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, RowEdits>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingElevation[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingBusy, setPendingBusy] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number, searchQ: string, filter: string) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (searchQ) params.set("q", searchQ);
      if (filter) params.set("status", filter);
      params.set("page", String(nextPage));
      try {
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Search failed");
          return;
        }
        setRows(json.data as Row[]);
        setMeta(json.meta as Meta);
        setEdits({});
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadPending = useCallback(async () => {
    setPendingError(null);
    try {
      const res = await fetch("/api/admin/pending-elevations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setPendingError(json.error ?? "Failed to load pending elevations");
        return;
      }
      setPending((json.data ?? []) as PendingElevation[]);
    } catch {
      setPendingError("Network error loading pending elevations");
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      void fetchPage(1, q, statusFilter);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, statusFilter, fetchPage]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    return () => {
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, []);

  function showFlash(msg: string) {
    setFlash(msg);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setFlash(null), 3500);
  }

  function stage(user_id: string, update: RowEdits) {
    setEdits((prev) => {
      const prior = prev[user_id] ?? {};
      const next: RowEdits = { ...prior, ...update };
      const row = rows.find((r) => r.id === user_id);
      if (row) {
        (Object.keys(next) as Array<keyof RowEdits>).forEach((k) => {
          if (next[k] === row[k]) delete next[k];
        });
      }
      const out = { ...prev };
      if (Object.keys(next).length === 0) delete out[user_id];
      else out[user_id] = next;
      return out;
    });
  }

  async function save(user_id: string) {
    const rowEdits = edits[user_id];
    if (!rowEdits || Object.keys(rowEdits).length === 0) return;
    setBusyIds((prev) => new Set(prev).add(user_id));
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, ...rowEdits }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Update failed");
        return;
      }
      if (json.pending) {
        showFlash("Admin elevation queued — a different admin must approve it.");
        await loadPending();
      } else if (json.noop) {
        showFlash("User is already an admin — no change made.");
      } else {
        setRows((prev) =>
          prev.map((r) => (r.id === user_id ? { ...r, ...rowEdits } : r)),
        );
        if (rowEdits.role) {
          showFlash(
            "Saved. The user will be signed out on their next request so their role refreshes.",
          );
        } else {
          showFlash("Saved.");
        }
      }
      setEdits((prev) => {
        const out = { ...prev };
        delete out[user_id];
        return out;
      });
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user_id);
        return next;
      });
    }
  }

  async function elevationAction(id: string, action: "approve" | "reject") {
    setPendingBusy((prev) => new Set(prev).add(id));
    setPendingError(null);
    try {
      const res = await fetch(`/api/admin/pending-elevations/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason: null }) : "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPendingError(json.error ?? `${action} failed`);
        return;
      }
      showFlash(action === "approve" ? "Elevation approved." : "Elevation rejected.");
      await Promise.all([loadPending(), fetchPage(page, q, statusFilter)]);
    } finally {
      setPendingBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div className="space-y-5">
      {flash && (
        <p
          role="status"
          className="rounded-xl border border-(--gold)/40 bg-(--gold)/10 px-3 py-2 text-sm text-black"
        >
          {flash}
        </p>
      )}

      <section
        id="admin-elevations"
        className="rounded-2xl border border-black/10 bg-white"
      >
        <header className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-black">
            Pending admin elevations{" "}
            <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-black/60">
              {pending.length}
            </span>
          </h2>
          <p className="text-xs text-black/50">
            A different admin must approve (or solo-admin can self-approve after 24h).
          </p>
        </header>
        {pendingError && (
          <p
            role="alert"
            className="mx-4 mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {pendingError}
          </p>
        )}
        {pending.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-black/50">No pending elevations.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {pending.map((p) => {
              const isOwn = p.requested_by === viewerId;
              const busy = pendingBusy.has(p.id);
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black">
                      {p.target?.full_name || p.target?.email || p.target_user_id}
                    </p>
                    <p className="truncate text-xs text-black/50">
                      Requested by{" "}
                      {p.requester?.full_name || p.requester?.email || p.requested_by}
                      {isOwn && (
                        <span className="ml-1 rounded-full bg-(--gold)/30 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                          you
                        </span>
                      )}{" "}
                      · {new Date(p.requested_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => elevationAction(p.id, "approve")}
                      className="rounded-xl border border-(--gold) bg-(--gold)/10 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-(--gold)/20 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => elevationAction(p.id, "reject")}
                      className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="min-w-[16rem] flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-(--gold)"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending contributor</option>
          <option value="approved">Approved contributor</option>
          <option value="rejected">Rejected contributor</option>
        </select>
        <span className="ml-auto text-xs text-black/50">
          {meta.total} user{meta.total === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-black/10 bg-white">
        {rows.length === 0 && !loading ? (
          <p className="px-5 py-8 text-center text-sm text-black/50">No users match.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {rows.map((r) => {
              const busy = busyIds.has(r.id);
              const isSelf = r.id === viewerId;
              const pendingEdits = edits[r.id];
              const effRole = pendingEdits?.role ?? r.role;
              const effStatus = pendingEdits?.contributor_status ?? r.contributor_status;
              const effKind = pendingEdits?.contributor_kind ?? r.contributor_kind;
              const dirty = !!pendingEdits && Object.keys(pendingEdits).length > 0;
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {r.avatar_url ? (
                      <Image
                        src={r.avatar_url}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-xs font-semibold text-black/50"
                      >
                        {r.full_name?.slice(0, 1).toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-black">
                        {r.full_name || "(no name)"}{" "}
                        {isSelf && (
                          <span className="ml-1 rounded-full bg-(--gold)/30 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                            you
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-black/50">{r.email}</p>
                    </div>
                  </div>

                  <label className="text-xs">
                    <span className="mr-1 text-black/50">Role</span>
                    <select
                      value={effRole}
                      disabled={busy || (isSelf && r.role === "admin")}
                      onChange={(e) =>
                        stage(r.id, { role: e.target.value as Row["role"] })
                      }
                      className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-(--gold) disabled:opacity-50"
                    >
                      {ROLES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs">
                    <span className="mr-1 text-black/50">Status</span>
                    <select
                      value={effStatus ?? "not_applied"}
                      disabled={busy || effRole !== "contributor"}
                      onChange={(e) =>
                        stage(r.id, {
                          contributor_status: e.target
                            .value as Row["contributor_status"],
                        })
                      }
                      className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-(--gold) disabled:opacity-50"
                    >
                      {STATUSES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs">
                    <span className="mr-1 text-black/50">Kind</span>
                    <select
                      value={effKind ?? ""}
                      disabled={busy || effRole !== "contributor"}
                      onChange={(e) =>
                        stage(r.id, {
                          contributor_kind:
                            e.target.value === ""
                              ? null
                              : (e.target.value as Row["contributor_kind"]),
                        })
                      }
                      className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-(--gold) disabled:opacity-50"
                    >
                      <option value="">—</option>
                      {KINDS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    disabled={!dirty || busy}
                    onClick={() => save(r.id)}
                    className="rounded-xl border border-(--gold) bg-(--gold)/10 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-(--gold)/20 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-transparent disabled:text-black/30"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>

                  <Link
                    href={`/profile/${r.id}`}
                    className="text-xs text-black/60 underline hover:text-black"
                  >
                    View
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-black/60">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => {
            const p = page - 1;
            setPage(p);
            void fetchPage(p, q, statusFilter);
          }}
          className="rounded-xl border border-black/10 bg-white px-3 py-1.5 font-medium text-black transition hover:bg-black/5 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span>
          Page {meta.page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => {
            const p = page + 1;
            setPage(p);
            void fetchPage(p, q, statusFilter);
          }}
          className="rounded-xl border border-black/10 bg-white px-3 py-1.5 font-medium text-black transition hover:bg-black/5 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
