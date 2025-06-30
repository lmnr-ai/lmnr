import { has } from "lodash";
import { ChartNoAxesGantt, ListFilter, Minus, Plus, Search } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import Header from "@/components/traces/trace-view/header";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view";
import SearchSpansInput from "@/components/traces/trace-view/search-spans-input";
import { enrichSpansWithPending, filterColumns } from "@/components/traces/trace-view/utils";
import { StatefulFilter, StatefulFilterList } from "@/components/ui/datatable-filter";
import { useFiltersContextProvider } from "@/components/ui/datatable-filter/context";
import { DatatableFilter } from "@/components/ui/datatable-filter/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { SPAN_KEYS } from "@/lib/lang-graph/types";
import { Span, SpanType, Trace } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { Button } from "../../ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import SessionPlayer, { SessionPlayerHandle } from "../session-player";
import { SpanView } from "../span-view";
import Timeline from "./timeline";
import Tree from "./tree";

export interface TraceViewHandle {
  toggleBrowserSession: () => void;
  toggleLangGraph: () => void;
}

interface TraceViewProps {
  traceId: string;
  propsTrace?: Trace;
  onClose: () => void;
  fullScreen?: boolean;
  ref?: Ref<TraceViewHandle>;
  onLangGraphDetected?: (detected: boolean) => void;
}

const MAX_ZOOM = 3;
const MIN_ZOOM = 1;
const ZOOM_INCREMENT = 0.5;
const MIN_TREE_VIEW_WIDTH = 500;

