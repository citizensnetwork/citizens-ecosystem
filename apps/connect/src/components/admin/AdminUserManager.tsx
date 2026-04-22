"use client";

/**
 * Admin user management — paginated search + role/status editor.
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      } finally {
        setLoading(false);
      }
    },
    [],
  );

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

  async function patch(user_id: string, updates: Partial<Row>) {
    setBusyIds((prev) => new Set(prev).add(user_id));
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, ...updates }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Update failed");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === user_id ? { ...r, ...updates } : r)),
      );
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user_id);
        return next;
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div className="space-y-5">
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
          <p className="px-5 py-8 text-center text-sm text-black/50">
            No users match.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {rows.map((r) => {
              const busy = busyIds.has(r.id);
              const isSelf = r.id === viewerId;
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
                      value={r.role}
                      disabled={busy || (isSelf && r.role === "admin")}
                      onChange={(e) =>
                        patch(r.id, { role: e.target.value as Row["role"] })
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
                      value={r.contributor_status ?? "not_applied"}
                      disabled={busy || r.role !== "contributor"}
                      onChange={(e) =>
                        patch(r.id, {
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
                      value={r.contributor_kind ?? ""}
                      disabled={busy || r.role !== "contributor"}
                      onChange={(e) =>
                        patch(r.id, {
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
