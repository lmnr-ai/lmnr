"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import { ChartNoAxesGantt, Disc } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import smallLogo from "@/assets/logo/icon.svg";
import SessionPlayer, { SessionPlayerHandle } from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { AgentSessionButton } from "@/components/traces/agent-session-button";
import { SpanCard } from "@/components/traces/span-card";
import StatsShields from "@/components/traces/stats-shields";
import Timeline from "@/components/traces/timeline";
import { Button } from "@/components/ui/button";
import MonoWithCopy from "@/components/ui/mono-with-copy";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Span, Trace } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TraceViewProps {
  trace: Trace;
  spans: Span[];
}

export default function TraceView({ trace, spans }: TraceViewProps) {
  const params = useSearchParams();
  const searchParams = useMemo(() => new URLSearchParams(params.toString()), [params]);

  const router = useRouter();
  const pathName = usePathname();

  const container = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const traceTreePanel = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [showBrowserSession, setShowBrowserSession] = useState(false);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const [childSpans, setChildSpans] = useState<{ [key: string]: Span[] }>({});
  const [topLevelSpans, setTopLevelSpans] = useState<Span[]>([]);

  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get("spanId") ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null : null
  );

  const [activeSpans, setActiveSpans] = useState<string[]>([]);

  // Add new state for collapsed spans
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [browserSessionTime, setBrowserSessionTime] = useState<number | null>(null);

  useEffect(() => {
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

    setChildSpans(childSpans);
    setTopLevelSpans(topLevelSpans);
  }, [spans]);

  useEffect(() => {
    setSelectedSpan(
      searchParams.get("spanId") ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null : null
    );
  }, [searchParams, spans]);

  useEffect(() => {
    if (!container.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerHeight(height);
        setContainerWidth(width);
      }
    });
    resizeObserver.observe(container.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [container.current]);

  useEffect(() => {
    if (!traceTreePanel.current) {
      return;
    }
    const newTraceTreePanelWidth = traceTreePanel.current.getBoundingClientRect().width;

    // if no span is selected, timeline should take full width
    if (!selectedSpan) {
      setTimelineWidth(containerWidth);
    } else {
      // if a span is selected, waterfall is hidden, so timeline should take the width of the trace tree panel
      setTimelineWidth(newTraceTreePanelWidth + 1);
    }
  }, [containerWidth, selectedSpan, traceTreePanel.current, collapsedSpans]);

  const [treeViewWidth, setTreeViewWidth] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        const savedWidth = localStorage.getItem("trace-view:tree-view-width");
        return savedWidth ? parseInt(savedWidth, 10) : 384;
      }
      return 384;
    } catch (e) {
      return 384;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("trace-view:tree-view-width", treeViewWidth.toString());
      }
    } catch (e) {}
  }, [treeViewWidth]);

  const maxY = useRef(0);

  const recFn = (
    treeElements: React.ReactNode[],
    span: Span,
    activeSpans: string[],
    depth: number,
    parentY: number,
    childSpans: { [key: string]: Span[] },
    containerWidth: number,
    collapsedSpans: Set<string>,
    traceStartTime: string,
    selectedSpan?: Span | null,
    onToggleCollapse?: (spanId: string) => void,
    onSpanSelect?: (span: Span) => void,
    onSelectTime?: (time: number) => void
  ) => {
    const yOffset = maxY.current + 36;

    const card = (
      <SpanCard
        span={span}
        parentY={parentY}
        activeSpans={activeSpans}
        yOffset={yOffset}
        childSpans={childSpans}
        containerWidth={containerWidth}
        depth={depth}
        selectedSpan={selectedSpan}
        collapsedSpans={collapsedSpans}
        traceStartTime={traceStartTime}
        onSpanSelect={onSpanSelect}
        onToggleCollapse={onToggleCollapse}
        onSelectTime={onSelectTime}
      />
    );

    treeElements.push(card);
    maxY.current = maxY.current + 36;

    const children = childSpans[span.spanId];
    if (!children) {
      return;
    }

    const py = maxY.current;

    if (collapsedSpans.has(span.spanId)) {
      return;
    }

    for (const childSpan of children) {
      recFn(
        treeElements,
        childSpan,
        activeSpans,
        depth + 1,
        py,
        childSpans,
        containerWidth,
        collapsedSpans,
        traceStartTime,
        selectedSpan,
        onToggleCollapse,
        onSpanSelect,
        onSelectTime
      );
    }
  };

  const renderTreeElements = useCallback((): ReactNode[] => {
    maxY.current = 0;

    let treeElements: React.ReactNode[] = [];

    for (const span of topLevelSpans) {
      recFn(
        treeElements,
        span,
        activeSpans,
        0,
        0,
        childSpans,
        containerWidth,
        collapsedSpans,
        String(trace?.startTime),
        selectedSpan,
        (spanId) => {
          setCollapsedSpans((prev) => {
            const next = new Set(prev);
            if (next.has(spanId)) {
              next.delete(spanId);
            } else {
              next.add(spanId);
            }
            return next;
          });
        },
        (span) => {
          const params = new URLSearchParams(searchParams);
          setSelectedSpan(span);
          setTimelineWidth(traceTreePanel.current!.getBoundingClientRect().width + 1);
          params.set("spanId", span.spanId);
          router.push(`${pathName}?${params.toString()}`);
        },
        (time) => {
          browserSessionRef.current?.goto(time);
        }
      );
    }

    return treeElements;
  }, [
    activeSpans,
    childSpans,
    collapsedSpans,
    containerWidth,
    pathName,
    recFn,
    router,
    selectedSpan,
    topLevelSpans,
    trace,
  ]);

  const handleResizeTreeView = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = treeViewWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(320, Math.min(containerWidth / 2, startWidth + moveEvent.clientX - startX));
        setTreeViewWidth(newWidth);

        // Only update timeline width when a span is selected
        if (selectedSpan) {
          setTimelineWidth(newWidth + 1);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [containerWidth, selectedSpan, treeViewWidth]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const treeElements = useMemo(() => renderTreeElements(), [renderTreeElements]);

  const virtualizer = useVirtualizer({
    count: treeElements.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full w-full overflow-clip">
      <div className="flex flex-none items-center border-b px-4 py-3.5 gap-2">
        <Link className="mr-2" href="/projects">
          <Image alt="Laminar AI logo" src={smallLogo} width={20} height={20} />
        </Link>
        <span>Trace</span>
        <MonoWithCopy className="text-secondary-foreground">{trace.id}</MonoWithCopy>
        <div className="flex-grow" />
        {selectedSpan && (
          <Button
            variant={"secondary"}
            onClick={() => {
              setSelectedSpan(null);
              setTimeout(() => {
                searchParams.delete("spanId");
                router.push(`${pathName}?${searchParams.toString()}`);
              }, 10);
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
              setShowBrowserSession((s) => !s);
            }}
          >
            <Disc size={16} className="mr-2" />
            {showBrowserSession ? "Hide browser session" : "Show browser session"}
          </Button>
        )}

        {trace?.agentSessionId && <AgentSessionButton sessionId={trace.agentSessionId} />}
      </div>
      <div className="flex-grow flex">
        {spans.length > 0 && (
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel>
              <div className="flex h-full w-full relative" ref={container}>
                <div
                  ref={scrollRef}
                  className="overflow-y-auto overflow-x-hidden flex-grow"
                  style={{
                    width: timelineWidth,
                    height: containerHeight,
                  }}
                >
                  <table className="w-full h-full">
                    <tbody className="w-full">
                      <tr
                        className="flex"
                        style={{
                          minHeight: containerHeight,
                        }}
                      >
                        <td
                          className={cn("p-0 left-0 bg-background flex-none", {
                            "sticky z-50": !selectedSpan,
                          })}
                          style={{
                            width: treeViewWidth,
                            maxWidth: treeViewWidth,
                            position: "relative",
                          }}
                        >
                          <div className="flex flex-col pb-4" ref={traceTreePanel}>
                            <StatsShields
                              className="px-2 h-10 sticky top-0 border-r bg-background z-50 border-b"
                              startTime={trace.startTime}
                              endTime={trace.endTime}
                              totalTokenCount={trace.totalTokenCount}
                              inputTokenCount={trace.inputTokenCount}
                              outputTokenCount={trace.outputTokenCount}
                              inputCost={trace.inputCost}
                              outputCost={trace.outputCost}
                              cost={trace.cost}
                            />

                            <div className={cn("flex flex-col pt-1")}>
                              <div
                                className="relative"
                                style={{
                                  height: virtualizer.getTotalSize(),
                                  width: "100%",
                                  position: "relative",
                                }}
                              >
                                <div
                                  className="pl-6"
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${items[0]?.start ?? 0}px)`,
                                  }}
                                >
                                  {items.map((virtualRow) => {
                                    const element = treeElements[virtualRow.index];
                                    return (
                                      <div
                                        key={virtualRow.key}
                                        ref={virtualizer.measureElement}
                                        data-index={virtualRow.index}
                                      >
                                        {element}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              {isEmpty(topLevelSpans) && (
                                <span className="text-base text-secondary-foreground mx-auto mt-4">
                                  No spans found.
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className="absolute top-0 right-0 h-full w-px hover:w-1 bg-border z-10 cursor-col-resize hover:bg-blue-400 transition-colors"
                            onMouseDown={handleResizeTreeView}
                          />
                        </td>
                        {!selectedSpan && (
                          <td className="flex flex-grow w-full p-0 relative">
                            <Timeline
                              scrollRef={scrollRef}
                              containerHeight={containerHeight}
                              spans={spans}
                              childSpans={childSpans}
                              collapsedSpans={collapsedSpans}
                              browserSessionTime={browserSessionTime}
                            />
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {selectedSpan && (
                  <div style={{ width: containerWidth - timelineWidth }}>
                    <SpanView span={selectedSpan} traceId={trace.id} />
                  </div>
                )}
              </div>
            </ResizablePanel>
            {showBrowserSession && <ResizableHandle withHandle />}
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
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
