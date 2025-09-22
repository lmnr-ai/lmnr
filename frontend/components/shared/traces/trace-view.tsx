"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { get } from "lodash";
import { ChartNoAxesGantt, CirclePlay, Minus, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";

import fullLogo from "@/assets/logo/logo.svg";
import SessionPlayer from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import Minimap from "@/components/traces/trace-view/minimap.tsx";
import { ScrollContextProvider } from "@/components/traces/trace-view/scroll-context";
import Timeline from "@/components/traces/trace-view/timeline";
import TraceViewStoreProvider, {
  MAX_ZOOM,
  MIN_TREE_VIEW_WIDTH,
  MIN_ZOOM,
  TraceViewSpan,
  TraceViewTrace,
  useTraceViewStoreContext,
} from "@/components/traces/trace-view/trace-view-store.tsx";
import Tree from "@/components/traces/trace-view/tree";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TraceViewProps {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
}

const PureTraceView = ({ trace, spans }: TraceViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();

  const {
    tab,
    setTab,
    setSpans,
    setTrace,
    selectedSpan,
    setSelectedSpan,
    browserSession,
    setBrowserSession,
    zoom,
    handleZoom,
    setBrowserSessionTime,
    setLangGraph,
    langGraph,
    getHasLangGraph,
    hasBrowserSession,
    setHasBrowserSession,
  } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    setSpans: state.setSpans,
    setTrace: state.setTrace,
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    search: state.search,
    setSearch: state.setSearch,
    searchEnabled: state.searchEnabled,
    setSearchEnabled: state.setSearchEnabled,
    zoom: state.zoom,
    handleZoom: state.setZoom,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    setBrowserSessionTime: state.setSessionTime,
    setLangGraph: state.setLangGraph,
    langGraph: state.langGraph,
    getHasLangGraph: state.getHasLangGraph,
    hasBrowserSession: state.hasBrowserSession,
    setHasBrowserSession: state.setHasBrowserSession,
  }));

  const { treeWidth, setTreeWidth } = useTraceViewStoreContext((state) => ({
    treeWidth: state.treeWidth,
    setTreeWidth: state.setTreeWidth,
    spanPath: state.spanPath,
    setSpanPath: state.setSpanPath,
  }));

  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const llmSpanIds = useMemo(
    () =>
      spans
        .filter((span) => span.spanType === SpanType.LLM)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .map((span) => span.spanId),
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
    if (spans.some((s) => Boolean(get(s.attributes, "lmnr.internal.has_browser_session")))) {
      setHasBrowserSession(true);
      setBrowserSession(true);
    }
  }, []);

  useEffect(() => {
    setSpans(spans);
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
        <div className="flex flex-none items-center border-b px-4 py-3.5 gap-2">
          <Link className="mr-2" href="/projects">
            <Image alt="Laminar AI logo" src={fullLogo} width={120} height={20} />
          </Link>
        </div>
        <div className="flex flex-col h-full w-full overflow-hidden">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel className="flex size-full">
              <div className="flex h-full flex-col flex-none relative" style={{ width: treeWidth }}>
                <div className="h-10 flex py-3 items-center border-b gap-x-2 px-2">
                  <TraceStatsShields className="bg-background z-50" trace={trace} />
                  <div className="flex items-center ml-auto">
                    <TooltipProvider>
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
                    </TooltipProvider>
                    {hasLangGraph && <LangGraphViewTrigger setOpen={setLangGraph} open={langGraph} />}
                  </div>
                </div>
                <div className="flex gap-2 px-2 py-2 h-10 border-b box-border">
                  <Button
                    onClick={() => setTab("timeline")}
                    variant="outline"
                    className={cn("h-6 text-xs px-1.5", {
                      "border-primary text-primary": tab === "timeline",
                    })}
                  >
                    <ChartNoAxesGantt size={14} className="mr-1" />
                    <span>Timeline</span>
                  </Button>
                  {tab === "timeline" && (
                    <>
                      <Button
                        disabled={zoom === MAX_ZOOM}
                        className="h-6 w-6 ml-auto"
                        variant="outline"
                        size="icon"
                        onClick={() => handleZoom("in")}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        disabled={zoom === MIN_ZOOM}
                        className="h-6 w-6"
                        variant="outline"
                        size="icon"
                        onClick={() => handleZoom("out")}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
                {tab === "timeline" && <Timeline />}
                {tab === "tree" && (
                  <div className="flex flex-1 overflow-hidden relative">
                    <Tree onSpanSelect={handleSpanSelect} />
                    <Minimap onSpanSelect={handleSpanSelect} />
                  </div>
                )}
                <div
                  className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
                  onMouseDown={handleResizeTreeView}
                >
                  <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-colors" />
                </div>
              </div>
              {selectedSpan && (
                <div className="flex-grow overflow-hidden flex-wrap">
                  <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={trace.id} />
                </div>
              )}
            </ResizablePanel>
            {browserSession && (
              <>
                <ResizableHandle className="z-50" withHandle />
                <ResizablePanel
                  style={{
                    display: browserSession ? "block" : "none",
                  }}
                >
                  <SessionPlayer
                    onClose={() => setBrowserSession(false)}
                    hasBrowserSession={hasBrowserSession}
                    traceId={trace.id}
                    llmSpanIds={llmSpanIds}
                    onTimelineChange={setBrowserSessionTime}
                  />
                </ResizablePanel>
              </>
            )}
            {langGraph && hasLangGraph && <LangGraphView spans={spans} />}
          </ResizablePanelGroup>
        </div>
      </div>
    </ScrollContextProvider>
  );
};

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider>
      <PureTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
