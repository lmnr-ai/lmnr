import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowDown, Circle, Lock } from "lucide-react";
import { type MouseEvent } from "react";

import { useRolloutCaching } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BreakpointIndicatorProps {
  span: TraceViewSpan;
}

export function BreakpointIndicator({ span }: BreakpointIndicatorProps) {
  const {
    enabled,
    state: { isSpanCached, isBreakpointSpan, setBreakpoint, clearBreakpoint },
  } = useRolloutCaching((s) => ({
    isSpanCached: s.isSpanCached,
    isBreakpointSpan: s.isBreakpointSpan,
    setBreakpoint: s.setBreakpoint,
    clearBreakpoint: s.clearBreakpoint,
  }));

  if (!enabled) return null;
  if (span.spanType !== "LLM" && span.spanType !== "CACHED") return null;

  const isCached = isSpanCached(span);
  const isBreakpoint = isBreakpointSpan(span);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (isBreakpoint) {
      clearBreakpoint();
    } else {
      setBreakpoint(span);
    }
  };

  const icon = isCached ? (
    <Lock className="h-3.5 w-3.5 text-primary" />
  ) : isBreakpoint ? (
    <ArrowDown className="h-3.5 w-3.5 text-success" />
  ) : (
    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
  );

  const tooltipText = isCached
    ? "Locked — will use cached response"
    : isBreakpoint
      ? "Unset start span"
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
