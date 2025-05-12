import { useVirtualizer } from "@tanstack/react-virtual";
import { isEmpty } from "lodash";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { ReactNode, Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import SearchSpansInput from "@/components/traces/search-spans-input";
import Header from "@/components/traces/trace-view/header";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContext } from "@/contexts/project-context";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { Span, Trace } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { Button } from "../../ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import SessionPlayer, { SessionPlayerHandle } from "../session-player";
import { SpanCard } from "../span-card";
import { SpanView } from "../span-view";
import StatsShields from "../stats-shields";
import Timeline from "../timeline";

export interface TraceViewHandle {
  toggleBrowserSession: () => void;
  resetSelectedSpan: () => void;
}

interface TraceViewProps {
  traceId: string;
  propsTrace?: Trace;
  onClose: () => void;
  fullScreen?: boolean;
  ref?: Ref<TraceViewHandle>;
}

export default function TraceView({ traceId, onClose, propsTrace, fullScreen = false, ref }: TraceViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useProjectContext();
  const { toast } = useToast();

  const [isSpansLoading, setIsSpansLoading] = useState(false);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  // containerHeight refers to the height of the trace view container
  const [containerHeight, setContainerHeight] = useState(0);
  // containerWidth refers to the width of the trace view container
  const [containerWidth, setContainerWidth] = useState(0);
  const traceTreePanel = useRef<HTMLDivElement>(null);
  // here timelineWidth refers to the width of the trace tree panel AND waterfall timeline
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [showBrowserSession, setShowBrowserSession] = useState(false);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const [trace, setTrace] = useState<Trace | null>(null);

  const [spans, setSpans] = useState<Span[]>([]);

  useImperativeHandle(
    ref,
    () => ({
      toggleBrowserSession: () => setShowBrowserSession((prev) => !prev),
      resetSelectedSpan: () => {
        setSelectedSpan(null);
        setTimeout(() => {
          const params = new URLSearchParams(searchParams);
          params.delete("spanId");
          router.push(`${pathName}?${params.toString()}`);
        }, 10);
      },
    }),
    [searchParams, pathName, router]
  );

  const [childSpans, setChildSpans] = useState<{ [key: string]: Span[] }>({});
  const [topLevelSpans, setTopLevelSpans] = useState<Span[]>([]);

  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get("spanId") ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null : null
  );

  const [activeSpans, setActiveSpans] = useState<string[]>([]);

  // Add new state for collapsed spans
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [browserSessionTime, setBrowserSessionTime] = useState<number | null>(null);

  const handleFetchTrace = useCallback(async () => {
    try {
      setIsTraceLoading(true);
      if (propsTrace) {
        setTrace(propsTrace);
      } else {
        const response = await fetch(`/api/projects/${projectId}/traces/${traceId}`);
        if (!response.ok) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load trace. Please try again.",
          });
          return;
        }
        const traceData = await response.json();
        setTrace(traceData);
        if (traceData.hasBrowserSession) {
          setShowBrowserSession(true);
        }
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load trace. Please try again.",
      });
    } finally {
      setIsTraceLoading(false);
    }
  }, [projectId, propsTrace, toast, traceId]);

  useEffect(() => {
    handleFetchTrace();
  }, [handleFetchTrace, projectId, traceId]);

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

  const fetchSpans = useCallback(
    async (search: string, searchIn: string[]) => {
      try {
        setIsSpansLoading(true);
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (searchIn && searchIn.length > 0) {
          searchIn.forEach((val) => params.append("searchIn", val));
        }
        const url = `/api/projects/${projectId}/traces/${traceId}/spans?${params.toString()}`;
        const response = await fetch(url);
        const results = await response.json();
        const spans = enrichSpansWithPending(results);

        setSpans(spans);

        // If there's only one span, select it automatically
        if (spans.length === 1) {
          const params = new URLSearchParams(searchParams);
          const singleSpan = spans[0];
          setSelectedSpan(singleSpan);
          params.set("spanId", singleSpan.spanId);
          params.set("traceId", traceId);
          router.push(`${pathName}?${params.toString()}`);
        } else {
          setSelectedSpan(
            searchParams.get("spanId")
              ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null
              : null
          );
        }
      } catch (e) {
      } finally {
        setIsSpansLoading(false);
      }
    },
    [projectId, traceId, setSpans, setSelectedSpan, searchParams, router, pathName]
  );

  useEffect(() => {
    const search = searchParams.get("search") || "";
    const searchIn = searchParams.getAll("searchIn");

    fetchSpans(search, searchIn);

    return () => {
      setTrace(null);
      setSpans([]);
      setShowBrowserSession(false);
    };
  }, [traceId, projectId, router]);

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

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("spanId");
    router.push(`${pathName}?${params.toString()}`);
    onClose();
  }, [onClose, pathName, router, searchParams]);

  const handleTimelineChange = useCallback(
    (time: number) => {
      setBrowserSessionTime(time);

      const activeSpans = spans.filter((span: Span) => {
        const spanStartTime = new Date(span.startTime).getTime();
        const spanEndTime = new Date(span.endTime).getTime();

        return spanStartTime <= time && spanEndTime >= time && span.parentSpanId !== null;
      });

      setActiveSpans(activeSpans.map((span) => span.spanId));
    },
    [spans]
  );

  useEffect(() => {
    const search = searchParams.get("search") || "";
    const searchIn = searchParams.getAll("searchIn");

    fetchSpans(search, searchIn);

    return () => {
      setTrace(null);
      setSpans([]);
      setShowBrowserSession(false);
    };
  }, [traceId, projectId, router]);

  useEffect(() => {
    const selectedSpan = spans.find((span: Span) => span.spanId === searchParams.get("spanId"));
    if (selectedSpan) {
      setSelectedSpan(selectedSpan);
    }
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

  const [searchEnabled, setSearchEnabled] = useState(!!searchParams.get("search"));

  useEffect(() => {
    if (!traceTreePanel.current) {
      return;
    }

    requestAnimationFrame(() => {
      const newTraceTreePanelWidth = traceTreePanel.current?.getBoundingClientRect().width || 0;

      if (!selectedSpan) {
        setTimelineWidth(containerWidth);
      } else {
        setTimelineWidth(newTraceTreePanelWidth + 1);
      }
    });
  }, [containerWidth, selectedSpan]);

  const dbSpanRowToSpan = (row: Record<string, any>): Span => ({
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    traceId: row.trace_id,
    spanType: row.span_type,
    name: row.name,
    path: row.attributes["lmnr.span.path"] ?? "",
    startTime: row.start_time,
    endTime: row.end_time,
    attributes: row.attributes,
    input: null,
    output: null,
    inputPreview: row.input_preview,
    outputPreview: row.output_preview,
    events: [],
    inputUrl: row.input_url,
    outputUrl: row.output_url,
    model: row.attributes["gen_ai.response.model"] ?? row.attributes["gen_ai.request.model"] ?? null,
  });

  const { supabaseClient: supabase } = useUserContext();

  useEffect(() => {
    if (!supabase || !traceId) {
      return;
    }

    const channel = supabase
      .channel(`trace-updates-${traceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "spans",
          filter: `trace_id=eq.${traceId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const rtEventSpan = dbSpanRowToSpan(payload.new);

            if (rtEventSpan.attributes["lmnr.internal.has_browser_session"]) {
              setShowBrowserSession(true);
            }

            setTrace((currentTrace: Trace | null) => {
              if (!currentTrace) {
                return null;
              }

              const newTrace = { ...currentTrace };
              newTrace.endTime = new Date(
                Math.max(new Date(newTrace.endTime).getTime(), new Date(rtEventSpan.endTime).getTime())
              ).toUTCString();
              newTrace.totalTokenCount +=
                (rtEventSpan.attributes["gen_ai.usage.input_tokens"] ?? 0) +
                (rtEventSpan.attributes["gen_ai.usage.output_tokens"] ?? 0);
              newTrace.inputTokenCount += rtEventSpan.attributes["gen_ai.usage.input_tokens"] ?? 0;
              newTrace.outputTokenCount += rtEventSpan.attributes["gen_ai.usage.output_tokens"] ?? 0;
              newTrace.inputCost += rtEventSpan.attributes["gen_ai.usage.input_cost"] ?? 0;
              newTrace.outputCost += rtEventSpan.attributes["gen_ai.usage.output_cost"] ?? 0;
              newTrace.cost +=
                (rtEventSpan.attributes["gen_ai.usage.input_cost"] ?? 0) +
                (rtEventSpan.attributes["gen_ai.usage.output_cost"] ?? 0);
              newTrace.hasBrowserSession =
                currentTrace.hasBrowserSession || rtEventSpan.attributes["lmnr.internal.has_browser_session"];

              return newTrace;
            });

            setSpans((currentSpans) => {
              const newSpans = [...currentSpans];
              const index = newSpans.findIndex((span) => span.spanId === rtEventSpan.spanId);
              if (index !== -1 && newSpans[index].pending) {
                newSpans[index] = rtEventSpan;
              } else {
                newSpans.push(rtEventSpan);
              }

              return enrichSpansWithPending(newSpans);
            });
          }
        }
      )
      .subscribe();

    // Remove only this specific channel on cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, traceId]);

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

  const recFn = useCallback(
    (
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
    },
    []
  );

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

  const isLoading = !trace || spans?.length === 0 || isSpansLoading || isTraceLoading;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <Header
        selectedSpan={selectedSpan}
        trace={trace}
        fullScreen={fullScreen}
        handleClose={handleClose}
        setSelectedSpan={setSelectedSpan}
        showBrowserSession={showBrowserSession}
        setShowBrowserSession={setShowBrowserSession}
        handleFetchTrace={handleFetchTrace}
      />
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel>
          <div className="flex h-full w-full relative" ref={container}>
            <ScrollArea
              ref={scrollRef}
              className={cn("overflow-y-auto overflow-x-hidden flex-grow")}
              style={{
                width: timelineWidth || "100%",
                height: containerHeight || "100%",
              }}
            >
              {isLoading ? (
                <div className="w-full p-4 h-full flex flex-col gap-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
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
                          {searchEnabled ? (
                            <SearchSpansInput
                              setSearchEnabled={setSearchEnabled}
                              submit={fetchSpans}
                              filterBoxClassName="top-10"
                              className="rounded-none border-0 border-b ring-0"
                            />
                          ) : (
                            <StatsShields
                              className="px-2 h-10 border-r box-border sticky top-0 bg-background z-50 border-b w-full"
                              startTime={trace.startTime}
                              endTime={trace.endTime}
                              totalTokenCount={trace.totalTokenCount}
                              inputTokenCount={trace.inputTokenCount}
                              outputTokenCount={trace.outputTokenCount}
                              inputCost={trace.inputCost}
                              outputCost={trace.outputCost}
                              cost={trace.cost}
                            >
                              <Button
                                size="icon"
                                onClick={() => setSearchEnabled(true)}
                                variant="outline"
                                className="h-[22px] w-[22px]"
                              >
                                <Search size={14} />
                              </Button>
                            </StatsShields>
                          )}

                          <div className={cn("flex flex-col pt-1", { "gap-y-2 px-2 mt-1": isSpansLoading })}>
                            {isSpansLoading ? (
                              <>
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                              </>
                            ) : (
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
                            )}
                            {!isSpansLoading && isEmpty(topLevelSpans) && (
                              <span className="text-base text-secondary-foreground mx-auto mt-4">No spans found.</span>
                            )}
                          </div>
                        </div>
                        <div
                          className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
                          onMouseDown={handleResizeTreeView}
                        >
                          <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-colors" />
                        </div>
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
              )}
            </ScrollArea>
            {selectedSpan && !isLoading && (
              <div style={{ width: containerWidth - timelineWidth }}>
                <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} />
              </div>
            )}
          </div>
        </ResizablePanel>
        {showBrowserSession && <ResizableHandle className="z-50" withHandle />}
        <ResizablePanel
          style={{
            display: showBrowserSession ? "block" : "none",
          }}
        >
          {!isLoading && (
            <SessionPlayer
              ref={browserSessionRef}
              hasBrowserSession={trace.hasBrowserSession}
              traceId={traceId}
              onTimelineChange={handleTimelineChange}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
