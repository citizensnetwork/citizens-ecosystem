import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Citizens Wear `Skeleton` — neutral placeholder pulse.
 * Used for loading states inside cards, lists, and the waitlist CTA.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-paper-soft',
        className,
      )}
      {...props}
    />
  );
}
