import { AlertTriangle, CirclePlay } from "lucide-react";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { TraceStatsShields } from "@/components/traces/stats-shields";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view.tsx";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import { type TraceViewSpan, useTraceViewStore } from "@/components/traces/trace-view/store";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import SessionPlayer from "../session-player";
import CondensedTimeline from "./condensed-timeline";
import Header from "./header";
import Transcript from "./transcript";
import Tree from "./tree";

interface TracePanelProps {
  traceId: string;
  handleClose: () => void;
  handleSpanSelect: (span?: TraceViewSpan) => void;
  fetchSpans: (search: string, filters: Filter[]) => void;
  isLoading: boolean;
}

export default function TracePanel({ traceId, handleClose, handleSpanSelect, fetchSpans, isLoading }: TracePanelProps) {
  const {
    trace,
    spans,
    traceError,
    spansError,
    tab,
    browserSession,
    setBrowserSession,
    langGraph,
    setLangGraph,
    getHasLangGraph,
    hasBrowserSession,
    condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds,
  } = useTraceViewStore(
    (state) => ({
      trace: state.trace,
      spans: state.spans,
      traceError: state.traceError,
      spansError: state.spansError,
      tab: state.tab,
      browserSession: state.browserSession,
      setBrowserSession: state.setBrowserSession,
      langGraph: state.langGraph,
      setLangGraph: state.setLangGraph,
      getHasLangGraph: state.getHasLangGraph,
      hasBrowserSession: state.hasBrowserSession,
      condensedTimelineEnabled: state.condensedTimelineEnabled,
      condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
    }),
    shallow
  );

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const filteredSpansForStats = useMemo(() => {
    if (condensedTimelineVisibleSpanIds.size === 0) return undefined;
    return spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
  }, [spans, condensedTimelineVisibleSpanIds]);
  const llmSpanIds = useMemo(
    () => spans.filter((span) => span.spanType === SpanType.LLM).map((span) => span.spanId),
    [spans]
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1">
      <Header
        handleClose={handleClose}
        spans={spans}
        onSearch={(filters, search) => fetchSpans(search, filters)}
        traceId={traceId}
      />

      {isLoading ? (
        <div className="flex flex-col p-2 gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : traceError ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="max-w-md mx-auto">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-destructive mb-4">Error Loading Trace</h3>
            <p className="text-sm text-muted-foreground">{traceError}</p>
          </div>
        </div>
      ) : spansError ? (
        <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
          <h4 className="text-sm font-semibold text-destructive mb-2">Error Loading Spans</h4>
          <p className="text-xs text-muted-foreground">{spansError}</p>
        </div>
      ) : (
        <ResizablePanelGroup id="trace-view-panels" orientation="vertical" className="flex-1 min-h-0">
          {condensedTimelineEnabled && (
            <>
              <ResizablePanel defaultSize={120} minSize={80}>
                <div className="border-t h-full">
                  <CondensedTimeline />
                </div>
              </ResizablePanel>
              <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200" />
            </>
          )}
          <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
            <div
              className={cn(
                "flex items-center gap-2 pb-2 border-b box-border transition-[padding] duration-200",
                condensedTimelineEnabled ? "pt-2 pl-2 pr-2" : "pt-0 pl-2 pr-[96px]"
              )}
            >
              <div className="flex items-center justify-between gap-2 w-full min-w-0">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  <ViewDropdown />
                  {trace && (
                    <TraceStatsShields
                      className="min-w-0 overflow-hidden"
                      trace={trace}
                      spans={filteredSpansForStats}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <Button
                    disabled={!trace}
                    className={cn("h-6 px-1.5 text-xs overflow-hidden", {
                      "border-primary text-primary": browserSession,
                    })}
                    variant="outline"
                    onClick={() => setBrowserSession(!browserSession)}
                  >
                    <CirclePlay size={14} className="flex-shrink-0" />
                    <span className="ml-1 truncate">Media</span>
                  </Button>
                  {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
                </div>
              </div>
            </div>
            {tab === "transcript" && (
              <div className="flex flex-1 h-full overflow-hidden relative">
                <Transcript onSpanSelect={handleSpanSelect} />
              </div>
            )}
            {tab === "tree" && (
              <div className="flex flex-1 h-full overflow-hidden relative">
                <Tree onSpanSelect={handleSpanSelect} />
              </div>
            )}
          </ResizablePanel>
          {browserSession && (
            <>
              <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200" />
              <ResizablePanel>
                {!isLoading && (
                  <SessionPlayer
                    onClose={() => setBrowserSession(false)}
                    hasBrowserSession={hasBrowserSession}
                    traceId={traceId}
                    llmSpanIds={llmSpanIds}
                  />
                )}
              </ResizablePanel>
            </>
          )}
          {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
        </ResizablePanelGroup>
      )}
    </div>
  );
}
