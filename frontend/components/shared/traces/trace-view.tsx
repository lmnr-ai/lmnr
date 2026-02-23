"use client";

import { CirclePlay } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";

import fullLogo from "@/assets/logo/logo.svg";
import Header from "@/components/shared/traces/header";
import SessionPlayer from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import List from "@/components/traces/trace-view/list";
import { ScrollContextProvider } from "@/components/traces/trace-view/scroll-context";
import TraceViewStoreProvider, {
  MIN_TREE_VIEW_WIDTH,
  type TraceViewSpan,
  type TraceViewTrace,
  useTraceViewStoreContext,
} from "@/components/traces/trace-view/store";
import Tree from "@/components/traces/trace-view/tree";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TraceViewProps {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
  onClose?: () => void;
}

export const PureTraceView = ({ trace, spans, onClose }: TraceViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();

  const {
    tab,
    setSpans,
    setTrace,
    selectedSpan,
    setSelectedSpan,
    browserSession,
    setBrowserSession,
    setLangGraph,
    langGraph,
    getHasLangGraph,
    hasBrowserSession,
    setHasBrowserSession,
    condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds,
  } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setSpans: state.setSpans,
    setTrace: state.setTrace,
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    setLangGraph: state.setLangGraph,
    langGraph: state.langGraph,
    getHasLangGraph: state.getHasLangGraph,
    hasBrowserSession: state.hasBrowserSession,
    setHasBrowserSession: state.setHasBrowserSession,
    condensedTimelineEnabled: state.condensedTimelineEnabled,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
  }));

  const { treeWidth, setTreeWidth } = useTraceViewStoreContext((state) => ({
    treeWidth: state.treeWidth,
    setTreeWidth: state.setTreeWidth,
  }));
  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const filteredSpansForStats = useMemo(() => {
    if (condensedTimelineVisibleSpanIds.size === 0) return undefined;
    return spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
  }, [spans, condensedTimelineVisibleSpanIds]);
  const llmSpanIds = useMemo(
    () => spans.filter((span) => span.spanType === SpanType.LLM).map((span) => span.spanId),
    [spans]
  );

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (span) {
        const params = new URLSearchParams(searchParams);
        params.set("spanId", span.spanId);
        router.push(`${pathName}?${params.toString()}`);
      }
      setSelectedSpan(span);
    },
    [pathName, router, searchParams, setSelectedSpan]
  );

  const handleResizeTreeView = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = treeWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(MIN_TREE_VIEW_WIDTH, startWidth + moveEvent.clientX - startX);
        setTreeWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [treeWidth, setTreeWidth]
  );

  useEffect(() => {
    if (trace.hasBrowserSession) {
      setHasBrowserSession(true);
      setBrowserSession(true);
    }
  }, []);

  useEffect(() => {
    const enrichedSpans = enrichSpansWithPending(spans);
    setSpans(enrichedSpans);
    setTrace(trace);

    const spanId = searchParams.get("spanId");
    const span = spans?.find((s) => s.spanId === spanId) || spans?.[0];

    if (span) {
      setSelectedSpan({ ...span, collapsed: false });
    }
  }, []);

  return (
    <ScrollContextProvider>
      <div className="flex flex-col h-full w-full overflow-hidden">
        {!onClose && (
          <div className="flex flex-none items-center border-b px-4 py-3.5 gap-2">
            <Link className="mr-2" href="/projects">
              <Image alt="Laminar logo" src={fullLogo} width={120} height={20} />
            </Link>
          </div>
        )}
        <div className="flex h-full w-full overflow-hidden">
          <div className="flex h-full flex-col flex-none relative" style={{ width: treeWidth }}>
            <Header onClose={onClose} />
            <ResizablePanelGroup id="shared-trace-panels" orientation="vertical">
              {condensedTimelineEnabled && (
                <>
                  <ResizablePanel defaultSize={200} minSize={80}>
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
                    "flex items-center gap-2 pb-2  border-b box-border transition-[padding] duration-200",
                    condensedTimelineEnabled ? "pl-2 pr-2" : "pl-2 pr-[96px]",
                    {
                      "pt-2": !onClose || condensedTimelineEnabled,
                    }
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <ViewDropdown />
                      <TraceStatsShields
                        className="min-w-0 overflow-hidden"
                        trace={trace}
                        spans={filteredSpansForStats}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        className={cn("h-6 px-1.5 text-xs", {
                          "border-primary text-primary": browserSession,
                        })}
                        variant="outline"
                        onClick={() => setBrowserSession(!browserSession)}
                      >
                        <CirclePlay size={14} className="mr-1" />
                        Media
                      </Button>
                      {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
                    </div>
                  </div>
                </div>
                {tab === "tree" && (
                  <div className="flex flex-1 h-full overflow-hidden relative">
                    <Tree traceId={trace.id} onSpanSelect={handleSpanSelect} isShared />
                  </div>
                )}
                {tab === "reader" && (
                  <div className="flex flex-1 h-full overflow-hidden relative">
                    <List traceId={trace.id} onSpanSelect={handleSpanSelect} isShared />
                  </div>
                )}
              </ResizablePanel>
              {browserSession && (
                <>
                  <ResizableHandle className="z-50" withHandle />
                  <ResizablePanel>
                    <SessionPlayer
                      onClose={() => setBrowserSession(false)}
                      hasBrowserSession={hasBrowserSession}
                      traceId={trace.id}
                      llmSpanIds={llmSpanIds}
                    />
                  </ResizablePanel>
                </>
              )}
              {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
            </ResizablePanelGroup>
            <div
              className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
              onMouseDown={handleResizeTreeView}
            >
              <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-colors" />
            </div>
          </div>
          <div className="grow overflow-hidden flex-wrap h-full w-full">
            {selectedSpan ? (
              <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={trace.id} />
            ) : (
              <div className="flex flex-col items-center justify-center size-full text-muted-foreground">
                <span className="text-xl font-medium mb-2">No span selected</span>
                <span className="text-base">Select a span from the trace tree to view its details</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </ScrollContextProvider>
  );
};

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider storeKey="shared-trace-view">
      <PureTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
