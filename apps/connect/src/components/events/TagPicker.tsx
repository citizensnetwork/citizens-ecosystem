"use client";

/**
 * TagPicker — typeahead + create-on-fly tag picker used by EventForm
 * and EditEventForm.  Keeps all state client-side; the consumer just
 * passes `value` (selected tags) and `onChange` to react to edits.
 *
 * Contract:
 *   - At most `EVENT_TAG_LIMIT` tags may be selected.
 *   - New tags are created via `POST /api/tags` (idempotent on slug).
 *   - Tag search debounces to 180 ms and fetches from `GET /api/tags`.
 *
 * This component is intentionally UI-only. Assignment to an event
 * (via `POST /api/events/[id]/tags`) is left to the caller so that we
 * don't double-write during the event-creation flow (where the event
 * id doesn't yet exist until after the form submit).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventTag } from "@/types/db";
import { EVENT_TAG_LIMIT } from "@/types/db";
import { TAG_LABEL_MAX } from "@/lib/validation";

type Props = {
  value: EventTag[];
  onChange: (next: EventTag[]) => void;
  disabled?: boolean;
};

const DEBOUNCE_MS = 180;

export default function TagPicker({ value, onChange, disabled = false }: Props) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<EventTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  const selectedIds = useMemo(() => new Set(value.map((t) => t.id)), [value]);
  const atLimit = value.length >= EVENT_TAG_LIMIT;

  // ── Debounced fetch ────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);

    const q = input.trim();
    if (q.length === 0) {
      setSuggestions([]);
      return;
    }

    timerRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(
          `/api/tags?q=${encodeURIComponent(q)}&limit=8`,
          { signal: ac.signal, cache: "no-store" }
        );
        if (!res.ok) return;
        const json = (await res.json()) as { tags: EventTag[] };
        setSuggestions(
          (json.tags ?? []).filter((t) => !selectedIds.has(t.id))
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.warn("[TagPicker] fetch failed", err);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [input, selectedIds]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const addTag = useCallback(
    (tag: EventTag) => {
      if (selectedIds.has(tag.id) || atLimit) return;
      onChange([...value, tag]);
      setInput("");
      setSuggestions([]);
      setError(null);
    },
    [onChange, value, selectedIds, atLimit]
  );

  const removeTag = useCallback(
    (id: string) => {
      onChange(value.filter((t) => t.id !== id));
    },
    [onChange, value]
  );

  const createAndAdd = useCallback(
    async (label: string) => {
      if (atLimit) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : "Failed to create tag");
          return;
        }
        const tag = json.tag as EventTag;
        addTag(tag);
      } catch (err) {
        console.warn("[TagPicker] create failed", err);
        setError("Failed to create tag");
      } finally {
        setBusy(false);
      }
    },
    [addTag, atLimit]
  );

  const trimmedInput = input.trim();
  const canCreate =
    trimmedInput.length > 0 &&
    trimmedInput.length <= TAG_LABEL_MAX &&
    !suggestions.some(
      (s) => s.label.toLowerCase() === trimmedInput.toLowerCase()
    ) &&
    !value.some(
      (s) => s.label.toLowerCase() === trimmedInput.toLowerCase()
    );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[0]) {
        addTag(suggestions[0]);
      } else if (canCreate && !busy) {
        void createAndAdd(trimmedInput);
      }
    } else if (e.key === "Backspace" && input.length === 0 && value.length > 0) {
      removeTag(value[value.length - 1].id);
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        className={`flex flex-wrap gap-1.5 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm focus-within:border-black/40 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        {value.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-(--gold-soft,#f5ecd3) px-2 py-0.5 text-xs font-medium text-black"
          >
            {tag.label}
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              disabled={disabled}
              className="rounded-full text-black/50 transition hover:text-black"
              aria-label={`Remove tag ${tag.label}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, TAG_LABEL_MAX))}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          disabled={disabled || atLimit}
          placeholder={
            atLimit
              ? `Max ${EVENT_TAG_LIMIT} tags`
              : value.length === 0
                ? "Add tags (e.g. worship, coffee, outdoor)"
                : "Add another…"
          }
          className="flex-1 min-w-[8ch] bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-black/40"
          aria-label="Tag input"
        />
      </div>

      {open && (suggestions.length > 0 || canCreate || error) && (
        <div className="relative">
          <ul
            className="absolute z-20 mt-0.5 max-h-56 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/4"
                >
                  <span className="truncate">
                    {s.label}
                    {s.is_official && (
                      <span className="ml-1.5 rounded bg-(--gold-soft,#f5ecd3) px-1 text-[10px] uppercase tracking-wider text-black/70">
                        Official
                      </span>
                    )}
                  </span>
                  {s.usage_count > 0 && (
                    <span className="text-xs text-black/40">
                      {s.usage_count}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {canCreate && (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void createAndAdd(trimmedInput);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-black/80 hover:bg-black/4 disabled:opacity-50"
                >
                  Create tag <strong>“{trimmedInput}”</strong>
                </button>
              </li>
            )}
            {error && (
              <li className="px-3 py-1.5 text-xs text-red-600" role="alert">
                {error}
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-black/45">
        {value.length}/{EVENT_TAG_LIMIT} tags · press Enter to add
      </p>
    </div>
  );
}
