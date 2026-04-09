"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Category, CategoryAppliesTo } from "@/types/db";

type Props = {
  categories: Category[];
};

export default function CategoryManager({ categories }: Props) {
  const [items, setItems] = useState<Category[]>(categories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [appliesTo, setAppliesTo] = useState<CategoryAppliesTo>("both");
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  function resetForm() {
    setEditingId(null);
    setName("");
    setSlug("");
    setAppliesTo("both");
    setSortOrder(items.length);
    setError("");
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setName(cat.name);
    setSlug(cat.slug);
    setAppliesTo(cat.applies_to);
    setSortOrder(cat.sort_order);
    setError("");
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required.");
      return;
    }

    setLoading(true);
    setError("");

    if (editingId) {
      const { error: err } = await supabase
        .from("categories")
        .update({
          name: name.trim(),
          slug: slug.trim(),
          applies_to: appliesTo,
          sort_order: sortOrder,
        })
        .eq("id", editingId);

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      setItems((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: name.trim(),
                slug: slug.trim(),
                applies_to: appliesTo,
                sort_order: sortOrder,
              }
            : c
        )
      );
    } else {
      const { data, error: err } = await supabase
        .from("categories")
        .insert({
          name: name.trim(),
          slug: slug.trim(),
          emoji: "",
          color: "#6b7280",
          applies_to: appliesTo,
          sort_order: sortOrder,
        })
        .select()
        .single();

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      if (data) {
        setItems((prev) => [...prev, data as Category]);
      }
    }

    resetForm();
    setLoading(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    setLoading(true);
    const { error: err } = await supabase
      .from("categories")
      .delete()
      .eq("id", id);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setItems((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Categories</h1>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Category list */}
      <div className="space-y-2">
        {items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center justify-between rounded-xl border p-3 ${
                editingId === cat.id
                  ? "border-(--gold) bg-(--gold-soft)"
                  : "border-black/8 bg-white"
              }`}
            >
              <div>
                <span className="font-medium">{cat.name}</span>
                <span className="ml-2 text-xs text-black/40">
                  {cat.slug} · {cat.applies_to} · #{cat.sort_order}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(cat)}
                  className="text-xs text-(--gold) hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat.id)}
                  disabled={loading}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Add / Edit form */}
      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-black/50">
          {editingId ? "Edit Category" : "Add Category"}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="catName"
              className="mb-1 block text-xs font-medium text-black/60"
            >
              Name
            </label>
            <input
              id="catName"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editingId) {
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/(^-|-$)/g, "")
                  );
                }
              }}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Youth Ministry"
            />
          </div>
          <div>
            <label
              htmlFor="catSlug"
              className="mb-1 block text-xs font-medium text-black/60"
            >
              Slug
            </label>
            <input
              id="catSlug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="youth-ministry"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="catAppliesTo"
              className="mb-1 block text-xs font-medium text-black/60"
            >
              Applies to
            </label>
            <select
              id="catAppliesTo"
              value={appliesTo}
              onChange={(e) =>
                setAppliesTo(e.target.value as CategoryAppliesTo)
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="events">Events</option>
              <option value="places">Places</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="catSort"
              className="mb-1 block text-xs font-medium text-black/60"
            >
              Sort order
            </label>
            <input
              id="catSort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="rounded-md bg-(--gold) px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-50"
          >
            {loading ? "Saving..." : editingId ? "Update" : "Add"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border px-4 py-2 text-sm text-black/60 hover:bg-black/5"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
