"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import * as React from "react";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }
>(({ className, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    {...props}
  >
    <ProgressPrimitive.Track className="h-full w-full">
      <ProgressPrimitive.Indicator className={cn("h-full bg-primary transition-all", indicatorClassName)} />
    </ProgressPrimitive.Track>
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export { Progress };
