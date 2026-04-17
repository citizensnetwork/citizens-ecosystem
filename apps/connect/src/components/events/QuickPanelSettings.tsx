"use client";

import { useEffect, useState } from "react";
import { QUICK_PANEL_MAX, QUICK_PANEL_DEFAULT_COUNT, loadQuickIds, saveQuickIds } from "@/lib/quickPanelPrefs";

export type QuickPanelOption = {
  id: string;
  label: string;
  color: string;
  svg: string;
};

type Props = {
  open: boolean;
  options: QuickPanelOption[];
  onClose: () => void;
  /** Fired whenever the user saves a new selection. */
  onSaved?: (ids: string[]) => void;
};

/**
 * Centered glass modal for editing quick-panel preferences.
 *
 * Top area shows the user's currently selected ids (up to 5, with an empty
 * "add 5th" slot when fewer are picked). Below a divider, the remaining
 * options are listed horizontally with their colour swatches — tapping any
 * promotes it above the line. Users cannot save with more than 5.
 */
export default function QuickPanelSettings({ open, options, onClose, onSaved }: Props) {
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load saved ids whenever the modal is opened.
  useEffect(() => {
    if (open) {
      setIds(loadQuickIds());
      setError(null);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const byId = new Map(options.map((o) => [o.id, o]));
  const selected = ids.map((id) => byId.get(id)).filter((o): o is QuickPanelOption => !!o);
  const remaining = options.filter((o) => !ids.includes(o.id));
  const emptySlots = Math.max(0, QUICK_PANEL_DEFAULT_COUNT - selected.length);

  function promote(id: string) {
    setError(null);
    setIds((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length >= QUICK_PANEL_MAX) {
        setError(`You can keep a maximum of ${QUICK_PANEL_MAX} quick-selections.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function demote(id: string) {
    setError(null);
    setIds((prev) => prev.filter((x) => x !== id));
  }

  function handleSave() {
    if (ids.length === 0) {
      setError("Pick at least one quick-selection.");
      return;
    }
    if (ids.length > QUICK_PANEL_MAX) {
      setError(`You can keep a maximum of ${QUICK_PANEL_MAX} quick-selections.`);
      return;
    }
    saveQuickIds(ids);
    onSaved?.(ids);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Quick-panel preferences"
    >
      <div
        className="glass-panel relative w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-black/60 transition hover:bg-white/80 hover:text-black"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="pr-8 text-base font-semibold tracking-tight text-black">
          Quick-panel selections
        </h2>
        <p className="mt-1 text-xs text-black/60">
          Pick up to {QUICK_PANEL_MAX} quick filters to show under the burger button. Tap below the line to add; tap a selection to remove it.
        </p>

        {/* Selected row */}
        <div className="mt-4 flex flex-wrap gap-2">
          {selected.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => demote(opt.id)}
              title={`Remove ${opt.label}`}
              className="group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-black/80 shadow-sm backdrop-blur transition active:scale-95"
              style={{
                background: "rgba(255,255,255,0.65)",
                borderColor: `${opt.color}66`,
              }}
            >
              <span
                className="flex h-4 w-4 items-center justify-center"
                style={{ color: opt.color }}
                dangerouslySetInnerHTML={{ __html: opt.svg }}
              />
              <span>{opt.label}</span>
              <span className="text-black/40 group-hover:text-black/70">×</span>
            </button>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <span
              key={`slot-${i}`}
              className="flex items-center gap-2 rounded-full border border-dashed border-black/20 px-3 py-1.5 text-xs text-black/40"
            >
              <span className="flex h-4 w-4 items-center justify-center">+</span>
              <span>Empty slot</span>
            </span>
          ))}
          {selected.length >= QUICK_PANEL_DEFAULT_COUNT && selected.length < QUICK_PANEL_MAX && (
            <span className="flex items-center gap-2 rounded-full border border-dashed border-(--gold) px-3 py-1.5 text-xs text-black/50">
              <span className="flex h-4 w-4 items-center justify-center">+</span>
              <span>Add a 5th</span>
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="my-4 h-px w-full bg-black/15" />

        {/* Remaining options (horizontal wrap) */}
        {remaining.length === 0 ? (
          <p className="text-xs text-black/50">Everything is in your quick panel.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {remaining.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => promote(opt.id)}
                title={`Add ${opt.label}`}
                className="flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition hover:bg-white/50 active:scale-95"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full border shadow-sm"
                  style={{
                    background: "rgba(255,255,255,0.6)",
                    borderColor: `${opt.color}55`,
                    color: opt.color,
                  }}
                  dangerouslySetInnerHTML={{ __html: opt.svg }}
                />
                <span className="text-[10px] font-medium text-black/70">{opt.label}</span>
                <span
                  className="h-0.5 w-8 rounded-full"
                  style={{ background: opt.color }}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-700">
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-black/50">
            {selected.length} / {QUICK_PANEL_MAX} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/60 px-4 py-1.5 text-xs font-medium text-black/70 shadow-sm transition hover:bg-white/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={ids.length === 0 || ids.length > QUICK_PANEL_MAX}
              className="rounded-full bg-(--gold) px-4 py-1.5 text-xs font-semibold text-black shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
