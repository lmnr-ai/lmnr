"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { has } from "lodash";
import { ChartNoAxesGantt, Disc, Disc2, Minus, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import smallLogo from "@/assets/logo/icon.svg";
import SessionPlayer, { SessionPlayerHandle } from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { AgentSessionButton } from "@/components/traces/agent-session-button";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view";
import LangGraphViewTrigger from "@/components/traces/trace-view/lang-graph-view-trigger";
import Minimap from "@/components/traces/trace-view/minimap";
import { ScrollContextProvider } from "@/components/traces/trace-view/scroll-context";
import Timeline from "@/components/traces/trace-view/timeline";
import Tree from "@/components/traces/trace-view/tree";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { Span, Trace } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TraceViewProps {
  trace: Trace;
  spans: Span[];
}

const MAX_ZOOM = 3;
const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;
const MIN_TREE_VIEW_WIDTH = 500;

export default function TraceView({ trace, spans }: TraceViewProps) {
  const searchParams = useSearchParams();

  const router = useRouter();
  const pathName = usePathname();

  const [showBrowserSession, setShowBrowserSession] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);
  const [showLangGraph, setShowLangGraph] = useState(true);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_INCREMENT, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_INCREMENT, MIN_ZOOM));
  }, []);

  const hasLangGraph = useMemo(
    () => !!spans.find((s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)),
    [spans]
  );

  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get("spanId")
      ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null
      : spans?.[0] || null
  );

  const [activeSpans, setActiveSpans] = useState<string[]>([]);

  // Add new state for collapsed spans
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [browserSessionTime, setBrowserSessionTime] = useState<number | null>(null);

  const { childSpans, topLevelSpans } = useMemo(() => {
    const childSpans = {} as { [key: string]: Span[] };

    const topLevelSpans = spans.filter((span: Span) => !span.parentSpanId);

    for (const span of spans) {
      if (span.parentSpanId) {
        if (!childSpans[span.parentSpanId]) {
          childSpans[span.parentSpanId] = [];
        }
        childSpans[span.parentSpanId].push(span);
      }
    }

    // Sort child spans for each parent by start time
    for (const parentId in childSpans) {
      childSpans[parentId].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    return {
      childSpans,
      topLevelSpans,
    };
  }, [spans]);

  const [treeViewWidth, setTreeViewWidth] = useState(MIN_TREE_VIEW_WIDTH);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const savedWidth = localStorage.getItem("trace-view:tree-view-width");
        if (savedWidth) {
          setTreeViewWidth(Math.max(MIN_TREE_VIEW_WIDTH, parseInt(savedWidth, 10)));
        }
      }
    } catch (e) { }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("trace-view:tree-view-width", treeViewWidth.toString());
      }
    } catch (e) { }
  }, [treeViewWidth]);

  useEffect(() => {
    if (trace.hasBrowserSession) {
      setShowBrowserSession(true);
    }
  }, []);

  const handleResizeTreeView = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = treeViewWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(MIN_TREE_VIEW_WIDTH, startWidth + moveEvent.clientX - startX);
        setTreeViewWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [treeViewWidth]
  );

  return (
    <ScrollContextProvider>
      <div className="flex flex-col h-full w-full overflow-clip">
        <div className="flex flex-none items-center border-b px-4 py-3.5 gap-2">
          <Link className="mr-2" href="/projects">
            <Image alt="Laminar AI logo" src={smallLogo} width={20} height={20} />
          </Link>
          <span>Trace</span>
          <TraceStatsShields className="bg-background z-50" trace={trace} />
          {trace?.hasBrowserSession && (
            <TooltipProvider>
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
            </TooltipProvider>
          )}
          {hasLangGraph && <LangGraphViewTrigger setOpen={setShowLangGraph} open={showLangGraph} />}
          {trace?.agentSessionId && <AgentSessionButton sessionId={trace.agentSessionId} />}
        </div>
        <div className="flex flex-col h-full w-full overflow-hidden">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel className="flex size-full">
              <div className="flex h-full flex-col flex-none relative" style={{ width: treeViewWidth }}>
                <div className="flex gap-2 px-2 py-2 h-10 border-b box-border">
                  <Button
                    onClick={() => setShowTimeline((prev) => !prev)}
                    variant="outline"
                    className={cn("h-6", {
                      "border-primary text-primary": showTimeline,
                    })}
                  >
                    <ChartNoAxesGantt className="w-4 h-4 mr-2" />
                    <span>Timeline</span>
                  </Button>
                  {showTimeline && (
                    <>
                      <Button
                        disabled={zoomLevel === MAX_ZOOM}
                        className="h-6 w-6 ml-auto"
                        variant="outline"
                        size="icon"
                        onClick={handleZoomIn}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        disabled={zoomLevel === MIN_ZOOM}
                        className="h-6 w-6"
                        variant="outline"
                        size="icon"
                        onClick={handleZoomOut}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
                {showTimeline ? (
                  <Timeline
                    setSelectedSpan={setSelectedSpan}
                    selectedSpan={selectedSpan}
                    spans={spans}
                    childSpans={childSpans}
                    collapsedSpans={collapsedSpans}
                    browserSessionTime={browserSessionTime}
                    zoomLevel={zoomLevel}
                  />
                ) : (
                  <div className="flex flex-1 overflow-hidden relative">
                    <Tree
                      topLevelSpans={topLevelSpans}
                      childSpans={childSpans}
                      activeSpans={activeSpans}
                      collapsedSpans={collapsedSpans}
                      containerWidth={treeViewWidth}
                      selectedSpan={selectedSpan}
                      trace={trace}
                      isSpansLoading={false}
                      onToggleCollapse={(spanId) => {
                        setCollapsedSpans((prev) => {
                          const next = new Set(prev);
                          if (next.has(spanId)) {
                            next.delete(spanId);
                          } else {
                            next.add(spanId);
                          }
                          return next;
                        });
                      }}
                      onSpanSelect={(span) => {
                        const params = new URLSearchParams(searchParams);
                        setSelectedSpan(span);
                        params.set("spanId", span.spanId);
                        router.push(`${pathName}?${params.toString()}`);
                      }}
                      onSelectTime={(time) => {
                        browserSessionRef.current?.goto(time);
                      }}
                    />
                    <Minimap
                      traceDuration={new Date(trace?.endTime || 0).getTime() - new Date(trace?.startTime || 0).getTime()}
                      setSelectedSpanId={(spanId) =>
                        setSelectedSpan(spans.find((span) => span.spanId === spanId) || null)
                      }
                      browserSessionTime={browserSessionTime}
                    />
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
            {showBrowserSession && (
              <>
                <ResizableHandle className="z-50" withHandle />
                <ResizablePanel
                  style={{
                    display: showBrowserSession ? "block" : "none",
                  }}
                >
                  <SessionPlayer
                    ref={browserSessionRef}
                    hasBrowserSession={trace.hasBrowserSession}
                    traceId={trace.id}
                    onTimelineChange={(time) => {
                      setBrowserSessionTime(time);

                      const activeSpans = spans.filter((span: Span) => {
                        const spanStartTime = new Date(span.startTime).getTime();
                        const spanEndTime = new Date(span.endTime).getTime();

                        return spanStartTime <= time && spanEndTime >= time && span.parentSpanId !== null;
                      });

                      setActiveSpans(activeSpans.map((span) => span.spanId));
                    }}
                  />
                </ResizablePanel>
              </>
            )}
            {showLangGraph && hasLangGraph && <LangGraphView spans={spans} />}
          </ResizablePanelGroup>
        </div>
      </div>
    </ScrollContextProvider>
  );
}
