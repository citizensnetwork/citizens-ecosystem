/**
 * Barrel export for Citizens Wear shadcn-derived UI primitives.
 *
 * Components here live *in this app* (not in `@citizens-wear/ui`) so the
 * Replit-inspired redesign can iterate quickly without churning the
 * shared package. Stable primitives graduate up into `@citizens-wear/ui`
 * once they're in use by more than one app.
 */
export { Button, buttonVariants, type ButtonProps } from './button';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export { Separator } from './separator';
export { Skeleton } from './skeleton';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  type SheetContentProps,
} from './sheet';
