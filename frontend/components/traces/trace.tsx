"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Disc2 } from "lucide-react";
import React, { useRef, useState } from "react";

import { AgentSessionButton } from "@/components/traces/agent-session-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceView, { TraceViewHandle } from "@/components/traces/trace-view";
import { Button } from "@/components/ui/button";
import FiltersContextProvider from "@/components/ui/datatable-filter/context";
import Header from "@/components/ui/header";
import { IconLangGraph } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trace as TraceType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { TraceStatsShields } from "./stats-shields";

const Trace = ({ trace, projectId }: { trace: TraceType; projectId: string }) => {
  const traceViewRef = useRef<TraceViewHandle>(null);
  const [hasLangGraph, setHasLangGraph] = useState(false);

  return (
    <>
      <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-1 mr-2">
        <TraceStatsShields className="box-border sticky top-0 bg-background" trace={trace} />
        <div className="flex flex-1 gap-2 justify-end mr-2">
          {trace?.hasBrowserSession && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="hover:bg-secondary px-1.5"
                  variant="ghost"
                  onClick={() => {
                    if (traceViewRef.current) {
                      traceViewRef.current.toggleBrowserSession();
                    }
                  }}
                >
                  <Disc2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent>Toggle Browser Session</TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
          {hasLangGraph && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="hover:bg-secondary px-1.5"
                  variant="ghost"
                  onClick={() => {
                    if (traceViewRef.current) {
                      traceViewRef.current.toggleLangGraph();
                    }
                  }}
                >
                  <IconLangGraph className={cn("w-5 h-5 fill-white")} />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent>Toggle LangGraph</TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}

          {trace?.agentSessionId && <AgentSessionButton sessionId={trace.agentSessionId} />}
          <ShareTraceButton trace={{ id: trace.id, visibility: trace.visibility }} projectId={projectId} />
        </div>
      </Header>
      <FiltersContextProvider>
        <TraceView
          spanId={null}
          onLangGraphDetected={() => setHasLangGraph(true)}
          ref={traceViewRef}
          propsTrace={trace}
          fullScreen
          onClose={() => {}}
          traceId={trace.id}
        />
      </FiltersContextProvider>
    </>
  );
};

export default Trace;
