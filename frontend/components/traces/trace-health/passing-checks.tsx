import { ChevronDown, CircleCheck } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type TraceHealthCheck, type TraceHealthCheckResult } from "@/lib/trace-health/checks";
import { cn } from "@/lib/utils";

interface PassingChecksProps {
  items: { check: TraceHealthCheck; result: TraceHealthCheckResult }[];
}

export default function PassingChecks({ items }: PassingChecksProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:overlay-hover">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-text" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">
            {items.length} {items.length === 1 ? "check looks" : "checks look"} good
          </span>
          <span className="text-xs text-muted-foreground">Nothing to change here.</span>
        </div>
        <ChevronDown
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1.5 px-3 pb-3 pl-10">
        {items.map(({ check, result }) => (
          <div key={check.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-secondary-foreground">{check.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {result.applicable === 0 ? `No ${check.unit}` : `${result.applicable.toLocaleString()} ${check.unit}`}
            </span>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
