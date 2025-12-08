import { get } from "lodash";
import { AlertTriangle, ChartNoAxesGantt, FileText, ListFilter, Minus, Plus, Search, Sparkles } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";

import Header from "@/components/traces/trace-view/header";
import { HumanEvaluatorSpanView } from "@/components/traces/trace-view/human-evaluator-span-view";
import LangGraphView from "@/components/traces/trace-view/lang-graph-view.tsx";
import Metadata from "@/components/traces/trace-view/metadata";
import Minimap from "@/components/traces/trace-view/minimap.tsx";
import SearchSpansInput from "@/components/traces/trace-view/search-spans-input.tsx";
import TraceViewStoreProvider, {
  MAX_ZOOM,
  MIN_TREE_VIEW_WIDTH,
  MIN_ZOOM,
  TraceViewSpan,
  TraceViewTrace,
  useTraceViewStoreContext,
} from "@/components/traces/trace-view/trace-view-store.tsx";
import {
  enrichSpansWithPending,
  filterColumns,
  findSpanToSelect,
  onRealtimeUpdateSpans,
} from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button.tsx";
import { StatefulFilter, StatefulFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { useFiltersContextProvider } from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils.ts";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable";
import SessionPlayer from "../session-player";
import { SpanView } from "../span-view";
import Chat from "./chat";
import { ScrollContextProvider } from "./scroll-context";
import Timeline from "./timeline";
import Tree from "./tree";

interface TraceViewProps {
  traceId: string;
  // Span id here to control span selection by spans table
  spanId?: string;
  propsTrace?: TraceViewTrace;
  onClose: () => void;
}

const PureTraceView = ({ traceId, spanId, onClose, propsTrace }: TraceViewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useParams();

  // Data states
  const {
    selectedSpan,
    setSelectedSpan,
    spans,
    setSpans,
    trace,
    setTrace,
    isSpansLoading,
    isTraceLoading,
    setIsTraceLoading,
    setIsSpansLoading,
    traceError,
    setTraceError,
    spansError,
    setSpansError,
  } = useTraceViewStoreContext((state) => ({
    selectedSpan: state.selectedSpan,
    setSelectedSpan: state.setSelectedSpan,
    spans: state.spans,
    setSpans: state.setSpans,
    trace: state.trace,
    setTrace: state.setTrace,
    isTraceLoading: state.isTraceLoading,
    isSpansLoading: state.isSpansLoading,
    setIsSpansLoading: state.setIsSpansLoading,
    setIsTraceLoading: state.setIsTraceLoading,
    traceError: state.traceError,
    setTraceError: state.setTraceError,
    spansError: state.spansError,
    setSpansError: state.setSpansError,
  }));

  // UI states
  const {
    tab,
    setTab,
    search,
    setSearch,
    searchEnabled,
    setSearchEnabled,
    browserSession,
    setBrowserSession,
    zoom,
    handleZoom,
    langGraph,
    getHasLangGraph,
    hasBrowserSession,
    setHasBrowserSession,
  } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    search: state.search,
    setSearch: state.setSearch,
    searchEnabled: state.searchEnabled,
    setSearchEnabled: state.setSearchEnabled,
    zoom: state.zoom,
    handleZoom: state.setZoom,
    browserSession: state.browserSession,
    setBrowserSession: state.setBrowserSession,
    setBrowserSessionTime: state.setSessionTime,
    langGraph: state.langGraph,
    getHasLangGraph: state.getHasLangGraph,
    hasBrowserSession: state.hasBrowserSession,
    setHasBrowserSession: state.setHasBrowserSession,
  }));

  // Local storage states
  const { treeWidth, spanPath, setSpanPath, setTreeWidth } = useTraceViewStoreContext((state) => ({
    treeWidth: state.treeWidth,
    setTreeWidth: state.setTreeWidth,
    spanPath: state.spanPath,
    setSpanPath: state.setSpanPath,
  }));

  const { value: filters } = useFiltersContextProvider();
  const hasLangGraph = useMemo(() => getHasLangGraph(), [getHasLangGraph]);
  const llmSpanIds = useMemo(
    () =>
      spans
        .filter((span) => span.spanType === SpanType.LLM)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .map((span) => span.spanId),
    [spans]
  );

  const handleFetchTrace = useCallback(async () => {
    try {
      setIsTraceLoading(true);
      setTraceError(undefined);

      if (propsTrace) {
        setTrace(propsTrace);
      } else {
        const response = await fetch(`/api/projects/${projectId}/traces/${traceId}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          const errorMessage = errorData.error || "Failed to load trace";

          setTraceError(errorMessage);
          return;
        }

        const traceData = (await response.json()) as TraceViewTrace;
        if (traceData.hasBrowserSession) {
          setHasBrowserSession(true);
          setBrowserSession(true);
        }
        setTrace(traceData);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to load trace. Please try again.";
      setTraceError(errorMessage);
    } finally {
      setIsTraceLoading(false);
    }
  }, [projectId, propsTrace, setIsTraceLoading, setTrace, setTraceError, traceId]);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (!span) return;

      setSelectedSpan(span);

      const spanPath = span.attributes?.["lmnr.span.path"];
      if (spanPath && Array.isArray(spanPath)) {
        setSpanPath(spanPath);
      }

      const currentSpanId = searchParams.get("spanId");
      if (currentSpanId !== span.spanId) {
        const params = new URLSearchParams(searchParams);
        params.set("spanId", span.spanId);
        router.push(`${pathName}?${params.toString()}`);
      }
    },
    [setSelectedSpan, searchParams, setSpanPath, router, pathName]
  );

  const fetchSpans = useCallback(
    async (search: string, searchIn: string[], filters: Filter[]) => {
      try {
        setIsSpansLoading(true);
        setSpansError(undefined);

        const params = new URLSearchParams();
        if (search) {
          params.set("search", search);
        }
        searchIn.forEach((val) => params.append("searchIn", val));
        filters.forEach((filter) => params.append("filter", JSON.stringify(filter)));

        setSearch(search);
        if (search) {
          setSearchEnabled(true);
        }

        const url = `/api/projects/${projectId}/traces/${traceId}/spans?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          const errorMessage = errorData.error || "Failed to load spans";

          setSpansError(errorMessage);
          return;
        }

        const results = (await response.json()) as TraceViewSpan[];
        const spans = search || filters?.length > 0 ? results : enrichSpansWithPending(results);

        setSpans(spans);

        if (spans.some((s) => Boolean(get(s.attributes, "lmnr.internal.has_browser_session"))) && !hasBrowserSession) {
          setHasBrowserSession(true);
          setBrowserSession(true);
        }

        if (spans.length > 0) {
          const selectedSpan = findSpanToSelect(spans, spanId, searchParams, spanPath);
          setSelectedSpan(selectedSpan);
        } else {
          setSelectedSpan(undefined);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Failed to load spans";
        setSpansError(errorMessage);

        console.error(e);
      } finally {
        setIsSpansLoading(false);
      }
    },
    [
      setIsSpansLoading,
      setSpansError,
      setSearch,
      setSearchEnabled,
      projectId,
      traceId,
      setSpans,
      hasBrowserSession,
      setHasBrowserSession,
      setBrowserSession,
      spanId,
      searchParams,
      spanPath,
      setSelectedSpan,
    ]
  );

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("spanId");
    router.push(`${pathName}?${params.toString()}`);
    onClose();
  }, [onClose, pathName, router, searchParams]);

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
    [setTreeWidth, treeWidth]
  );

  const handleToggleSearch = useCallback(() => {
    if (searchEnabled) {
      if (search !== "") {
        fetchSpans("", ["input", "output"], []);
      }
      setSearch("");
    }
    setSearchEnabled(!searchEnabled);
  }, [fetchSpans, searchEnabled, setSearch, setSearchEnabled, search]);

  const isLoading = isTraceLoading && !trace;

  useEffect(() => {
    if (!isSpansLoading) {
      const span = spans?.find((s) => s.spanId === spanId);
      if (spanId && span) {
        setSelectedSpan(span);
      }
    }
  }, [isSpansLoading, setSelectedSpan, spanId, spans]);

  useEffect(() => {
    handleFetchTrace();
  }, [handleFetchTrace, projectId, traceId]);

  useEffect(() => {
    const searchTerm = searchParams.get("search") || search || "";
    const searchIn = searchParams.getAll("searchIn");

    fetchSpans(searchTerm, searchIn, filters);

    return () => {
      setSpans([]);
      setBrowserSession(false);
      setSearch("");
      setSearchEnabled(false);
      setTraceError(undefined);
      setSpansError(undefined);
    };
  }, [
    traceId,
    projectId,
    filters,
    setSpans,
    setBrowserSession,
    setSearch,
    setSearchEnabled,
    setTraceError,
    setSpansError,
  ]);

  useRealtime({
    key: `trace_${traceId}`,
    projectId: projectId as string,
    enabled: !!traceId && !!projectId,
    eventHandlers: {
      span_update: (event) => {
        const payload = JSON.parse(event.data);
        if (payload.spans && Array.isArray(payload.spans)) {
          for (const span of payload.spans) {
            onRealtimeUpdateSpans(setSpans, setTrace, setBrowserSession)(span);
          }
        }
      },
    },
  });

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

  if (traceError) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <Header handleClose={handleClose} />
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="max-w-md mx-auto">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-destructive mb-4">Error Loading Trace</h3>
            <p className="text-sm text-muted-foreground">{traceError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollContextProvider>
      <div className="flex h-full w-full">
        <div className="flex h-full flex-col flex-none relative" style={{ width: treeWidth }}>
          <Header handleClose={handleClose} />
          <div className="flex flex-col gap-2 px-2 pb-2 border-b box-border">
            <div className="flex items-center gap-2 flex-nowrap w-full overflow-x-auto no-scrollbar">
              <StatefulFilter columns={filterColumns}>
                <Button variant="outline" className="h-6 text-xs">
                  <ListFilter size={14} className="mr-1" />
                  Filters
                </Button>
              </StatefulFilter>
              <Button
                onClick={handleToggleSearch}
                variant="outline"
                className={cn("h-6 text-xs px-1.5", {
                  "border-primary text-primary": search || searchEnabled,
                })}
              >
                <Search size={14} className="mr-1" />
                <span>Search</span>
              </Button>
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
              <Button
                onClick={() => setTab("metadata")}
                variant="outline"
                className={cn("h-6 text-xs px-1.5", {
                  "border-primary text-primary": tab === "metadata",
                })}
              >
                <FileText size={14} className="mr-1" />
                <span>Metadata</span>
              </Button>
              <Button
                onClick={() => setTab("chat")}
                variant="outline"
                className={cn("h-6 text-xs text-primary px-1.5", {
                  "border-primary": tab === "chat",
                })}
              >
                <Sparkles size={14} className="mr-1" />
                <span className="truncate min-w-0">Ask AI</span>
              </Button>
              {tab === "timeline" && (
                <>
                  <Button
                    disabled={zoom === MAX_ZOOM}
                    className="size-6 min-w-6 ml-auto"
                    variant="outline"
                    size="icon"
                    onClick={() => handleZoom("in")}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    disabled={zoom === MIN_ZOOM}
                    className="size-6 min-w-6"
                    variant="outline"
                    size="icon"
                    onClick={() => handleZoom("out")}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
            <StatefulFilterList className="py-[3px] text-xs px-1" />
          </div>
          {(search || searchEnabled) && (
            <SearchSpansInput
              submit={fetchSpans}
              filterBoxClassName="top-10"
              className="rounded-none w-full border-0 border-b ring-0 bg-background"
            />
          )}
          {spansError ? (
            <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
              <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
              <h4 className="text-sm font-semibold text-destructive mb-2">Error Loading Spans</h4>
              <p className="text-xs text-muted-foreground">{spansError}</p>
            </div>
          ) : (
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
                {tab === "metadata" && trace && <Metadata trace={trace} />}
                {tab === "chat" && trace && (
                  <Chat
                    trace={trace}
                    onSetSpanId={(spanId) => {
                      const span = spans.find((span) => span.spanId === spanId);
                      if (span) {
                        handleSpanSelect(span);
                      }
                    }}
                  />
                )}
                {tab === "timeline" && <Timeline />}
                {tab === "tree" &&
                  (isSpansLoading ? (
                    <div className="flex flex-col gap-2 p-2 pb-4 w-full min-w-full">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    <div className="flex flex-1 h-full overflow-hidden relative">
                      <Tree onSpanSelect={handleSpanSelect} />
                      <Minimap onSpanSelect={handleSpanSelect} />
                    </div>
                  ))}
              </ResizablePanel>
              {browserSession && (
                <>
                  <ResizableHandle className="z-50" withHandle />
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
          <div
            className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
            onMouseDown={handleResizeTreeView}
          >
            <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-colors" />
          </div>
        </div>
        <div className="grow overflow-hidden flex-wrap h-full w-full">
          {isSpansLoading ? (
            <div className="flex flex-col space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : selectedSpan ? (
            selectedSpan.spanType === SpanType.HUMAN_EVALUATOR ? (
              <HumanEvaluatorSpanView
                traceId={selectedSpan.traceId}
                spanId={selectedSpan.spanId}
                key={selectedSpan.spanId}
              />
            ) : (
              <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={traceId} />
            )
          ) : (
            <div className="flex flex-col items-center justify-center size-full text-muted-foreground">
              <span className="text-xl font-medium mb-2">No span selected</span>
              <span className="text-base">Select a span from the trace tree to view its details</span>
            </div>
          )}
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
