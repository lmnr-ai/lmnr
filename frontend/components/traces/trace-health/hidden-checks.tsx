import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type TraceHealthCheck, type TraceHealthCheckResult } from "@/lib/trace-health/checks";
import { cn } from "@/lib/utils";

interface HiddenChecksProps {
  items: { check: TraceHealthCheck; result: TraceHealthCheckResult }[];
  onUnhide: (check: TraceHealthCheck) => void;
}

export default function HiddenChecks({ items, onUnhide }: HiddenChecksProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border hover:overlay-hover has-[>button:focus-visible]:ring-1 has-[>button:focus-visible]:ring-ring"
    >
      <CollapsibleTrigger className="flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">
            {items.length} hidden {items.length === 1 ? "check" : "checks"}
          </span>
          <span className="text-xs text-muted-foreground">Hidden for everyone in this project.</span>
        </div>
        <ChevronDown
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-1 px-3 pb-2 pl-10">
          {items.map(({ check, result }) => (
            <div key={check.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-secondary-foreground">{check.name}</span>
              <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                {result.failing > 0
                  ? `${result.failing.toLocaleString()} of ${result.applicable.toLocaleString()} ${check.unit}`
                  : "Passing"}
                <Button variant="ghost" className="h-7 text-muted-foreground" onClick={() => onUnhide(check)}>
                  <Eye className="mr-1.5 size-3.5" />
                  Unhide
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
