"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Disc2 } from "lucide-react";
import React, { useRef } from "react";

import { AgentSessionButton } from "@/components/traces/agent-session-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import StatsShields from "@/components/traces/stats-shields";
import TraceView, { TraceViewHandle } from "@/components/traces/trace-view";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trace as TraceType } from "@/lib/traces/types";

const Trace = ({ trace, projectId }: { trace: TraceType; projectId: string }) => {
  const traceViewRef = useRef<TraceViewHandle>(null);

  return (
    <>
      <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-1 mr-2">
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

          {trace?.agentSessionId && <AgentSessionButton sessionId={trace.agentSessionId} />}
          <ShareTraceButton trace={{ id: trace.id, visibility: trace.visibility }} projectId={projectId} />
        </div>
      </Header>
      <TraceView ref={traceViewRef} propsTrace={trace} fullScreen onClose={() => {}} traceId={trace.id} />
    </>
  );
};

export default Trace;
