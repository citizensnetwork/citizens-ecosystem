import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class-name helper used by every shadcn primitive.
 *
 * Keep this file colocated with other lib utilities — other primitives and
 * app code import it from `@/lib/cn`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
