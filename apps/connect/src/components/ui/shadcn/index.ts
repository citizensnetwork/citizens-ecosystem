/**
 * Barrel for Citizens Connect shadcn primitives.
 *
 * Keep these co-located under `components/ui/shadcn/` so the existing
 * (bespoke) UI files in `components/ui/` are easy to distinguish from
 * the shadcn baseline primitives. Import from `@/components/ui/shadcn`.
 */

export { Alert, AlertDescription, AlertTitle } from "./alert";
export { Badge, badgeVariants } from "./badge";
export { Button, buttonVariants, type ButtonProps } from "./button";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export { Input } from "./input";
export { Label } from "./label";
export { Separator } from "./separator";
export { Skeleton } from "./skeleton";
export { Textarea } from "./textarea";
