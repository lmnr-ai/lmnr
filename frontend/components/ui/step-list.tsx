import { ChevronRight } from "lucide-react";
import * as React from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Adapted from shadcn's `trace` component (radix flavor), sized to the agent chat's 13px density.

function StepList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="step-list"
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 *:has-[>[data-slot=step-line]]:flex *:has-[>[data-slot=step-line]]:w-fit *:has-[>[data-slot=step-line]]:max-w-full *:has-[>[data-slot=step-line]]:min-w-0 *:has-[>[data-slot=step-line]]:rounded-md *:has-[>[data-slot=step-line]]:text-left *:has-[>[data-slot=step-line]]:outline-none *:has-[>[data-slot=step-line]]:focus-visible:ring-3 *:has-[>[data-slot=step-line]]:focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}

function StepLine({
  className,
  status,
  ...props
}: React.ComponentProps<"span"> & {
  status?: "running" | "error" | "pending";
}) {
  return (
    <span
      data-slot="step-line"
      data-status={status}
      className={cn(
        "flex w-fit max-w-full min-w-0 items-center gap-2 text-[13px] text-muted-foreground transition-colors in-[a,button]:cursor-pointer in-[a:hover,button:hover]:text-foreground data-[status=error]:text-destructive-text data-[status=error]:in-[a:hover,button:hover]:text-destructive-text data-[status=pending]:opacity-60",
        className
      )}
      {...props}
    />
  );
}

function StepIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="step-icon"
      aria-hidden="true"
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 [[data-slot=step-title]~&]:-ml-1",
        className
      )}
      {...props}
    />
  );
}

function StepTitle({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="step-title" className={cn("min-w-0 truncate", className)} {...props} />;
}

function StepDescription({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="step-description"
      className={cn("shrink-0 text-muted-foreground/70 tabular-nums", className)}
      {...props}
    />
  );
}

// Controlled `open` requires `onOpenChange`, otherwise the reader's click could never toggle it.
function StepCollapsible({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Collapsible>, "asChild" | "open"> &
  (
    | { open?: undefined }
    | {
        open: boolean;
        onOpenChange: NonNullable<React.ComponentProps<typeof Collapsible>["onOpenChange"]>;
      }
  )) {
  return (
    <Collapsible data-slot="step-collapsible" className={cn("flex w-full min-w-0 flex-col", className)} {...props} />
  );
}

function StepCollapsibleTrigger({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof CollapsibleTrigger>, "asChild">) {
  return (
    <CollapsibleTrigger
      data-slot="step-collapsible-trigger"
      className={cn(
        "group/step-collapsible-trigger flex w-fit max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md text-left text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 has-[[data-status=error]]:text-destructive-text",
        className
      )}
      {...props}
    >
      {children}
      <StepIcon className="transition-transform group-aria-expanded/step-collapsible-trigger:rotate-90">
        <ChevronRight />
      </StepIcon>
    </CollapsibleTrigger>
  );
}

function StepCollapsibleContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof CollapsibleContent>, "asChild">) {
  return (
    <CollapsibleContent
      data-slot="step-collapsible-content"
      className="min-w-0 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
      {...props}
    >
      <div
        data-slot="step-collapsible-content-inner"
        className={cn(
          "mt-2 mb-1 ml-[calc(--spacing(1.75)-1px)] min-w-0 border-l pr-1 pl-4 text-[13px] leading-relaxed wrap-break-word text-muted-foreground",
          className
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

export {
  StepCollapsible,
  StepCollapsibleContent,
  StepCollapsibleTrigger,
  StepDescription,
  StepIcon,
  StepLine,
  StepList,
  StepTitle,
};
