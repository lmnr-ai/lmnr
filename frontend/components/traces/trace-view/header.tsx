import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronsRight, ChevronUp, CirclePlay, Expand } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useMemo } from "react";

import ShareTraceButton from "@/components/traces/share-trace-button";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { TraceStatsShields } from "../stats-shields";

interface HeaderProps {
  handleClose: () => void;
}

const Header = ({ handleClose }: HeaderProps) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params?.projectId as string;
  const { toast } = useToast();
  const { navigateDown, navigateUp } = useTraceViewNavigation();
  const { trace, browserSession, setBrowserSession, langGraph, setLangGraph, getHasLangGraph } =
    useTraceViewStoreContext((state) => ({
      trace: state.trace,
      browserSession: state.browserSession,
      setBrowserSession: state.setBrowserSession,
      langGraph: state.langGraph,
      setLangGraph: state.setLangGraph,
      getHasLangGraph: state.getHasLangGraph,
    }));

  const fullScreenParams = useMemo(() => {
    const ps = new URLSearchParams(searchParams);
    if (params.evaluationId) {
      ps.set("evaluationId", params.evaluationId as string);
    }
    return ps;
  }, [params.evaluationId, searchParams]);

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);

  const copyTraceId = useCallback(() => {
    if (trace) {
      navigator.clipboard.writeText(trace.id);
      toast({
        title: "Copied trace ID",
        description: "Trace ID has been copied to clipboard",
        variant: "default",
      });
    }
  }, [toast, trace]);

  return (
    <div className="h-10 flex py-3 items-center border-b gap-x-2 px-3">
      {!params?.traceId && (
        <>
          <Button variant={"ghost"} className="px-0" onClick={handleClose}>
            <ChevronsRight />
          </Button>
          <Link passHref href={`/project/${projectId}/traces/${trace?.id}?${fullScreenParams.toString()}`}>
            <Button variant="ghost" className="px-0 mr-1">
              <Expand className="w-4 h-4" size={16} />
            </Button>
          </Link>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-pointer" onClick={copyTraceId}>
                  Trace
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Click to copy trace ID</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
      {trace && <TraceStatsShields className="box-border sticky top-0 bg-background" trace={trace} />}
      <div className="flex items-center ml-auto">
        {!params?.traceId && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={navigateDown} className="hover:bg-secondary px-1.5" variant="ghost">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent className="flex items-center">
                  Navigate down (
                  <kbd className="inline-flex items-center justify-center w-3 h-3 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-lg shadow-md">
                    j
                  </kbd>
                  )
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={navigateUp} className="hover:bg-secondary px-1.5" variant="ghost">
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent className="flex items-center">
                  Navigate up (
                  <kbd className="inline-flex items-center justify-center w-3 h-3 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-lg shadow-md">
                    k
                  </kbd>
                  )
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
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
        {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
        {trace && <ShareTraceButton projectId={projectId} />}
      </div>
    </div>
  );
};

export default memo(Header);
