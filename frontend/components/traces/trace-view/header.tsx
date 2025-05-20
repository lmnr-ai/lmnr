import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ChevronsRight, Disc, Disc2, Expand } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { memo } from "react";

import { AgentSessionButton } from "@/components/traces/agent-session-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import StatsShields from "@/components/traces/stats-shields";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { Span, Trace } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface HeaderProps {
  selectedSpan: Span | null;
  trace: Trace | null;
  fullScreen: boolean;
  handleClose: () => void;
  showBrowserSession: boolean;
  setShowBrowserSession: (showBrowserSession: boolean) => void;
  handleFetchTrace: () => void;
}

const Header = ({
  selectedSpan,
  trace,
  fullScreen,
  handleClose,
  showBrowserSession,
  setShowBrowserSession,
  handleFetchTrace,
}: HeaderProps) => {
  const params = useParams();
  const projectId = params?.projectId as string;
  const { toast } = useToast();

  const copyTraceId = () => {
    if (trace) {
      navigator.clipboard.writeText(trace.id);
      toast({
        title: "Copied trace ID",
        description: "Trace ID has been copied to clipboard",
        variant: "default",
      });
    }
  };

  if (fullScreen) {
    return null;
  }

  return (
    <div className="h-12 flex py-3 items-center border-b gap-x-2 px-4">
      <Button variant={"ghost"} className="px-0" onClick={handleClose}>
        <ChevronsRight />
      </Button>
      <Link
        passHref
        href={`/project/${projectId}/traces/${trace?.id}${selectedSpan ? `?spanId=${selectedSpan.spanId}` : ""}`}
      >
        <Button variant="ghost" className="px-0 mr-1">
          <Expand className="w-4 h-4" size={16} />
        </Button>
      </Link>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="cursor-pointer"
              onClick={copyTraceId}
            >
              Trace
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click to copy trace ID</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {trace && (
        <StatsShields
          className="box-border sticky top-0 bg-background"
          startTime={trace.startTime}
          endTime={trace.endTime}
          totalTokenCount={trace.totalTokenCount}
          inputTokenCount={trace.inputTokenCount}
          outputTokenCount={trace.outputTokenCount}
          inputCost={trace.inputCost}
          outputCost={trace.outputCost}
          cost={trace.cost}
        />
      )}
      <div className="flex gap-x-1 items-center ml-auto">
        {trace?.hasBrowserSession && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="hover:bg-secondary px-1.5"
                variant="ghost"
                onClick={() => {
                  setShowBrowserSession(!showBrowserSession);
                }}
              >
                {showBrowserSession ? (
                  <Disc2 className={cn({ "text-primary w-4 h-4": showBrowserSession })} />
                ) : (
                  <Disc className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent>{showBrowserSession ? "Hide Browser Session" : "Show Browser Session"}</TooltipContent>
            </TooltipPortal>
          </Tooltip>
        )}

        {trace?.agentSessionId && <AgentSessionButton sessionId={trace.agentSessionId} />}
        {trace && (
          <ShareTraceButton
            refetch={handleFetchTrace}
            trace={{ id: trace.id, visibility: trace?.visibility }}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
};

export default memo(Header);
