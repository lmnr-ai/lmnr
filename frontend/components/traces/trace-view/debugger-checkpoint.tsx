import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowDown, Circle, DatabaseZap } from "lucide-react";
import { type MouseEvent } from "react";

import { useOptionalDebuggerStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DebuggerCheckpointProps {
  span: TraceViewSpan;
}

export function DebuggerCheckpoint({ span }: DebuggerCheckpointProps) {
  const {
    enabled,
    state: { isSpanCached, isCheckpointSpan, setCheckpoint, clearCheckpoint },
  } = useOptionalDebuggerStore((s) => ({
    isSpanCached: s.isSpanCached,
    isCheckpointSpan: s.isCheckpointSpan,
    setCheckpoint: s.setCheckpoint,
    clearCheckpoint: s.clearCheckpoint,
  }));

  if (!enabled) return null;
  if (span.spanType !== "LLM" && span.spanType !== "CACHED") return null;

  const isCached = isSpanCached(span);
  const isCheckpoint = isCheckpointSpan(span);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (isCheckpoint) {
      clearCheckpoint();
    } else {
      setCheckpoint(span);
    }
  };

  const icon = isCached ? (
    <DatabaseZap className="h-3.5 w-3.5 text-muted-foreground" />
  ) : isCheckpoint ? (
    <ArrowDown className="h-3.5 w-3.5 text-success" />
  ) : (
    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
  );

  const tooltipText = isCached
    ? "Cached — will replay the recorded response instead of calling the model"
    : isCheckpoint
      ? "Unset checkpoint"
      : "Run from here";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="z-30 hover:bg-muted transition-all rounded-sm"
          onClick={handleClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="left" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
