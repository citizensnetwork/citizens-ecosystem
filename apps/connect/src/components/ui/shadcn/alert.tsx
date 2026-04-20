import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Citizens Connect Alert.
 *
 * Replaces the recurring `<div className="rounded-xl border border-red-200 ...">`
 * inline blocks used for form error / success / info messages across
 * auth and forms.
 */
const alertVariants = cva(
  "relative w-full rounded-xl border px-3.5 py-2.5 text-sm [&>svg]:absolute [&>svg]:left-3.5 [&>svg]:top-3 [&>svg]:size-4 [&>svg~*]:pl-6",
  {
    variants: {
      variant: {
        info:
          "border-black/10 bg-white text-black/75",
        gold:
          "border-[var(--gold)]/50 bg-[var(--gold-soft)] text-black/85",
        success:
          "border-green-200 bg-green-50/90 text-green-800",
        warn:
          "border-amber-200 bg-amber-50/90 text-amber-900",
        destructive:
          "border-red-200 bg-red-50/90 text-red-700",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-0.5 font-semibold leading-none", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm leading-snug", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
