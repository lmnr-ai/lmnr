import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-hidden focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary hover:bg-primary/25",
        secondary: "border-transparent bg-muted text-secondary-foreground hover:bg-accent",
        destructive: "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/25",
        outline: "text-foreground border-border",
        outlinePrimary: "text-primary border-primary/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
