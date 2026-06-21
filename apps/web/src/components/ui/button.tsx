'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Citizens Wear `Button`.
 *
 * Variants are tuned to the 50/20/30 paper/ink/gold palette:
 *   - `primary` — gold fill, ink label. Primary CTA.
 *   - `ink`     — ink fill, paper label. Secondary CTA / bottom-of-page.
 *   - `outline` — hairline border, ink label. Tertiary.
 *   - `ghost`   — no chrome. Used inside toolbars and nav.
 *   - `link`    — underlined, gold on hover. Inline prose CTAs.
 *
 * Pass `asChild` to render the variant styles onto a child element
 * (typically `<Link>`) without a wrapping `<button>`.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-gold text-ink shadow-sm hover:bg-gold-deep hover:text-paper',
        ink: 'bg-ink text-paper shadow-sm hover:bg-ink/90',
        outline:
          'border border-border bg-paper text-ink hover:border-gold hover:text-ink',
        ghost: 'text-ink hover:bg-paper-soft',
        link: 'text-ink underline-offset-4 hover:text-gold-deep hover:underline',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-10 px-5 py-2',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
