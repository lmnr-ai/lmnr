import { TooltipPortal } from "@radix-ui/react-tooltip";
import { DatabaseZap } from "lucide-react";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DebuggerCheckpointProps {
  span: TraceViewSpan;
}

// Read-only indicator marking LLM calls that were replayed from the source trace.
// The SDK owns the replay decision and tags replayed spans as CACHED (shared spec §9),
// so the indicator is derived purely from the span type — no store/provider needed.
export function DebuggerCheckpoint({ span }: DebuggerCheckpointProps) {
  if (span.spanType !== "CACHED") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center rounded-sm">
          <DatabaseZap className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="left" className="text-xs">
          Replayed from source trace
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
