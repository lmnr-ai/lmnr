"use client";

import { ChartNoAxesGantt, Disc } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";

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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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

  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get("spanId") ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null : null
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
                  className="flex-none"
                  style={{
                    width: timelineWidth,
                  }}
                >
                  <div className="flex-grow flex">
                    <ScrollArea
                      className="overflow-auto w-1 flex-grow"
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
                              className={cn("p-0 border-r left-0 bg-background flex-none", {
                                "sticky z-50": !selectedSpan,
                              })}
                            >
                              <div className="flex flex-col pb-4" ref={traceTreePanel}>
                                <StatsShields
                                  className="px-2 h-10 sticky top-0 bg-background z-50 border-b"
                                  startTime={trace.startTime}
                                  endTime={trace.endTime}
                                  totalTokenCount={trace.totalTokenCount}
                                  inputTokenCount={trace.inputTokenCount}
                                  outputTokenCount={trace.outputTokenCount}
                                  inputCost={trace.inputCost}
                                  outputCost={trace.outputCost}
                                  cost={trace.cost}
                                />
                                <div className="flex flex-col pt-1">
                                  {topLevelSpans.map((span, index) => (
                                    <div key={index} className="pl-6 relative">
                                      <SpanCard
                                        activeSpans={activeSpans}
                                        traceStartTime={trace.startTime}
                                        parentY={traceTreePanel.current?.getBoundingClientRect().y || 0}
                                        span={span}
                                        childSpans={childSpans}
                                        depth={1}
                                        selectedSpan={selectedSpan}
                                        containerWidth={timelineWidth}
                                        collapsedSpans={collapsedSpans}
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
                                          setSelectedSpan(span);
                                          setTimelineWidth(traceTreePanel.current!.getBoundingClientRect().width + 1);
                                          searchParams.set("spanId", span.spanId);
                                          router.push(`${pathName}?${searchParams.toString()}`);
                                        }}
                                        onSelectTime={(time) => {
                                          browserSessionRef.current?.goto(time);
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                            {!selectedSpan && (
                              <td className="flex flex-grow w-full p-0 relative">
                                <Timeline
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
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </div>
                </div>
                {selectedSpan && (
                  <div style={{ width: containerWidth - timelineWidth }}>
                    <SpanView key={selectedSpan.spanId} span={selectedSpan} traceId={trace.id} />
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
