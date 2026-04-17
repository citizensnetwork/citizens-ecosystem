"use client";

import { useState } from "react";
import QuickPanelSettings, { type QuickPanelOption } from "@/components/events/QuickPanelSettings";

type Props = {
  options: QuickPanelOption[];
};

/**
 * Profile section that lets users edit their map quick-panel selections.
 * Stored client-side (localStorage) for per-device personalisation.
 */
export default function QuickPanelPreferencesSection({ options }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-8 rounded-xl border border-black/8 bg-white/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Quick-panel</h2>
          <p className="mt-1 text-xs text-black/60">
            Choose up to 5 quick filters to show on the map under the burger menu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-(--gold) px-4 py-1.5 text-xs font-semibold text-black shadow-sm transition hover:brightness-110"
        >
          Edit
        </button>
      </div>

      <QuickPanelSettings
        open={open}
        options={options}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}
