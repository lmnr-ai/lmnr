"use client";

import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import Header from "@/components/shared/traces/header";
import SessionPlayer from "@/components/shared/traces/session-player";
import StatsRow from "@/components/shared/traces/stats-row";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import Transcript from "@/components/traces/trace-view/transcript";
import Tree from "@/components/traces/trace-view/tree";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

interface TracePanelProps {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
  onClose?: () => void;
  onSpanSelect: (span?: TraceViewSpan) => void;
}

export default function TracePanel({ trace, spans, onClose, onSpanSelect }: TracePanelProps) {
  const {
    tab,
    browserSession,
    setBrowserSession,
    langGraph,
    getHasLangGraph,
    hasBrowserSession,
    condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds,
    isResizing,
    setIsResizing,
  } = useTraceViewStore(
    (state) => ({
      tab: state.tab,
      browserSession: state.browserSession,
      setBrowserSession: state.setBrowserSession,
      langGraph: state.langGraph,
      getHasLangGraph: state.getHasLangGraph,
      hasBrowserSession: state.hasBrowserSession,
      condensedTimelineEnabled: state.condensedTimelineEnabled,
      condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
      isResizing: state.isResizing,
      setIsResizing: state.setIsResizing,
    }),
    shallow
  );

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const filteredSpansForStats = useMemo(() => {
    if (condensedTimelineVisibleSpanIds.size === 0) return undefined;
    return spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
  }, [spans, condensedTimelineVisibleSpanIds]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Timeline toggle lives in StatsRow while closed; the header only renders the close X. */}
      <Header onClose={onClose} isHideTimelineControls={!condensedTimelineEnabled} />
      <ResizablePanelGroup
        id="shared-trace-panels"
        orientation="vertical"
        // pointer-events-none during a drag so the rrweb iframe can't swallow the pointer stream.
        className={cn("flex-1 min-h-0", isResizing && "pointer-events-none")}
      >
        {condensedTimelineEnabled && (
          <>
            <ResizablePanel defaultSize={200} minSize={80}>
              <div className="border-t h-full">
                <CondensedTimeline />
              </div>
            </ResizablePanel>
            <ResizableHandle
              onDragChange={setIsResizing}
              className="hover:bg-blue-400 z-10 transition-colors hover:scale-200"
            />
          </>
        )}
        <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
          <StatsRow
            trace={trace}
            spans={filteredSpansForStats}
            hasLangGraph={hasLangGraph}
            className={cn({ "pt-2": !onClose || condensedTimelineEnabled })}
          />
          {tab === "tree" ? (
            <div className="flex flex-1 h-full overflow-hidden relative">
              <Tree onSpanSelect={onSpanSelect} isShared />
            </div>
          ) : (
            // Any other persisted tab ("custom" isn't available here) falls back to transcript.
            <div className="flex flex-1 h-full overflow-hidden relative">
              <Transcript onSpanSelect={onSpanSelect} isShared />
            </div>
          )}
        </ResizablePanel>
        {browserSession && hasBrowserSession && (
          <>
            <ResizableHandle onDragChange={setIsResizing} className="z-50" withHandle />
            <ResizablePanel>
              <SessionPlayer onClose={() => setBrowserSession(false)} traceId={trace.id} />
            </ResizablePanel>
          </>
        )}
        {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
      </ResizablePanelGroup>
    </div>
  );
}
