import { ChevronDown, CircleX, Info, SquareArrowOutUpRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button";
import { TRACE_HEALTH_CATEGORIES, type TraceHealthCheck, type TraceHealthCheckResult } from "@/lib/trace-health/checks";
import { buildFixPrompt } from "@/lib/trace-health/prompt";
import { cn } from "@/lib/utils";

interface CheckRowProps {
  check: TraceHealthCheck;
  result: TraceHealthCheckResult;
  onOpenTrace: (traceId: string) => void;
}

export default function CheckRow({ check, result, onOpenTrace }: CheckRowProps) {
  const [open, setOpen] = useState(false);
  const sampleTraceId = result.sampleTraceId;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:overlay-hover">
        {TRACE_HEALTH_CATEGORIES[check.category].advisory ? (
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <CircleX className="mt-0.5 size-4 shrink-0 text-destructive-text" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{check.title}</span>
          <span className="text-xs text-muted-foreground">{check.impact}</span>
        </div>
        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
          {result.failing.toLocaleString()} of {result.applicable.toLocaleString()} {check.unit}
        </span>
        <ChevronDown
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-3 pb-3 pl-10">
        <p className="text-xs text-secondary-foreground">Fix: {check.fix}</p>
        <div className="flex items-center gap-2">
          <CopyButton text={buildFixPrompt([result])} iconClassName="size-3.5">
            Copy prompt
          </CopyButton>
          {sampleTraceId && (
            <Button variant="ghost" className="text-muted-foreground" onClick={() => onOpenTrace(sampleTraceId)}>
              View example trace
              <SquareArrowOutUpRight className="ml-1.5 size-3.5" />
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
