import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ChevronDown, CirclePlay, Copy, Database, Loader } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo, useCallback } from "react";

import CondensedTimelineControls from "@/components/rollout-sessions/rollout-session-view/condensed-timeline-toggle";
import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { useOpenInSql } from "@/components/traces/trace-view/use-open-in-sql.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { TraceStatsShields } from "../../traces/stats-shields";

const Header = () => {
  const params = useParams();
  const projectId = params?.projectId as string;
  const { trace, browserSession, setBrowserSession } = useRolloutSessionStoreContext((state) => ({
    trace: state.trace,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
  }));

  const { toast } = useToast();
  const { openInSql, isLoading } = useOpenInSql({
    projectId: projectId as string,
    params: { type: "trace", traceId: String(trace?.id) },
  });

  const handleCopyTraceId = useCallback(async () => {
    if (trace?.id) {
      await navigator.clipboard.writeText(trace.id);
      toast({ title: "Copied trace ID", duration: 1000 });
    }
  }, [trace?.id, toast]);

  return (
    <div className="h-10 min-h-10 flex items-center gap-x-2 px-2 border-b relative">
      <CondensedTimelineControls />
      {trace && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-6 px-1 text-base font-medium focus-visible:outline-0">
              Trace
              <ChevronDown className="ml-1 size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleCopyTraceId}>
              <Copy size={14} />
              Copy trace ID
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLoading} onClick={openInSql}>
              {isLoading ? <Loader className="size-3.5" /> : <Database className="size-3.5" />}
              Open in SQL editor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {trace && <TraceStatsShields className="box-border sticky top-0 bg-background" trace={trace} />}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!trace}
            className="hover:bg-secondary px-1.5"
            variant="ghost"
            onClick={() => setBrowserSession(!browserSession)}
          >
            <CirclePlay className={cn("w-4 h-4", { "text-primary": browserSession })} />
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{browserSession ? "Hide Media Viewer" : "Show Media Viewer"}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </div>
  );
};

export default memo(Header);
