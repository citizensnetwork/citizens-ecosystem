/**
 * Tailwind-class merging utility.
 *
 * Combines `clsx` (conditional class joining) with `tailwind-merge`
 * (resolves conflicting Tailwind classes so later classes win) so
 * shadcn-style primitives accept `className` overrides cleanly.
 *
 * Imported by every shadcn-derived component under `src/components/ui/*`.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
