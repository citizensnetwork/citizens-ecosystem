import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Citizens Connect Badge.
 *
 * Pre-configured to the three badge tones that recur across the app:
 *   - `eyebrow` — gold-soft pill used above every form headline
 *   - `gold`    — solid gold, used for "new", "live", "verified"
 *   - `neutral` — black/white pill for meta
 *   - `outline` — hairline pill for secondary tags
 *   - `success` / `warn` / `danger` — status surfaces for admin/reviews
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors",
  {
    variants: {
      variant: {
        eyebrow:
          "border-black/10 bg-[var(--gold-soft)] text-black/80",
        gold:
          "border-transparent bg-[var(--gold)] text-black",
        neutral:
          "border-black/10 bg-black text-white",
        outline:
          "border-black/15 bg-white text-black/70",
        success:
          "border-green-200 bg-green-50 text-green-800",
        warn:
          "border-amber-200 bg-amber-50 text-amber-900",
        danger:
          "border-red-200 bg-red-50 text-red-700",
      },
    },
    defaultVariants: {
      variant: "eyebrow",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