export default function TraceView({
  traceId,
  onClose,
  onLangGraphDetected,
  propsTrace,
  fullScreen = false,
  ref,
}: TraceViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();
  const { toast } = useToast();

  const { value: filters } = useFiltersContextProvider();
  const [isSpansLoading, setIsSpansLoading] = useState(false);
  const [isTraceLoading, setIsTraceLoading] = useState(false);

  const [showBrowserSession, setShowBrowserSession] = useState(false);
  const [showLangGraph, setShowLangGraph] = useState(true);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const [trace, setTrace] = useState<Trace | null>(null);

  const [spans, setSpans] = useState<Span[]>([]);

  const hasLangGraph = useMemo(
    () => !!spans.find((s) => s.attributes && has(s.attributes, SPAN_KEYS.NODES) && has(s.attributes, SPAN_KEYS.EDGES)),
    [spans]
  );

  useEffect(() => {
    if (hasLangGraph) {
      onLangGraphDetected?.(true);
    }
  }, [hasLangGraph, onLangGraphDetected]);

  useImperativeHandle(
    ref,
    () => ({
      toggleBrowserSession: () => setShowBrowserSession((prev) => !prev),
      toggleLangGraph: () => setShowLangGraph((prev) => !prev),
    }),
    []
  );

  const [childSpans, setChildSpans] = useState<{ [key: string]: Span[] }>({});
  const [topLevelSpans, setTopLevelSpans] = useState<Span[]>([]);

  const [selectedSpan, setSelectedSpan] = useState<Span | null>(
    searchParams.get("spanId") ? spans.find((span: Span) => span.spanId === searchParams.get("spanId")) || null : null
  );

  const [activeSpans, setActiveSpans] = useState<string[]>([]);

  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [browserSessionTime, setBrowserSessionTime] = useState<number | null>(null);

  const [showTimeline, setShowTimeline] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_INCREMENT, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_INCREMENT, MIN_ZOOM));
  }, []);

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

  // Add span path local storage functions
  const saveSpanPathToStorage = useCallback((spanPath: string[]) => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("trace-view:span-path", JSON.stringify(spanPath));
      }
    } catch (e) {
      console.error("Failed to save span path:", e);
    }
  }, []);

  const loadSpanPathFromStorage = useCallback((): string[] | null => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("trace-view:span-path");
        return saved ? JSON.parse(saved) : null;
      }
      return null;
    } catch (e) {
      console.error("Failed to load span path:", e);
      return null;
    }
  }, []);

  // Helper function to compare span paths (arrays)
  const spanPathsEqual = useCallback((path1: string[] | null, path2: string[] | null): boolean => {
    if (!path1 || !path2) return false;
    if (path1.length !== path2.length) return false;
    return path1.every((item, index) => item === path2[index]);
  }, []);

  // Create wrapper function for span selection that saves path
  const handleSpanSelect = useCallback(
    (span: Span | null) => {
      if (!span) return;

      setSelectedSpan(span);

      // Save span path to local storage
      const spanPath = span.attributes?.["lmnr.span.path"];
      if (spanPath && Array.isArray(spanPath)) {
        saveSpanPathToStorage(spanPath);
      }

      // Update URL with spanId
      const params = new URLSearchParams(searchParams);
      params.set("spanId", span.spanId);
      router.push(`${pathName}?${params.toString()}`);
    },
    [saveSpanPathToStorage, searchParams, router, pathName]
  );

  const fetchSpans = useCallback(
    async (search: string, searchIn: string[], filters: DatatableFilter[]) => {
      try {
        setIsSpansLoading(true);

        const params = new URLSearchParams();
        if (search) {
          params.set("search", search);
          setSearchEnabled(true);
        }
        if (searchIn && searchIn.length > 0) {
          searchIn.forEach((val) => params.append("searchIn", val));
        }

        if (filters && filters.length > 0) {
          filters.forEach((filter) => params.append("filter", JSON.stringify(filter)));
        }

        const url = `/api/projects/${projectId}/traces/${traceId}/spans?${params.toString()}`;
        const response = await fetch(url);
        const results = await response.json();
        const spans = enrichSpansWithPending(results);

        setSpans(spans);

        // Determine which span to select
        const spanIdFromUrl = spans.find((span) => span.spanId === searchParams.get("spanId")) || null;
        let spanToSelect: Span | null = null;

        if (spanIdFromUrl) {
          // First priority: span from URL
          spanToSelect = spanIdFromUrl;
        } else {
          // Second priority: span matching saved path
          const savedPath = loadSpanPathFromStorage();
          if (savedPath) {
            spanToSelect =
              spans.find((span: Span) => {
                const spanPath = span.attributes?.["lmnr.span.path"];
                return spanPath && Array.isArray(spanPath) && spanPathsEqual(spanPath, savedPath);
              }) || null;
          }
        }

        // Fallback to first span
        if (!spanToSelect && spans.length > 0) {
          spanToSelect = spans[0];
        }

        if (spanToSelect) {
          setSelectedSpan(spanToSelect);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSpansLoading(false);
      }
    },
    [projectId, traceId, searchParams, loadSpanPathFromStorage, spanPathsEqual, router, pathName]
  );

  useEffect(() => {
    const search = searchParams.get("search") || "";
    const searchIn = searchParams.getAll("searchIn");

    fetchSpans(search, searchIn, filters);

    return () => {
      setSpans([]);
      setShowBrowserSession(false);
      setSearchEnabled(false);
    };
  }, [traceId, projectId, router, filters]);

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
        return savedWidth ? Math.max(MIN_TREE_VIEW_WIDTH, parseInt(savedWidth, 10)) : MIN_TREE_VIEW_WIDTH;
      }
      return MIN_TREE_VIEW_WIDTH;
    } catch (e) {
      return MIN_TREE_VIEW_WIDTH;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("trace-view:tree-view-width", treeViewWidth.toString());
      }
    } catch (e) {}
  }, [treeViewWidth]);

  const isLoading = !trace || (isSpansLoading && isTraceLoading);

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

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <div className="flex items-center gap-x-2 p-2 border-b h-12">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex flex-col p-2 gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel className="flex size-full">
          <div className="flex h-full flex-col flex-none relative" style={{ width: treeViewWidth }}>
            <Header
              selectedSpan={selectedSpan}
              trace={trace}
              fullScreen={fullScreen}
              handleClose={handleClose}
              showBrowserSession={showBrowserSession}
              setShowBrowserSession={setShowBrowserSession}
              handleFetchTrace={handleFetchTrace}
              hasLangGraph={hasLangGraph}
              setShowLangGraph={setShowLangGraph}
              showLangGraph={showLangGraph}
            />
            {searchEnabled ? (
              <SearchSpansInput
                setSearchEnabled={setSearchEnabled}
                submit={fetchSpans}
                filterBoxClassName="top-10"
                className="rounded-none border-0 border-b ring-0"
              />
            ) : (
              <div className="flex flex-col gap-1 px-2 py-2 border-b box-border">
                <div className="flex items-center gap-2">
                  <StatefulFilter columns={filterColumns}>
                    <Button variant="outline" className="h-6 text-xs">
                      <ListFilter size={14} className="mr-1" />
                      Filters
                    </Button>
                  </StatefulFilter>
                  <Button onClick={() => setSearchEnabled(true)} variant="outline" className="h-6 text-xs px-1.5">
                    <Search size={14} className="mr-1" />
                    <span>Search</span>
                  </Button>
                  <Button
                    onClick={() => setShowTimeline((prev) => !prev)}
                    variant="outline"
                    className={cn("h-6 text-xs px-1.5", {
                      "border-primary text-primary": showTimeline,
                    })}
                  >
                    <ChartNoAxesGantt size={14} className="mr-1" />
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
                <StatefulFilterList className="py-[3px] text-xs px-1" />
              </div>
            )}
            {showTimeline ? (
              <Timeline
                setSelectedSpan={handleSpanSelect}
                selectedSpan={selectedSpan}
                spans={spans}
                childSpans={childSpans}
                collapsedSpans={collapsedSpans}
                browserSessionTime={browserSessionTime}
                zoomLevel={zoomLevel}
              />
            ) : (
              <Tree
                topLevelSpans={topLevelSpans}
                childSpans={childSpans}
                activeSpans={activeSpans}
                collapsedSpans={collapsedSpans}
                containerWidth={treeViewWidth}
                selectedSpan={selectedSpan}
                trace={trace}
                isSpansLoading={isSpansLoading}
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
                onSpanSelect={handleSpanSelect}
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
          <div className="flex-grow overflow-hidden flex-wrap">
            {selectedSpan ? (
              selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
                <HumanEvaluatorSpanView spanId={selectedSpan.spanId} key={selectedSpan.spanId} />
              ) : (
                <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} />
              )
            ) : (
              <div className="flex flex-col items-center justify-center size-full text-muted-foreground">
                <span className="text-xl font-medium mb-2">No span selected</span>
                <span className="text-base">Select a span from the trace tree to view its details</span>
              </div>
            )}
          </div>
        </ResizablePanel>
        {showBrowserSession && (
          <>
            <ResizableHandle className="z-50" withHandle />
            <ResizablePanel>
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
        {showLangGraph && hasLangGraph && <LangGraphView spans={spans} />}
      </ResizablePanelGroup>
    </div>
  );
}
