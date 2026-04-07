"use client";

import { useRef, useState } from "react";

type Props = {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number | string;
  children: React.ReactNode;
};

export default function AccordionSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-black/[.12]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-1 py-3 text-sm font-semibold text-black/80 transition hover:text-black"
        aria-expanded={open}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-black/60">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        {badge != null && (
          <span className="rounded-full bg-black/8 px-2 py-0.5 text-xs font-medium text-black/60">
            {badge}
          </span>
        )}
        <span
          className={`text-xs text-black/40 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-200"
        style={{
          maxHeight: open
            ? `${contentRef.current?.scrollHeight ?? 2000}px`
            : "0px",
          paddingBottom: open ? "0.5rem" : "0",
        }}
      >
        {children}
      </div>
    </div>
  );
}
