import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Citizens Wear `Badge` — compact status/label pill.
 *
 *   - `default`  → paper-soft with muted ink. Quiet metadata.
 *   - `gold`     → gold-muted with gold-deep label. Signature accent pill.
 *   - `ink`      → ink fill with paper label. Solid CTA-adjacent badges.
 *   - `outline`  → hairline border, transparent. Taxonomy tags.
 *   - `verified` → gold with a bold check glyph-friendly layout.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-paper-soft text-ink-soft',
        gold: 'bg-gold-muted text-gold-deep',
        ink: 'bg-ink text-paper',
        outline: 'border border-border text-ink-soft',
        verified:
          'border border-gold/40 bg-paper text-gold-deep',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}
