import { ChartNoAxesGantt, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Ref, useCallback, useEffect, useImperativeHandle, useState, useRef } from "react";

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
import { SpanView } from "../span-view";
import StatsShields from "../stats-shields";
import Timeline from "../timeline";
import Tree from "./tree";

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

  const [showTimeline, setShowTimeline] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
              : spans[0]
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
    const selectedSpan = spans.find((span: Span) => span.spanId === searchParams.get("spanId"));
    if (selectedSpan) {
      setSelectedSpan(selectedSpan);
    }
  }, [searchParams, spans]);

  const [searchEnabled, setSearchEnabled] = useState(!!searchParams.get("search"));

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
    } catch (e) { }
  }, [treeViewWidth]);

  const isLoading = !trace || spans?.length === 0 || isSpansLoading || isTraceLoading;

  // Add back the handleResizeTreeView function
  const handleResizeTreeView = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = treeViewWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(320, startWidth + moveEvent.clientX - startX);
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

  if (isLoading) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidde p-2 gap-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

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
          <div className="flex h-full w-full">
            <div className="flex h-full flex-col flex-none relative" style={{ width: treeViewWidth }}>
              <div className="flex flex-col gap-y-2 w-full">
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
                    <Button
                      size="icon"
                      onClick={() => setShowTimeline(!showTimeline)}
                      variant="outline"
                      className="h-[22px] w-[22px]"
                    >
                      <ChartNoAxesGantt size={14} />
                    </Button>
                  </StatsShields>
                )}
              </div>
              {showTimeline ? (
                <Timeline
                  scrollRef={scrollRef}
                  containerHeight={scrollRef.current?.clientHeight || 0}
                  spans={spans}
                  childSpans={childSpans}
                  collapsedSpans={collapsedSpans}
                  browserSessionTime={browserSessionTime}
                />
              ) : (
                <Tree
                  spans={spans}
                  topLevelSpans={topLevelSpans}
                  childSpans={childSpans}
                  activeSpans={activeSpans}
                  collapsedSpans={collapsedSpans}
                  containerWidth={treeViewWidth}
                  selectedSpan={selectedSpan}
                  trace={trace}
                  isSpansLoading={isSpansLoading}
                  scrollRef={scrollRef}
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
              )}
              <div
                className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
                onMouseDown={handleResizeTreeView}
              >
                <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-colors" />
              </div>
            </div>
            {selectedSpan && (
              <div className="flex-grow">
                <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} />
              </div>
            )}
          </div>
        </ResizablePanel>
        {showBrowserSession && (
          <>
            <ResizableHandle className="z-50" withHandle />
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
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
