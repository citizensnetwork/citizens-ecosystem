import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Citizens Connect Input.
 *
 * Reuses the "rounded-xl, white background, focus-ring-black/10" form
 * style that's repeated throughout the auth screens. Dropping it here
 * as a primitive so forms stay consistent and future tweaks happen in
 * one place.
 */
const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-black/35 focus:border-black focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
