"use client";

import { ChartNoAxesGantt, Disc } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useMemo, useRef } from "react";

import { AgentSessionButton } from "@/components/traces/agent-session-button";
import ShareTraceButton from "@/components/traces/share-trace-button";
import TraceView, { TraceViewHandle } from "@/components/traces/trace-view/trace-view";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { Trace as TraceType } from "@/lib/traces/types";

const Trace = ({ trace, projectId }: { trace: TraceType; projectId: string }) => {
  const searchParams = useSearchParams();
  const showTimeline = useMemo(() => !!searchParams.get("spanId"), [searchParams]);
  const traceViewRef = useRef<TraceViewHandle>(null);

  return (
    <>
      <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-1 mr-2">
        <div className="flex gap-2 ml-auto">
          {showTimeline && (
            <Button
              variant={"secondary"}
              onClick={() => {
                if (traceViewRef?.current) {
                  traceViewRef.current.resetSelectedSpan();
                }
              }}
            >
              <ChartNoAxesGantt size={16} className="mr-2" />
              Show timeline
            </Button>
          )}
          {trace?.hasBrowserSession && (
            <Button
              variant={"secondary"}
              onClick={() => {
                if (traceViewRef.current) {
                  traceViewRef.current.toggleBrowserSession();
                }
              }}
            >
              <Disc size={16} className="mr-2" />
              Toggle browser session
            </Button>
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
