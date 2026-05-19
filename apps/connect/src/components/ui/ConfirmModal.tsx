"use client";

/**
 * Reusable confirmation modal for destructive admin actions.
 *
 * Replaces native `window.confirm()` in admin surfaces so that destructive
 * actions match the Connect UI system (glass/white surface, gold accents,
 * accessible dialog semantics) and so screen readers + keyboard users get
 * proper focus management instead of a browser-driven popup.
 *
 * Behaviour:
 * - `Escape` dismisses (calls `onCancel`).
 * - On open, focus lands on **Cancel** for destructive tone (so a stray
 *   `Enter` keypress carried over from the trigger does not re-fire the
 *   destructive action) and on **Confirm** for primary tone.
 * - Background click does NOT dismiss — destructive actions should require
 *   an intentional Cancel/Confirm to reduce accidental data loss.
 * - Caller controls the `busy` flag so we can show "Working…" without
 *   re-implementing async state in every consumer.
 */

import { useEffect, useRef } from "react";

export interface ConfirmModalProps {
  /** Dialog heading shown at the top. Required for a11y labelling. */
  title: string;
  /** Body copy. Pass a `ReactNode` if you need formatting; strings are fine. */
  message: React.ReactNode;
  /** Label on the destructive button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label on the dismiss button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Visual treatment for the primary action. */
  tone?: "destructive" | "primary";
  /** Disables both buttons while a request is in flight. */
  busy?: boolean;
  /** Invoked when the user clicks the primary action. */
  onConfirm: () => void;
  /** Invoked on Cancel, ESC. */
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "destructive",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    // Defer focus until the dialog is painted so the screen-reader
    // announces the title before announcing the focused button. For
    // destructive actions, default focus to Cancel so a stray Enter
    // carried over from the trigger does not immediately re-fire the
    // destructive action.
    const id = requestAnimationFrame(() => {
      if (tone === "destructive") cancelBtnRef.current?.focus();
      else confirmBtnRef.current?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(id);
    };
  }, [busy, onCancel, tone]);

  const primaryClass =
    tone === "destructive"
      ? "rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
      : "rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="confirm-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2
          id="confirm-modal-title"
          className="text-lg font-semibold text-black"
        >
          {title}
        </h2>
        <div className="mt-2 text-sm text-black/70">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-black/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={primaryClass}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
