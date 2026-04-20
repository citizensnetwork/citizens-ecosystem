"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Citizens Connect Button.
 *
 * Variants honour the existing visual language:
 *   - `gold`        — primary CTA, gold fill + gold-glow shadow (sign up, submit)
 *   - `ink`         — secondary primary on white/gold backgrounds
 *   - `outline`     — neutral ghosted action, border only
 *   - `ghost`       — compact nav/utility action
 *   - `link`        — inline text action with gold hover
 *   - `destructive` — irreversible (delete, logout red)
 *
 * Sizes track the established pill heights (xs for toolbar, sm default).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-60 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        gold:
          "gold-glow bg-[var(--gold)] text-black hover:brightness-105",
        ink:
          "bg-black text-white hover:bg-black/85",
        outline:
          "border border-black/15 bg-white text-black hover:border-black/40 hover:bg-black/[0.02]",
        ghost:
          "text-black/70 hover:bg-black/5 hover:text-black",
        link:
          "text-black underline-offset-4 hover:text-[var(--gold)] hover:underline",
        destructive:
          "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        xs: "h-7 px-2.5 text-xs",
        sm: "h-9 px-3.5",
        md: "h-10 px-4 py-2.5",
        lg: "h-11 px-5 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "gold",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
